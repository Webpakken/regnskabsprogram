import { serveWithSentry } from '../_shared/sentry.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { pushPlatformStaff } from '../_shared/pushStaff.ts'
import {
  generateMariaReply,
  loadMariaConfig,
  loadPlanFacts,
  mariaConfigured,
  MARIA_NAME,
  type Turn,
} from '../_shared/maria.ts'

/**
 * Besøgende sender en besked i Maria-chatten (flydende widget). Validerer
 * (id, token), gemmer beskeden, lader Maria svare synkront, og eskalerer til et
 * menneske hvis Maria ikke kan hjælpe. Anonyme tilgår kun her — ingen RLS.
 */

const MARIA_DAILY_CAP = Number(Deno.env.get('MARIA_DAILY_CAP') ?? 800)
const RESET_AFTER_MS = 30 * 60 * 1000

serveWithSentry('chat-send', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)

  const b = (await req.json().catch(() => null)) as
    | { id?: string; token?: string; body?: string }
    | null
  const id = String(b?.id ?? '')
  const token = String(b?.token ?? '')
  const text = String(b?.body ?? '').trim().slice(0, 4000)
  if (!id || !token || !text) return jsonResponse({ error: 'Manglende felter.' }, 400)

  const { data: conv } = await admin
    .from('chat_conversations')
    .select('id, visitor_name, user_id, company_id, ai_enabled, wants_human, last_message_at')
    .eq('id', id)
    .eq('token', token)
    .maybeSingle()
  if (!conv) return jsonResponse({ error: 'Ugyldig samtale.' }, 403)

  const { error: insErr } = await admin
    .from('chat_messages')
    .insert({ conversation_id: id, sender: 'visitor', body: text })
  if (insErr) return jsonResponse({ error: insErr.message }, 500)

  // Ny henvendelse efter pause → Maria svarer først igen (selv efter et menneske overtog / kø).
  const idleMs = conv.last_message_at ? Date.now() - new Date(conv.last_message_at).getTime() : 0
  let aiEnabledNow = conv.ai_enabled !== false
  let wantsHuman = conv.wants_human === true
  if (idleMs > RESET_AFTER_MS && (!aiEnabledNow || wantsHuman)) {
    aiEnabledNow = true
    wantsHuman = false
  }

  await admin
    .from('chat_conversations')
    .update({
      last_message_at: new Date().toISOString(),
      status: 'open',
      ai_enabled: aiEnabledNow,
      wants_human: wantsHuman,
    })
    .eq('id', id)

  // Redigerbar oplæring + global kill-switch (maria_settings.enabled).
  const mariaCfg = await loadMariaConfig(admin)
  const aiOn = aiEnabledNow && mariaConfigured() && mariaCfg.enabled
  let escalated = false

  if (aiOn) {
    try {
      const since = new Date(Date.now() - 60 * 1000).toISOString()
      const dailySince = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const [recent, total, daily] = await Promise.all([
        admin.from('chat_messages').select('id', { count: 'exact', head: true }).eq('conversation_id', id).eq('sender', 'agent').eq('agent_name', MARIA_NAME).gte('created_at', since),
        admin.from('chat_messages').select('id', { count: 'exact', head: true }).eq('conversation_id', id).eq('sender', 'agent').eq('agent_name', MARIA_NAME),
        admin.from('chat_messages').select('id', { count: 'exact', head: true }).eq('sender', 'agent').eq('agent_name', MARIA_NAME).gte('created_at', dailySince),
      ])
      const rateLimited = (recent.count ?? 0) >= 5 || (total.count ?? 0) >= 40
      const globalCap = (daily.count ?? 0) >= MARIA_DAILY_CAP

      if (globalCap) {
        escalated = true
      } else if (!rateLimited) {
        const { data: history } = await admin
          .from('chat_messages')
          .select('sender, body')
          .eq('conversation_id', id)
          .order('created_at')
          .limit(40)
        const turns: Turn[] = (history ?? []).map((m: { sender: string; body: string }) => ({
          role: (m.sender === 'visitor' ? 'user' : 'assistant') as 'user' | 'assistant',
          text: m.body,
        }))
        const facts = await loadPlanFacts(admin)
        const userInfo = await buildUserInfo(admin, conv.user_id, conv.company_id)
        const reply = await generateMariaReply(turns, facts, userInfo, mariaCfg.training)
        if (reply) {
          await admin.from('chat_messages').insert({
            conversation_id: id,
            sender: 'agent',
            agent_name: MARIA_NAME,
            body: reply,
          })
          const patch: Record<string, string> = { last_message_at: new Date().toISOString() }
          // Marker som læst medmindre kunden venter på et menneske (så forbliver den ulæst i konsollen).
          if (!wantsHuman) patch.agent_read_at = new Date().toISOString()
          await admin.from('chat_conversations').update(patch).eq('id', id)
        } else {
          escalated = true
        }
      }
    } catch (e) {
      console.error('[chat-send] Maria-svar fejlede:', e)
      escalated = true
    }
  }

  // Maria kunne ikke hjælpe → overdrag til et menneske med en holdebesked.
  if (escalated && !wantsHuman) {
    wantsHuman = true
    await admin.from('chat_conversations').update({ wants_human: true }).eq('id', id)
    await admin.from('chat_messages').insert({
      conversation_id: id,
      sender: 'agent',
      agent_name: MARIA_NAME,
      body: 'Tak for din besked! Jeg henter en medarbejder, som vender tilbage til dig hurtigst muligt.',
    })
  }

  // Notificér teamet når et menneske skal se samtalen.
  if (!aiOn || wantsHuman || escalated) {
    await pushPlatformStaff(admin, {
      title: conv.visitor_name ? `Chat fra ${conv.visitor_name}` : 'Ny live chat',
      body: text.length > 120 ? `${text.slice(0, 117)}…` : text,
      url: `/platform/chat?c=${id}`,
    })
  }

  return jsonResponse({ ok: true })
})

// deno-lint-ignore no-explicit-any
async function buildUserInfo(admin: any, userId: string | null, companyId: string | null): Promise<string | undefined> {
  if (!userId) return undefined
  try {
    const { data: prof } = await admin.from('profiles').select('full_name').eq('id', userId).maybeSingle()
    const firstName = (prof?.full_name ?? '').trim().split(/\s+/)[0]
    let companyName: string | null = null
    let planName: string | null = null
    if (companyId) {
      const { data: company } = await admin.from('companies').select('name').eq('id', companyId).maybeSingle()
      companyName = company?.name ?? null
      const { data: sub } = await admin.from('subscriptions').select('billing_plan_id').eq('company_id', companyId).maybeSingle()
      if (sub?.billing_plan_id) {
        const { data: plan } = await admin.from('billing_plans').select('name').eq('id', sub.billing_plan_id).maybeSingle()
        planName = plan?.name ?? null
      }
    }
    const lines = [
      firstName ? `Fornavn: ${firstName}` : null,
      companyName ? `Virksomhed: ${companyName}` : null,
      planName ? `Virksomhedens plan: ${planName}` : null,
    ].filter(Boolean)
    return lines.length ? lines.join('\n') : undefined
  } catch {
    return undefined
  }
}
