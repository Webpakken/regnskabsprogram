// Bygger Bilagos EGEN abonnements-faktura (Bilago som sælger, virksomheden som
// køber) som en allerede-betalt kvittering. Sælger-oplysningerne læses fra
// Supabase-secrets, så de kan opdateres uden kodeændring.
import {
  generateInvoicePdfBytes,
  type PdfCompany,
  type PdfInvoice,
  type PdfLine,
} from './invoicePdf.ts'
import { BILAGO_LOGO_DATA_URL } from './bilagoLogo.ts'

function env(name: string, fallback = ''): string {
  const v = Deno.env.get(name)
  return v && v.trim().length > 0 ? v.trim() : fallback
}

/** Bilago som sælger — konfigureres via secrets (BILAGO_SELLER_*). */
export function bilagoSeller(): PdfCompany {
  return {
    name: env('BILAGO_SELLER_NAME', 'Bilago'),
    street_address: env('BILAGO_SELLER_STREET') || null,
    postal_code: env('BILAGO_SELLER_POSTAL') || null,
    city: env('BILAGO_SELLER_CITY') || null,
    cvr: env('BILAGO_SELLER_CVR') || null,
    invoice_phone: env('BILAGO_SELLER_PHONE') || null,
    invoice_website: env('BILAGO_SELLER_WEBSITE', 'https://bilago.dk'),
    invoice_email: env('BILAGO_SELLER_EMAIL', 'support@bilago.dk'),
    bank_reg_number: env('BILAGO_SELLER_BANK_REG') || null,
    bank_account_number: env('BILAGO_SELLER_BANK_ACCT') || null,
    iban: env('BILAGO_SELLER_IBAN') || null,
    invoice_footer_note: null,
  }
}

export type SubscriptionInvoiceParams = {
  invoiceNumber: string
  /** YYYY-MM-DD — udstedelses-/betalingsdato. */
  issueDate: string
  currency: string
  grossCents: number
  netCents: number
  vatCents: number
  vatRate: number
  planName: string
  periodStart?: string | null
  periodEnd?: string | null
  buyer: {
    name: string
    address?: string | null
    zip?: string | null
    city?: string | null
    cvr?: string | null
    email?: string | null
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

export function generateSubscriptionInvoicePdfBytes(
  p: SubscriptionInvoiceParams,
): Uint8Array {
  const periodLabel =
    p.periodStart && p.periodEnd
      ? ` (${daDate(p.periodStart)} – ${daDate(p.periodEnd)})`
      : ''
  const description = `${p.planName}${periodLabel}`

  const invoice: PdfInvoice = {
    invoice_number: p.invoiceNumber,
    customer_name: p.buyer.name,
    customer_address: p.buyer.address ?? null,
    customer_zip: p.buyer.zip ?? null,
    customer_city: p.buyer.city ?? null,
    customer_cvr: p.buyer.cvr ?? null,
    customer_phone: null,
    customer_email: p.buyer.email ?? null,
    notes: null,
    issue_date: p.issueDate,
    due_date: p.issueDate,
    currency: p.currency,
    net_cents: p.netCents,
    vat_cents: p.vatCents,
    gross_cents: p.grossCents,
  }

  const line: PdfLine = {
    description,
    quantity: 1,
    unit_price_cents: p.netCents,
    line_net_cents: p.netCents,
    vat_rate: p.vatRate,
    sort_order: 1,
  }

  return generateInvoicePdfBytes(bilagoSeller(), invoice, [line], BILAGO_LOGO_DATA_URL, {
    heading: 'Faktura',
    paidNote: `Betalt med betalingskort d. ${daDate(p.issueDate)}. Beløbet er trukket automatisk via Stripe.`,
  })
}
