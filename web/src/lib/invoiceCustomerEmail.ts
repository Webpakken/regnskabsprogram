import { supabase } from '@/lib/supabase'
import { blobToBase64 } from '@/lib/blobToBase64'
import { fetchCompanyLogoDataUrl } from '@/lib/invoiceBranding'
import { generateInvoicePdfBlob, type InvoicePdfOptions } from '@/lib/invoicePdf'
import { invokePlatformEmail } from '@/lib/edge'
import type { Database } from '@/types/database'

type Company = Database['public']['Tables']['companies']['Row']
type Invoice = Database['public']['Tables']['invoices']['Row']
type LineRow = Database['public']['Tables']['invoice_line_items']['Row']

export type InvoiceEmailKind = 'invoice_sent' | 'invoice_reminder' | 'invoice_dunning'

async function pdfOptionsForInvoice(
  inv: Invoice,
): Promise<InvoicePdfOptions | undefined> {
  if (!inv.credited_invoice_id) return undefined
  const { data: ref } = await supabase
    .from('invoices')
    .select('invoice_number')
    .eq('id', inv.credited_invoice_id)
    .maybeSingle()
  const n = ref?.invoice_number
  return {
    heading: 'Kreditnota',
    creditReferenceLine: n ? `Krediterer faktura ${n}` : 'Kreditnota',
  }
}

/** Sender til kundens e-mail via platform-email (valgfri PDF vedhæftning som ved «sendt faktura»). */
export async function sendInvoiceToCustomerEmail(opts: {
  company: Company
  invoiceId: string
  kind: InvoiceEmailKind
}): Promise<void> {
  const { company, invoiceId, kind } = opts
  const attach = company.invoice_attach_pdf_to_email !== false
  const payload: Record<string, unknown> = { invoice_id: invoiceId }
  if (attach) {
    try {
      const { data: inv, error: e1 } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .eq('company_id', company.id)
        .single()
      if (!e1 && inv) {
        // Importerede fakturaer har ingen line items i Bilago — den oprindelige
        // PDF ligger i invoice-archive-bucketten. Brug den i stedet for at
        // generere en tom PDF.
        if ((inv as Invoice).is_historical && (inv as Invoice).attachment_path) {
          const { data: blob } = await supabase.storage
            .from('invoice-archive')
            .download((inv as Invoice).attachment_path as string)
          if (blob) {
            payload.invoice_pdf_base64 = await blobToBase64(blob)
          }
        } else {
          const { data: li } = await supabase
            .from('invoice_line_items')
            .select('*')
            .eq('invoice_id', invoiceId)
            .order('sort_order', { ascending: true })
          if (li) {
            const logo = await fetchCompanyLogoDataUrl(company.invoice_logo_path)
            const optsPdf = await pdfOptionsForInvoice(inv as Invoice)
            const blob = generateInvoicePdfBlob(
              company,
              inv as Invoice,
              li as LineRow[],
              logo,
              optsPdf,
            )
            payload.invoice_pdf_base64 = await blobToBase64(blob)
          }
        }
      }
    } catch {
      /* e-mail uden PDF */
    }
  }
  await invokePlatformEmail(kind, payload)
}
