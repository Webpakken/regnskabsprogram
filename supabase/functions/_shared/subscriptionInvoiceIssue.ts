// Udsteder Bilagos egen abonnements-faktura når en virksomhed hæves for sit
// abonnement: tildeler Bilago-fakturanummer, genererer PDF, gemmer den som et
// bilag (kvittering) hos virksomheden og mailer PDF'en. Idempotent pr.
// stripe_invoice_id, så webhook-retries ikke laver dubletter.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { loadSmtpProfile, sendSmtpHtml } from './smtpMail.ts'
import { mergeEmailTemplates, renderFinalEmail } from './emailTemplateConfig.ts'
import { generateSubscriptionInvoicePdfBytes } from './subscriptionInvoicePdf.ts'

type Admin = SupabaseClient

const VAT_RATE = 25

export type SubscriptionInvoiceInput = {
  stripeInvoiceId: string
  stripeCustomerId: string
  stripeSubscriptionId: string | null
  companyId: string
  /** Store bogstaver, fx 'DKK'. */
  currency: string
  /** Bruttobeløb i øre (inkl. 25% moms). */
  grossCents: number
  /** YYYY-MM-DD — betalings-/udstedelsesdato. */
  paidDateYmd: string
  periodStartYmd: string | null
  periodEndYmd: string | null
  recipientEmail: string | null
}

export type IssueResult = {
  ok: boolean
  skipped?: boolean
  reason?: string
  invoiceNumber?: string
}

