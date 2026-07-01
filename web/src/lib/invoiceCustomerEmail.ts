import { invokePlatformEmail } from '@/lib/edge'
import type { Database } from '@/types/database'

type Company = Database['public']['Tables']['companies']['Row']

export type InvoiceEmailKind = 'invoice_sent' | 'invoice_reminder' | 'invoice_dunning'

/**
 * Sender fakturaen/påmindelsen til kundens e-mail via platform-email.
 * PDF'en genereres og vedhæftes server-side (styret af company.invoice_attach_pdf_to_email),
 * så både manuel afsendelse og automatiske påmindelser bruger den samme kilde.
 */
export async function sendInvoiceToCustomerEmail(opts: {
  company: Company
  invoiceId: string
  kind: InvoiceEmailKind
}): Promise<void> {
  const { invoiceId, kind } = opts
  await invokePlatformEmail(kind, { invoice_id: invoiceId })
}
