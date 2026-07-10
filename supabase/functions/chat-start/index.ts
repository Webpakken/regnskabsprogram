import { serveWithSentry } from '../_shared/sentry.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { fetchAuthV1User } from '../_shared/authV1User.ts'

/**
 * Starter en ny Maria-chat-samtale (flydende widget). Anonyme ELLER indloggede
 * besøgende. Returnerer { id, token } som widgeten gemmer i localStorage.
 */

// Maks. nye samtaler pr. IP pr. time (værn mod start→send-loop der driver AI-forbrug op).
const PER_IP_HOURLY_MAX = 10

serveWithSentry('chat-start', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)

  let name = ''
  let email = ''
  try {
    const b = (await req.json()) as { name?: string; email?: string }
    name = String(b?.name ?? '').trim().slice(0, 120)
    email = String(b?.email ?? '').trim().slice(0, 200)
  } catch {
    /* tomme felter ok */
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    null

  if (ip) {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count } = await admin
      .from('chat_conversations')
      .select('id', { count: 'exact', head: true })
      .eq('visitor_ip', ip)
      .gte('created_at', since)
    if ((count ?? 0) >= PER_IP_HOURLY_MAX) {
      return jsonResponse({ error: 'For mange samtaler lige nu. Prøv igen om lidt.' }, 429)
    }
  }

  // Verificeret ejerskab hvis logget ind (så vi kan hilse personligt + tilpasse svar).
  let userId: string | null = null
  let companyId: string | null = null
  const authHeader = req.headers.get('Authorization')
  if (authHeader) {
    const auth = await fetchAuthV1User(supabaseUrl, anon, authHeader)
    if (auth.ok) {
      userId = auth.user.id
      if (!email && auth.user.email) email = auth.user.email
      const { data: prof } = await admin
        .from('profiles')
        .select('current_company_id')
        .eq('id', auth.user.id)
        .maybeSingle()
      companyId = prof?.current_company_id ?? null
    }
  }

  const { data, error } = await admin
    .from('chat_conversations')
    .insert({
      visitor_name: name || null,
      visitor_email: email || null,
      visitor_ip: ip,
      user_id: userId,
      company_id: companyId,
    })
    .select('id, token')
    .single()

  if (error) return jsonResponse({ error: error.message }, 500)
  return jsonResponse({ id: data.id, token: data.token })
})
