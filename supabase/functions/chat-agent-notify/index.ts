import { serveWithSentry } from '../_shared/sentry.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { fetchAuthV1User } from '../_shared/authV1User.ts'
import { pushUsers } from '../_shared/pushStaff.ts'

/**
 * En agent har svaret i live chat → push til den (indloggede) besøgende.
 * Kun logget-ind kunder kan modtage push (samtalen har user_id). Anonyme
 * besøgende ser svaret via widgetens broadcast/polling.
 */
serveWithSentry('chat-agent-notify', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401)
  const auth = await fetchAuthV1User(supabaseUrl, anon, authHeader)
  if (!auth.ok) return jsonResponse({ error: 'Unauthorized' }, 401)

  const admin = createClient(supabaseUrl, serviceKey)

  // Kun platform-staff må udløse dette.
  const { data: staff } = await admin
    .from('platform_staff')
    .select('user_id')
    .eq('user_id', auth.user.id)
    .maybeSingle()
  if (!staff) return jsonResponse({ error: 'Forbidden' }, 403)

  const b = (await req.json().catch(() => null)) as
    | { conversation_id?: string; body?: string }
    | null
  const conversationId = (b?.conversation_id ?? '').trim()
  const preview = (b?.body ?? '').trim()
  if (!conversationId) return jsonResponse({ error: 'Missing conversation_id' }, 400)

  const { data: conv } = await admin
    .from('chat_conversations')
    .select('user_id')
    .eq('id', conversationId)
    .maybeSingle()
  if (!conv?.user_id) {
    return jsonResponse({ ok: true, sent: 0, skipped: 'no logged-in visitor' })
  }

  const res = await pushUsers(admin, [conv.user_id], {
    title: 'Svar fra support',
    body: preview.length > 120 ? `${preview.slice(0, 117)}…` : preview || 'Support har svaret dig.',
    url: '/app/dashboard?chat=1',
  })

  return jsonResponse({ ok: true, ...res })
})
