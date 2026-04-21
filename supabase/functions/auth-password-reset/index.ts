import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { loadSmtpProfile, sendSmtpHtml } from '../_shared/smtpMail.ts'
import { mergeEmailTemplates, renderFinalEmail } from '../_shared/emailTemplateConfig.ts'

function appUrl(): string {
  return (
    Deno.env.get('APP_PUBLIC_URL')?.trim() ||
    Deno.env.get('SITE_URL')?.trim() ||
    'https://bilago.dk'
  ).replace(/\/$/, '')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  let body: { email?: string }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }

  const email = (body.email ?? '').trim().toLowerCase()
  if (!email || !email.includes('@')) {
    return jsonResponse({ error: 'Ugyldig e-mail' }, 400)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)
  const publicClient = createClient(supabaseUrl, anon)

  const { data: pub } = await admin
    .from('platform_public_settings')
    .select('email_templates')
    .eq('id', 1)
    .maybeSingle()

  const templates = mergeEmailTemplates(pub?.email_templates)
  const redirectTo = `${appUrl()}/login`

  if (!templates.password_reset.enabled) {
    const { error: e } = await publicClient.auth.resetPasswordForEmail(email, {
      redirectTo,
    })
    if (e) {
      console.warn('resetPasswordForEmail', e.message)
    }
    return jsonResponse({ ok: true })
  }

  const { data: linkRes, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo },
  })

  if (linkErr || !linkRes?.properties?.action_link) {
    console.warn('generateLink recovery', linkErr?.message)
    return jsonResponse({ ok: true })
  }

  const resetLink = linkRes.properties.action_link as string
  const rendered = renderFinalEmail('password_reset', templates, {
    user_email: email,
    reset_link: resetLink,
  })
  if (!rendered) {
    return jsonResponse({ ok: true })
  }

  const smtp = await loadSmtpProfile(admin, 'platform')
  const smtpFb = smtp.error != null ? await loadSmtpProfile(admin, 'transactional') : null
  const use = smtp.error == null ? smtp : smtpFb
  if (!use || use.error) {
    console.error('SMTP mangler til password_reset skabelon')
    return jsonResponse({ error: 'E-mail kunne ikke sendes (SMTP ikke konfigureret).' }, 503)
  }

  const fromName = use.profile.from_name?.trim() || 'Bilago'
  const send = await sendSmtpHtml({
    profile: use.profile,
    fromName,
    to: email,
    subject: rendered.subject,
    html: rendered.html,
  })
  if (!send.ok) {
    return jsonResponse({ error: send.message }, 502)
  }

  return jsonResponse({ ok: true })
})
