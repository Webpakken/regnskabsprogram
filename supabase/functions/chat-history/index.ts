import { serveWithSentry } from '../_shared/sentry.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

/**
 * Henter beskeder + status for en Maria-chat-samtale (kanonisk kilde til widgeten).
 * Valideres på (id, token) — ingen RLS, kun edge function.
 */
serveWithSentry('chat-history', async (req) => {
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
    .select('id, ai_enabled, wants_human')
    .eq('id', id)
    .eq('token', token)
    .maybeSingle()
  if (!conv) return jsonResponse({ error: 'Ugyldig samtale.' }, 403)

  const { data: messages } = await admin
    .from('chat_messages')
    .select('id, sender, agent_name, body, created_at')
    .eq('conversation_id', id)
    .order('created_at')

  return jsonResponse({
    messages: messages ?? [],
    aiEnabled: conv.ai_enabled !== false,
    wantsHuman: conv.wants_human === true,
  })
})
