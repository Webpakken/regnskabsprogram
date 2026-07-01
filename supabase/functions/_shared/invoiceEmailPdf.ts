// Bygger faktura-PDF'en til e-mail-vedhæftning server-side, så både
// platform-email og invoice-automation-reminders altid kan vedhæfte den samme
// PDF som klienten viser. Historiske (importerede) fakturaer har ingen linjer i
// Bilago — deres oprindelige PDF ligger i invoice-archive-bucketten og bruges direkte.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  generateInvoicePdfBytes,
  type InvoicePdfOptions,
  type PdfCompany,
  type PdfInvoice,
  type PdfLine,
} from './invoicePdf.ts'

type Admin = SupabaseClient

const INVOICE_COLUMNS =
  'id, company_id, invoice_number, customer_name, customer_email, customer_cvr, customer_phone, customer_address, customer_zip, customer_city, issue_date, due_date, currency, net_cents, vat_cents, gross_cents, notes, credited_invoice_id, is_historical, attachment_path'

const COMPANY_COLUMNS =
  'name, street_address, postal_code, city, cvr, invoice_phone, invoice_website, invoice_email, bank_reg_number, bank_account_number, iban, invoice_footer_note, invoice_logo_path'

export type InvoicePdfAttachment = { filename: string; content: Uint8Array }

function base64FromBytes(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

async function logoDataUrl(
  admin: Admin,
  path: string | null | undefined,
): Promise<string | null> {
  if (!path?.trim()) return null
  try {
    const { data, error } = await admin.storage
      .from('company-logos')
      .download(path.trim())
    if (error || !data) return null
    const bytes = new Uint8Array(await data.arrayBuffer())
    if (bytes.length === 0) return null
    const mime = data.type && data.type.length > 0 ? data.type : 'image/png'
    return `data:${mime};base64,${base64FromBytes(bytes)}`
  } catch {
    return null
  }
}

function safeFilename(invoiceNum: string): string {
  const safeNum = (invoiceNum || 'faktura').replace(/[^\w.\-]+/g, '_')
  return `faktura-${safeNum}.pdf`
}

/**
 * Returnerer PDF-vedhæftning for en faktura, eller null hvis den ikke kan bygges
 * (fx manglende data). Kaster ikke — kaldere kan sende mailen uden PDF ved null.
 */
export async function buildInvoicePdfAttachment(
  admin: Admin,
  invoiceId: string,
): Promise<InvoicePdfAttachment | null> {
  try {
    const { data: inv, error: invErr } = await admin
      .from('invoices')
      .select(INVOICE_COLUMNS)
      .eq('id', invoiceId)
      .maybeSingle()
    if (invErr || !inv) return null

    const invoiceNum = String((inv as { invoice_number?: unknown }).invoice_number ?? '').trim()
    const filename = safeFilename(invoiceNum)

    // Importerede fakturaer: brug den arkiverede original-PDF direkte.
    if (inv.is_historical && inv.attachment_path) {
      const { data: blob, error } = await admin.storage
        .from('invoice-archive')
        .download(inv.attachment_path as string)
      if (error || !blob) return null
      const bytes = new Uint8Array(await blob.arrayBuffer())
      if (bytes.length === 0) return null
      return { filename, content: bytes }
    }

    const { data: company, error: coErr } = await admin
      .from('companies')
      .select(COMPANY_COLUMNS)
      .eq('id', inv.company_id)
      .maybeSingle()
    if (coErr || !company) return null

    const { data: lines } = await admin
      .from('invoice_line_items')
      .select('description, quantity, unit_price_cents, line_net_cents, vat_rate, sort_order')
      .eq('invoice_id', invoiceId)
      .order('sort_order', { ascending: true })

    // Kreditnota-overskrift som i klienten (pdfOptionsForInvoice).
    let pdfOptions: InvoicePdfOptions | undefined
    if (inv.credited_invoice_id) {
      const { data: ref } = await admin
        .from('invoices')
        .select('invoice_number')
        .eq('id', inv.credited_invoice_id)
        .maybeSingle()
      const n = ref?.invoice_number
      pdfOptions = {
        heading: 'Kreditnota',
        creditReferenceLine: n ? `Krediterer faktura ${n}` : 'Kreditnota',
      }
    }

    const logo = await logoDataUrl(admin, (company as { invoice_logo_path?: string | null }).invoice_logo_path)

    const bytes = generateInvoicePdfBytes(
      company as unknown as PdfCompany,
      inv as unknown as PdfInvoice,
      (lines ?? []) as unknown as PdfLine[],
      logo,
      pdfOptions,
    )
    if (bytes.length === 0) return null
    return { filename, content: bytes }
  } catch {
    return null
  }
}
