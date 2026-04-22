import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { fetchAuthV1User } from '../_shared/authV1User.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

function randomState() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const authBase =
    Deno.env.get('AIIA_AUTHORIZE_URL') ??
    'https://auth.aiia.eu/oauth/authorize'
  const clientId = Deno.env.get('AIIA_CLIENT_ID') ?? ''
  const redirectUri = Deno.env.get('AIIA_REDIRECT_URI') ?? ''

  if (!clientId || !redirectUri) {
    return jsonResponse(
      { error: 'Aiia is not configured (AIIA_CLIENT_ID, AIIA_REDIRECT_URI)' },
      503,
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const auth = await fetchAuthV1User(supabaseUrl, anon, authHeader)
  if (!auth.ok) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }
  const authed = auth.user
  const userClient = createClient(supabaseUrl, anon, {
    global: { headers: { Authorization: authHeader } },
  })

  let body: { company_id?: string }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }
  const companyId = body.company_id
  if (!companyId) {
    return jsonResponse({ error: 'company_id required' }, 400)
  }

  const { data: member, error: memErr } = await userClient
    .from('company_members')
    .select('id')
    .eq('company_id', companyId)
    .eq('user_id', authed.id)
    .maybeSingle()

  if (memErr || !member) {
    return jsonResponse({ error: 'Forbidden' }, 403)
  }

  const state = randomState()
  const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString()
  const admin = createClient(supabaseUrl, serviceKey)
  const { error: insErr } = await admin.from('oauth_states').insert({
    user_id: authed.id,
    company_id: companyId,
    state,
    expires_at: expires,
  })
  if (insErr) {
    console.error(insErr)
    return jsonResponse({ error: 'Could not start OAuth' }, 500)
  }

  const scope = encodeURIComponent(
    Deno.env.get('AIIA_SCOPE') ?? 'accounts offline_access',
  )
  const url =
    `${authBase}?response_type=code&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=${scope}`

  return jsonResponse({ url })
})
