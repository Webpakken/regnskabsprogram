/**
 * Planlagt kørsel: 3 påmindelses-mails til virksomheder hvis prøveperiode er
 * udløbet uden betaling. Kadence: ved udløb (stage 0→1), +3 uger (1→2), +4 uger (2→3).
 * Derefter stoppes, indtil kunden selv gør noget (betaler → stage nulstilles i
 * stripe-webhook; forlænges → nulstilles i extend_company_trial).
 *
 * Auth: POST med header x-bilago-trial-reminder: <TRIAL_REMINDER_CRON_SECRET>.
 */
import { serveWithSentry, captureError } from '../_shared/sentry.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { loadSmtpProfile, sendSmtpHtml } from '../_shared/smtpMail.ts'
import { mergeEmailTemplates, renderFinalEmail } from '../_shared/emailTemplateConfig.ts'
import { resolveAppPublicUrl } from '../_shared/appUrl.ts'

const DAY_MS = 86_400_000
const TRIAL_DAYS = 30
// Interval fra sidste påmindelse til den næste, pr. stage vi er PÅ VEJ TIL.
const STAGE_INTERVAL_DAYS: Record<number, number> = { 1: 21, 2: 28 }

type SubRow = {
  status: string
  company: {
    id: string
    name: string | null
    created_at: string
    trial_ends_at: string | null
    invoice_email: string | null
    trial_reminder_stage: number | null
    trial_reminder_last_sent_at: string | null
  } | null
}

function effectiveTrialEnd(created_at: string, trial_ends_at: string | null): number {
  if (trial_ends_at) return new Date(trial_ends_at).getTime()
  return new Date(created_at).getTime() + TRIAL_DAYS * DAY_MS
}

serveWithSentry('trial-reminders', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const expected = Deno.env.get('TRIAL_REMINDER_CRON_SECRET')?.trim()
  const got = req.headers.get('x-bilago-trial-reminder')?.trim()
  if (!expected || got !== expected) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)

  const { data: pub } = await admin
    .from('platform_public_settings')
    .select('email_templates, pricing_amount_cents, monthly_price_cents')
    .eq('id', 1)
    .maybeSingle()
  const templates = mergeEmailTemplates(pub?.email_templates)
  const priceCents = pub?.pricing_amount_cents ?? pub?.monthly_price_cents ?? 9900
  const planPrice = `${Math.round(priceCents / 100).toLocaleString('da-DK')} kr./md.`
  const activateUrl = `${resolveAppPublicUrl()}/app/settings/subscription`

  const tx = await loadSmtpProfile(admin, 'transactional')
  if (tx.error || !tx.profile) {
    return jsonResponse({ error: tx.error ?? 'Transactional SMTP mangler' }, 503)
  }

  // Kandidater: kortløse/ufuldstændige abonnementer (aldrig betalt) med deres virksomhed.
  const { data: rows, error } = await admin
    .from('subscriptions')
    .select(
      'status, company:companies(id, name, created_at, trial_ends_at, invoice_email, trial_reminder_stage, trial_reminder_last_sent_at)',
    )
    .in('status', ['trialing', 'incomplete'])
  if (error) return jsonResponse({ error: error.message }, 500)

  const now = Date.now()
  let sent = 0
  const errors: string[] = []

  for (const row of (rows ?? []) as SubRow[]) {
    const co = row.company
    if (!co) continue

    const end = effectiveTrialEnd(co.created_at, co.trial_ends_at)
    if (end > now) continue // prøveperiode ikke udløbet (eller forlænget ud i fremtiden)

    const stage = Number(co.trial_reminder_stage ?? 0)
    if (stage >= 3) continue // færdig — stop indtil kunden gør noget

    // Forfald: stage 0 sendes med det samme (udløbet); ellers interval efter sidste.
    if (stage >= 1) {
      const intervalDays = STAGE_INTERVAL_DAYS[stage] ?? 21
      const last = co.trial_reminder_last_sent_at
        ? new Date(co.trial_reminder_last_sent_at).getTime()
        : end
      if (now < last + intervalDays * DAY_MS) continue
    }

    // Modtager: invoice_email (defaulter til ejerens signup-mail) → fallback ejerens auth-mail.
    let to = co.invoice_email?.trim() || ''
    if (!to) {
      const { data: ownerRow } = await admin
        .from('company_members')
        .select('user_id')
        .eq('company_id', co.id)
        .eq('role', 'owner')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (ownerRow?.user_id) {
        const { data: u } = await admin.auth.admin.getUserById(ownerRow.user_id)
        to = u?.user?.email?.trim() || ''
      }
    }
    if (!to) {
      errors.push(`${co.id}: ingen modtager-email`)
      continue
    }

    const rendered = renderFinalEmail('trial_reminder', templates, {
      company_name: co.name?.trim() || 'der',
      plan_price: planPrice,
      activate_url: activateUrl,
    })
    if (!rendered) break // skabelonen er slået fra globalt

    const mail = await sendSmtpHtml({
      profile: tx.profile,
      fromName: tx.profile.from_name?.trim() || 'Bilago',
      to,
      subject: rendered.subject,
      html: rendered.html,
    })
    if (!mail.ok) {
      errors.push(`${co.id}: ${mail.message}`)
      await captureError(new Error(`trial-reminder email failed: ${mail.message}`), {
        function: 'trial-reminders',
        company_id: co.id,
      })
      continue
    }

    const nextStage = stage + 1
    const { error: uErr } = await admin
      .from('companies')
      .update({
        trial_reminder_stage: nextStage,
        trial_reminder_last_sent_at: new Date().toISOString(),
      })
      .eq('id', co.id)
    if (uErr) {
      errors.push(`${co.id} opdatering: ${uErr.message}`)
      continue
    }

    await admin.from('activity_events').insert({
      company_id: co.id,
      actor_id: null,
      event_type: 'trial_reminder_sent',
      title: `Prøveperiode-påmindelse ${nextStage}/3 sendt`,
      meta: { stage: nextStage },
    })

    sent++
  }

  return jsonResponse({ ok: true, sent, errors: errors.length ? errors.slice(0, 20) : undefined })
})
