/**
 * Planlagt kørsel: send automatisk betalingspåmindelse (skabelon invoice_reminder) for sendte fakturaer.
 *
 * Konfigurer Supabase Secrets: INVOICE_AUTOMATION_CRON_SECRET (vilkårlig stærk streng).
 * Kald POST med header: x-bilago-invoice-automation: <samme værdi>
 * (fx Supabase Scheduled Functions, GitHub Actions eller anden cron).
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { escapeHtml } from '../_shared/emailLayout.ts'
import { loadSmtpProfile, sendSmtpHtml } from '../_shared/smtpMail.ts'
import { mergeEmailTemplates, renderFinalEmail } from '../_shared/emailTemplateConfig.ts'

const APP_TIMEZONE = 'Europe/Copenhagen'
const MAX_AUTO_REMINDERS_PER_INVOICE = 24

function formatDkk(cents: number): string {
  return new Intl.NumberFormat('da-DK', {
    style: 'currency',
    currency: 'DKK',
  }).format(cents / 100)
}

function formatDaDate(iso: string): string {
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso.slice(0, 10))) {
      const d8 = iso.slice(0, 10)
      const [y, m, day] = d8.split('-').map(Number)
      const t = new Date(Date.UTC(y, m - 1, day, 12, 0, 0))
      return new Intl.DateTimeFormat('da-DK', {
        timeZone: APP_TIMEZONE,
        dateStyle: 'long',
      }).format(t)
    }
    return new Intl.DateTimeFormat('da-DK', {
      timeZone: APP_TIMEZONE,
      dateStyle: 'long',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function copenhagenTodayYmd(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function toCopenhagenYmdFromInstant(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

/** ISO YYYY-MM-DD + heltalsdage → ISO YYYY-MM-DD (kalender i København-midnat som UTC-noon trick). */
function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  t.setUTCDate(t.getUTCDate() + days)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(t)
}

type CompanyRow = {
  id: string
  automation_reminders_enabled: boolean
  automation_reminder_first_days_after_due: number
  automation_reminder_interval_days: number
}

type InvoiceRow = {
  id: string
  company_id: string
  invoice_number: string
  customer_name: string
  customer_email: string | null
  gross_cents: number
  due_date: string
  notes: string | null
  status: string
  credited_invoice_id: string | null
  last_automation_reminder_at: string | null
  automation_reminder_send_count: number
}

function isEligibleForAutomation(
  inv: InvoiceRow,
  co: CompanyRow,
  todayYmd: string,
): boolean {
  if (inv.status !== 'sent') return false
  const email = inv.customer_email?.trim()
  if (!email) return false
  if (Number(inv.gross_cents ?? 0) < 0) return false
  if (inv.credited_invoice_id) return false
  const due = String(inv.due_date).slice(0, 10)
  const firstAfter = addDaysYmd(due, co.automation_reminder_first_days_after_due)
  const count = Number(inv.automation_reminder_send_count ?? 0)
  if (count >= MAX_AUTO_REMINDERS_PER_INVOICE) return false

  if (count === 0) {
    return todayYmd >= firstAfter
  }
  if (!inv.last_automation_reminder_at) {
    return todayYmd >= firstAfter
  }
  const lastYmd = toCopenhagenYmdFromInstant(inv.last_automation_reminder_at)
  const nextAfter = addDaysYmd(lastYmd, co.automation_reminder_interval_days)
  return todayYmd >= nextAfter
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const expected = Deno.env.get('INVOICE_AUTOMATION_CRON_SECRET')?.trim()
  const got = req.headers.get('x-bilago-invoice-automation')?.trim()
  if (!expected || got !== expected) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
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

  const tx = await loadSmtpProfile(admin, 'transactional')
  if (tx.error || !tx.profile) {
    return jsonResponse({ error: tx.error ?? 'Transactional SMTP mangler' }, 503)
  }

  const { data: companies, error: cErr } = await admin
    .from('companies')
    .select(
      'id, automation_reminders_enabled, automation_reminder_first_days_after_due, automation_reminder_interval_days',
    )
    .eq('automation_reminders_enabled', true)

  if (cErr) {
    return jsonResponse({ error: cErr.message }, 500)
  }

  const todayYmd = copenhagenTodayYmd()
  let sent = 0
  const errors: string[] = []

  for (const co of (companies ?? []) as CompanyRow[]) {
    const { data: invs, error: iErr } = await admin
      .from('invoices')
      .select(
        'id, company_id, invoice_number, customer_name, customer_email, gross_cents, due_date, notes, status, credited_invoice_id, last_automation_reminder_at, automation_reminder_send_count',
      )
      .eq('company_id', co.id)
      .eq('status', 'sent')

    if (iErr) {
      errors.push(`${co.id}: ${iErr.message}`)
      continue
    }

    for (const inv of (invs ?? []) as InvoiceRow[]) {
      if (!isEligibleForAutomation(inv, co, todayYmd)) continue

      const to = inv.customer_email?.trim()
      if (!to) continue

      const { data: company } = await admin
        .from('companies')
        .select('name')
        .eq('id', inv.company_id)
        .maybeSingle()

      const companyName = company?.name?.trim() || 'Virksomhed'
      const notesRaw = inv.notes?.trim() ?? ''
      const notesBlock = notesRaw
        ? `<p style="margin:12px 0 0;color:#475569;font-size:14px;line-height:1.5;">${escapeHtml(notesRaw).replace(/\n/g, '<br/>')}</p>`
        : ''

      const invoiceNum = String(inv.invoice_number ?? '').trim()
      const rendered = renderFinalEmail(
        'invoice_reminder',
        templates,
        {
          customer_name: inv.customer_name?.trim() || 'Kunde',
          invoice_number: invoiceNum,
          faktura_nummer: invoiceNum,
          fakturanummer: invoiceNum,
          gross_amount: formatDkk(Number(inv.gross_cents ?? 0)),
          due_date: formatDaDate(String(inv.due_date)),
          company_name: companyName,
          notes_block: notesBlock,
        },
        new Set(['notes_block']),
      )

      if (!rendered) continue

      const mail = await sendSmtpHtml({
        profile: tx.profile,
        fromName: companyName,
        to,
        subject: rendered.subject,
        html: rendered.html,
      })

      if (!mail.ok) {
        errors.push(`${inv.id}: ${mail.message}`)
        continue
      }

      const nextCount = Number(inv.automation_reminder_send_count ?? 0) + 1
      const { error: uErr } = await admin
        .from('invoices')
        .update({
          last_automation_reminder_at: new Date().toISOString(),
          automation_reminder_send_count: nextCount,
        })
        .eq('id', inv.id)

      if (uErr) {
        errors.push(`${inv.id} opdatering: ${uErr.message}`)
        continue
      }

      await admin.from('activity_events').insert({
        company_id: inv.company_id,
        actor_id: null,
        event_type: 'invoice_reminder_auto',
        title: `Automatisk påmindelse sendt: faktura ${invoiceNum}`,
        meta: { invoice_id: inv.id },
      })

      sent++
    }
  }

  return jsonResponse({
    ok: true,
    today: todayYmd,
    sent,
    errors: errors.length ? errors.slice(0, 20) : undefined,
  })
})
