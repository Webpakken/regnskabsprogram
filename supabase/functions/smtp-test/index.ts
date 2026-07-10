import { serveWithSentry } from '../_shared/sentry.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import nodemailer from 'npm:nodemailer@6.9.15'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

const TRANSACTIONAL = 'transactional'

serveWithSentry('smtp-test', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  // Undgå userClient.auth.getUser(): lokalt JWT-parse i supabase-js understøtter ikke altid ES256,
  // som Supabase Auth kan udstede. Auth-API validerer token server-side.
  const base = supabaseUrl.replace(/\/$/, '')
  const authRes = await fetch(`${base}/auth/v1/user`, {
    headers: {
      Authorization: authHeader,
      apikey: anon,
    },
  })
  if (!authRes.ok) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }
  const authUser = (await authRes.json()) as { id?: string; email?: string }
  if (!authUser.id || !authUser.email?.trim()) {
    return jsonResponse({ error: 'Unauthorized eller mangler e-mail på kontoen' }, 401)
  }
  const userEmail = authUser.email.trim()

  // Undgå createClient med bruger-JWT: supabase-js kan fejle på ES256 ved lokalt parse.
  // Brug service role efter tjek mod platform_staff (samme adgang som RLS ville give).
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!serviceKey) {
    return jsonResponse({ error: 'Server misconfigured' }, 500)
  }
  const admin = createClient(supabaseUrl, serviceKey)

  const { data: staffRow } = await admin
    .from('platform_staff')
    .select('user_id')
    .eq('user_id', authUser.id)
    .maybeSingle()

  if (!staffRow) {
    return jsonResponse({ error: 'Ingen adgang eller ukendt profil' }, 403)
  }

  let body: { profile_id?: string; test_company_name?: string }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }

  const profileId = (body.profile_id ?? '').trim()
  if (!['transactional', 'platform', 'marketing'].includes(profileId)) {
    return jsonResponse({ error: 'Ugyldig profile_id' }, 400)
  }

  const { data: profile, error: pErr } = await admin
    .from('platform_smtp_profiles')
    .select('*')
    .eq('id', profileId)
    .maybeSingle()

  if (pErr) {
    return jsonResponse({ error: pErr.message }, 500)
  }
  if (!profile) {
    return jsonResponse({ error: 'Ukendt SMTP-profil' }, 404)
  }

  const host = profile.host?.trim()
  const port = profile.port
  const smtpUser = profile.user_name?.trim()
  const pass = profile.smtp_password
  const fromEmail = profile.from_email?.trim()

  if (!host || port == null || !smtpUser || !pass || !fromEmail) {
    return jsonResponse(
      {
        error:
          'Udfyld host, port, brugernavn, adgangskode og from e-mail, og gem profilen først.',
      },
      400,
    )
  }

  const fromName =
    profileId === TRANSACTIONAL
      ? (body.test_company_name?.trim() || 'Eksempel Virksomhed')
      : (profile.from_name?.trim() || 'Bilago')

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user: smtpUser, pass },
  })

  try {
    await transporter.sendMail({
      from: { name: fromName, address: fromEmail },
      to: userEmail,
      subject: `[Bilago] SMTP-test (${profile.label})`,
      text:
        `Dette er en testmail fra Bilago-platformen.\n\n` +
        `Profil: ${profileId}\n` +
        `Afsendernavn i test: ${fromName}\n` +
        `Tid (UTC): ${new Date().toISOString()}\n`,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonResponse({ error: `SMTP: ${msg}` }, 502)
  }

  return jsonResponse({ ok: true })
})
