import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)
  const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:5173'

  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const err = url.searchParams.get('error')

  const redirectFail = (msg: string) =>
    new Response(null, {
      status: 302,
      headers: {
        Location: `${appUrl}/app/bank?error=${encodeURIComponent(msg)}`,
      },
    })

  if (err) {
    return redirectFail(err)
  }
  if (!code || !state) {
    return redirectFail('missing_code_or_state')
  }

  const { data: row, error: stErr } = await admin
    .from('oauth_states')
    .select('id, user_id, company_id, expires_at')
    .eq('state', state)
    .maybeSingle()

  if (stErr || !row) {
    return redirectFail('invalid_state')
  }
  if (new Date(row.expires_at as string) < new Date()) {
    await admin.from('oauth_states').delete().eq('id', row.id)
    return redirectFail('state_expired')
  }

  const tokenUrl = Deno.env.get('AIIA_TOKEN_URL') ?? 'https://auth.aiia.eu/oauth/token'
  const clientId = Deno.env.get('AIIA_CLIENT_ID') ?? ''
  const clientSecret = Deno.env.get('AIIA_CLIENT_SECRET') ?? ''
  const redirectUri = Deno.env.get('AIIA_REDIRECT_URI') ?? ''

  if (!clientId || !clientSecret || !redirectUri) {
    return redirectFail('aiia_not_configured')
  }

  const tokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })

  const tokenJson = await tokenRes.json().catch(() => ({}))
  if (!tokenRes.ok) {
    console.error('Aiia token error', tokenJson)
    await admin.from('oauth_states').delete().eq('id', row.id)
    return redirectFail('token_exchange_failed')
  }

  const accessToken = tokenJson.access_token as string | undefined
  const refreshToken = tokenJson.refresh_token as string | undefined
  const expiresIn = tokenJson.expires_in as number | undefined
  const extUser =
    (tokenJson.user_id as string | undefined) ??
    (tokenJson.sub as string | undefined) ??
    null

  const expiresAt =
    typeof expiresIn === 'number'
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null

  const { data: conn, error: cErr } = await admin
    .from('bank_connections')
    .insert({
      company_id: row.company_id as string,
      provider: 'aiia',
      status: 'connected',
      institution_name: 'Aiia',
      external_user_id: extUser,
    })
    .select('id')
    .single()

  if (cErr || !conn) {
    console.error(cErr)
    await admin.from('oauth_states').delete().eq('id', row.id)
    return redirectFail('db_error')
  }

  await admin.from('bank_connection_secrets').upsert({
    connection_id: conn.id,
    access_token: accessToken ?? null,
    refresh_token: refreshToken ?? null,
    expires_at: expiresAt,
    raw_payload: tokenJson as Record<string, unknown>,
    updated_at: new Date().toISOString(),
  })

  await admin.from('oauth_states').delete().eq('id', row.id)

  await admin.from('activity_events').insert({
    company_id: row.company_id as string,
    actor_id: row.user_id as string,
    event_type: 'bank_connected',
    title: 'Bankforbindelse oprettet (Aiia)',
    meta: { provider: 'aiia' },
  })

  return new Response(null, {
    status: 302,
    headers: { Location: `${appUrl}/app/bank?connected=1` },
  })
})
