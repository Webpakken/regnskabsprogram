import { serveWithSentry } from '../_shared/sentry.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { pushPlatformStaff } from '../_shared/pushStaff.ts'

/**
 * Kunden beder om et menneske i Maria-chatten → sæt i kø og notificér teamet.
 * Maria slås IKKE fra — hun svarer stadig, indtil et menneske overtager.
 */
serveWithSentry('chat-escalate', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)

  const b = (await req.json().catch(() => null)) as { id?: string; token?: string } | null
  const id = String(b?.id ?? '')
  const token = String(b?.token ?? '')
  if (!id || !token) return jsonResponse({ error: 'Manglende felter.' }, 400)

  const { data: conv } = await admin
    .from('chat_conversations')
    .select('id, visitor_name')
    .eq('id', id)
    .eq('token', token)
    .maybeSingle()
  if (!conv) return jsonResponse({ error: 'Ugyldig samtale.' }, 403)

  await admin
    .from('chat_conversations')
    .update({ wants_human: true, agent_read_at: null })
    .eq('id', id)

  await pushPlatformStaff(admin, {
    title: conv.visitor_name ? `${conv.visitor_name} vil tale med et menneske` : 'Kunde vil tale med et menneske',
    body: 'En besøgende har bedt om en medarbejder i live chat.',
    url: `/platform/chat?c=${id}`,
  })

  return jsonResponse({ ok: true })
})