function formatDkk(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('da-DK', { style: 'currency', currency }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`
  }
}

function daDate(iso: string): string {
  const d = iso.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return iso
  const [y, m, day] = d.split('-').map(Number)
  return new Intl.DateTimeFormat('da-DK', {
    timeZone: 'Europe/Copenhagen',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, day, 12, 0, 0)))
}

export async function issueSubscriptionInvoice(
  admin: Admin,
  input: SubscriptionInvoiceInput,
): Promise<IssueResult> {
  // 1. Idempotens: allerede udstedt for denne Stripe-faktura?
  const { data: existing } = await admin
    .from('platform_subscription_invoices')
    .select('id, invoice_number')
    .eq('stripe_invoice_id', input.stripeInvoiceId)
    .maybeSingle()
  if (existing) {
    return { ok: true, skipped: true, reason: 'already_issued', invoiceNumber: existing.invoice_number }
  }

  // Moms baglæns — abonnementsprisen er inkl. 25% moms.
  const grossCents = Math.round(input.grossCents)
  const netCents = Math.round(grossCents / 1.25)
  const vatCents = grossCents - netCents

  // Plannavn via virksomhedens abonnement.
  let planName = 'Bilago abonnement'
  const { data: sub } = await admin
    .from('subscriptions')
    .select('billing_plan_id')
    .eq('company_id', input.companyId)
    .maybeSingle()
  if (sub?.billing_plan_id) {
    const { data: plan } = await admin
      .from('billing_plans')
      .select('name')
      .eq('id', sub.billing_plan_id)
      .maybeSingle()
    if (plan?.name?.trim()) planName = plan.name.trim()
  }

  // Køber = virksomheden.
  const { data: company } = await admin
    .from('companies')
    .select('name, street_address, postal_code, city, cvr, invoice_email')
    .eq('id', input.companyId)
    .maybeSingle()
  if (!company) return { ok: false, reason: 'company_not_found' }

  // 2. Fakturaregister — tildeler løbende Bilago-fakturanummer (generated column).
  const { data: ledger, error: ledgerErr } = await admin
    .from('platform_subscription_invoices')
    .insert({
      company_id: input.companyId,
      stripe_invoice_id: input.stripeInvoiceId,
      stripe_customer_id: input.stripeCustomerId,
      stripe_subscription_id: input.stripeSubscriptionId,
      currency: input.currency,
      net_cents: netCents,
      vat_cents: vatCents,
      gross_cents: grossCents,
      vat_rate: VAT_RATE,
      period_start: input.periodStartYmd,
      period_end: input.periodEndYmd,
      plan_name: planName,
    })
    .select('id, invoice_number')
    .single()
  if (ledgerErr || !ledger) {
    // 23505 = unik-konflikt: en samtidig levering nåede først.
    if ((ledgerErr as { code?: string } | null)?.code === '23505') {
      return { ok: true, skipped: true, reason: 'race_duplicate' }
    }
    return { ok: false, reason: ledgerErr?.message ?? 'ledger_insert_failed' }
  }

  const invoiceNumber = ledger.invoice_number as string

  // 3. Generér PDF.
  const pdfBytes = generateSubscriptionInvoicePdfBytes({
    invoiceNumber,
    issueDate: input.paidDateYmd,
    currency: input.currency,
    grossCents,
    netCents,
    vatCents,
    vatRate: VAT_RATE,
    planName,
    periodStart: input.periodStartYmd,
    periodEnd: input.periodEndYmd,
    buyer: {
      name: company.name,
      address: company.street_address,
      zip: company.postal_code,
      city: company.city,
      cvr: company.cvr,
      email: input.recipientEmail ?? company.invoice_email,
    },
  })

  // 4. Gem PDF i vouchers-bucket.
  const storagePath = `${input.companyId}/subscription/${input.stripeInvoiceId}.pdf`
  const filename = `bilago-abonnement-${invoiceNumber}.pdf`
  const { error: upErr } = await admin.storage
    .from('vouchers')
    .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: true })

  // 5. Opret bilag (kvittering) hos virksomheden.
  let voucherId: string | null = null
  if (!upErr) {
    const { data: voucher, error: vErr } = await admin
      .from('vouchers')
      .insert({
        company_id: input.companyId,
        storage_path: storagePath,
        filename,
        mime_type: 'application/pdf',
        title: `Bilago abonnement ${invoiceNumber}`,
        category: 'IT og software',
        notes: planName,
        uploaded_by: null,
        expense_date: input.paidDateYmd,
        gross_cents: grossCents,
        net_cents: netCents,
        vat_cents: vatCents,
        vat_rate: VAT_RATE,
        voucher_type: 'kvittering',
        payment_status: 'paid',
        paid_date: input.paidDateYmd,
      })
      .select('id')
      .single()
    if (!vErr && voucher) voucherId = voucher.id
    else if (vErr) console.error('subscription-invoice: voucher insert failed', vErr)
  } else {
    console.error('subscription-invoice: pdf upload failed', upErr)
  }

  // 6. Knyt bilag + PDF-sti til fakturaregisteret.
  await admin
    .from('platform_subscription_invoices')
    .update({ voucher_id: voucherId, pdf_storage_path: upErr ? null : storagePath })
    .eq('id', ledger.id)

  // 7. Mail kvittering + PDF til virksomheden.
  const to = (input.recipientEmail ?? company.invoice_email ?? '').trim()
  if (to) {
    const { data: pub } = await admin
      .from('platform_public_settings')
      .select('email_templates')
      .eq('id', 1)
      .maybeSingle()
    const templates = mergeEmailTemplates(pub?.email_templates)
    const periodLabel =
      input.periodStartYmd && input.periodEndYmd
        ? `${daDate(input.periodStartYmd)} – ${daDate(input.periodEndYmd)}`
        : '—'
    const rendered = renderFinalEmail('subscription_invoice', templates, {
      company_name: company.name,
      invoice_number: invoiceNumber,
      gross_amount: formatDkk(grossCents, input.currency),
      period: periodLabel,
      paid_date: daDate(input.paidDateYmd),
    })
    if (rendered) {
      const platform = await loadSmtpProfile(admin, 'platform')
      const smtp = platform.error ? await loadSmtpProfile(admin, 'transactional') : platform
      if (!smtp.error && smtp.profile) {
        const mail = await sendSmtpHtml({
          profile: smtp.profile,
          fromName: smtp.profile.from_name?.trim() || 'Bilago',
          to,
          subject: rendered.subject,
          html: rendered.html,
          attachments: [{ filename, content: pdfBytes }],
        })
        if (!mail.ok) console.error('subscription-invoice: email failed', mail.message)
      }
    }
  }

  return { ok: true, invoiceNumber }
}
