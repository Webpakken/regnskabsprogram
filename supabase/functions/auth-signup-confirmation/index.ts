import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { loadSmtpProfile, sendSmtpHtml } from '../_shared/smtpMail.ts'
import { mergeEmailTemplates, renderFinalEmail } from '../_shared/emailTemplateConfig.ts'
import { resolveAppPublicUrl } from '../_shared/appUrl.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  let body: {
    email?: string
    password?: string
    full_name?: string
    plan?: string | null
  }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }

  const email = (body.email ?? '').trim().toLowerCase()
  const password = body.password ?? ''
  const fullName = (body.full_name ?? '').trim()
  const plan = (body.plan ?? '').trim()

  if (!email || !email.includes('@')) {
    return jsonResponse({ error: 'Ugyldig e-mail' }, 400)
  }
  if (password.length < 8) {
    return jsonResponse({ error: 'Adgangskoden er for kort.' }, 400)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)

  const { data: pub } = await admin
    .from('platform_public_settings')
    .select('email_templates')
    .eq('id', 1)
    .maybeSingle()

  const templates = mergeEmailTemplates(pub?.email_templates)
  const redirectTo = plan
    ? `${resolveAppPublicUrl()}/onboarding?plan=${encodeURIComponent(plan)}`
    : `${resolveAppPublicUrl()}/onboarding`

  const { data: linkRes, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'signup',
    email,
    password,
    options: {
      redirectTo,
      data: {
        full_name: fullName,
        plan: plan || null,
      },
    },
  })

  if (linkErr || !linkRes?.properties?.action_link) {
    const msg = linkErr?.message ?? 'Kunne ikke oprette bekræftelseslink.'
    const lower = msg.toLowerCase()
    if (lower.includes('already') || lower.includes('registered') || lower.includes('exists')) {
      return jsonResponse({ error: 'Der findes allerede en konto med denne e-mail.' }, 409)
    }
    console.warn('generateLink signup', msg)
    return jsonResponse({ error: 'Kunne ikke oprette bekræftelseslink.' }, 500)
  }

  const confirmationLink = linkRes.properties.action_link as string
  const rendered = renderFinalEmail('signup_confirmation', templates, {
    user_name: fullName || email.split('@')[0] || 'du',
    user_email: email,
    confirmation_link: confirmationLink,
  })
  if (!rendered) {
    return jsonResponse({ error: 'Signup-bekræftelsesmail er slået fra.' }, 503)
  }

  const smtp = await loadSmtpProfile(admin, 'platform')
  const smtpFb = smtp.error != null ? await loadSmtpProfile(admin, 'transactional') : null
  const use = smtp.error == null ? smtp : smtpFb
  if (!use || use.error) {
    console.error('SMTP mangler til signup_confirmation')
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
