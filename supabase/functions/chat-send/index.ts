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
 * Besøgende sender en besked i Maria-chatten. Kundens besked gemmes og der
 * svares STRAKS til klienten (så beskeden vises med det samme). Marias svar
 * genereres i baggrunden (EdgeRuntime.waitUntil).
 *
 * Har kunden bedt om et menneske (wants_human), TIER Maria — indtil enten et
 * menneske afslutter tråden (staff-konsollen), eller der er gået 24 timer siden
 * seneste besked (så genoptager Maria automatisk).
 */

const MARIA_DAILY_CAP = Number(Deno.env.get('MARIA_DAILY_CAP') ?? 800)
// Maria genoptager en samtale efter 24 timers stilhed (også efter et menneske
// har overtaget eller kunden har bedt om et menneske).
const RESET_AFTER_MS = 24 * 60 * 60 * 1000

// Supabase Edge Runtime: kør arbejde efter svaret er sendt.
declare const EdgeRuntime:
  | { waitUntil(p: Promise<unknown>): void }
  | undefined

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

  // Efter 24 timers stilhed genoptager Maria (nulstil menneske-overtagelse/kø).
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

  // Maria svarer KUN når AI er slået til OG kunden ikke venter på/taler med et menneske.
  const mariaCfg = await loadMariaConfig(admin)
  const aiOn = aiEnabledNow && !wantsHuman && mariaConfigured() && mariaCfg.enabled

  // Alt det tunge (Maria-svar + eskalering + push) kører efter svaret er sendt,
  // så kundens besked vises med det samme.
  const background = processAfterSend(admin, {
    id,
    text,
    visitorName: conv.visitor_name,
    userId: conv.user_id,
    companyId: conv.company_id,
    aiOn,
    wantsHuman,
    training: mariaCfg.training,
  })
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(background)
  } else {
    // Fallback (lokalt uden EdgeRuntime): afvent så arbejdet ikke afbrydes.
    await background
  }

  // answering: skal klienten vise "Maria skriver …"? wantsHuman afspejler status efter reset.
  return jsonResponse({ ok: true, answering: aiOn, wants_human: wantsHuman })
})

type BgArgs = {
  id: string
  text: string
  visitorName: string | null
  userId: string | null
  companyId: string | null
  aiOn: boolean
  wantsHuman: boolean
  training: string | undefined
}

// deno-lint-ignore no-explicit-any
async function processAfterSend(admin: any, args: BgArgs): Promise<void> {
  const { id, text } = args
  let wantsHuman = args.wantsHuman
  let escalated = false

  if (args.aiOn) {
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
        const userInfo = await buildUserInfo(admin, args.userId, args.companyId)
        const reply = await generateMariaReply(turns, facts, userInfo, args.training)
        if (reply) {
          await admin.from('chat_messages').insert({
            conversation_id: id,
            sender: 'agent',
            agent_name: MARIA_NAME,
            body: reply,
          })
          await admin
            .from('chat_conversations')
            .update({ last_message_at: new Date().toISOString(), agent_read_at: new Date().toISOString() })
            .eq('id', id)
          return // Maria svarede — ingen grund til at forstyrre et menneske.
        }
        escalated = true
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

  // Notificér teamet når et menneske skal se samtalen (kø, eskalering, eller AI slået fra).
  if (!args.aiOn || wantsHuman || escalated) {
    await pushPlatformStaff(admin, {
      title: args.visitorName ? `Chat fra ${args.visitorName}` : 'Ny live chat',
      body: text.length > 120 ? `${text.slice(0, 117)}…` : text,
      url: `/platform/chat?c=${id}`,
    })
  }
}

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
