import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Database } from '@/types/database'

type Invoice = Database['public']['Tables']['invoices']['Row']
type LineRow = Database['public']['Tables']['invoice_line_items']['Row']
type CompanyRow = Database['public']['Tables']['companies']['Row']

function money(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat('da-DK', {
      style: 'currency',
      currency: currency || 'DKK',
    }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`
  }
}

function formatDaDate(iso: string) {
  try {
    return new Intl.DateTimeFormat('da-DK', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date(iso + 'T12:00:00'))
  } catch {
    return iso
  }
}

function addressBlock(c: CompanyRow): string[] {
  const lines: string[] = []
  if (c.street_address?.trim()) lines.push(c.street_address.trim())
  const pc = [c.postal_code?.trim(), c.city?.trim()].filter(Boolean).join(' ')
  if (pc) lines.push(pc)
  return lines
}

function guessImageFormat(dataUrl: string): 'PNG' | 'JPEG' {
  if (dataUrl.includes('image/jpeg') || dataUrl.includes('image/jpg')) return 'JPEG'
  return 'PNG'
}

/**
 * Genererer faktura-PDF med virksomheds-header (logo, adresse, betaling) fra company-rækken.
 */
export function generateInvoicePdfBlob(
  company: CompanyRow,
  invoice: Invoice,
  lines: LineRow[],
  logoDataUrl?: string | null,
): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  let y = 14

  if (logoDataUrl) {
    try {
      const fmt = guessImageFormat(logoDataUrl)
      const w = 42
      const h = 14
      doc.addImage(logoDataUrl, fmt, pageW - w - 14, y, w, h)
    } catch {
      /* jsPDF understøtter ikke billedformat eller korrupt data */
    }
  }

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 30, 40)
  doc.text(company.name, 14, y + 5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(70, 70, 80)
  let ly = y + 10
  for (const line of addressBlock(company)) {
    doc.text(line, 14, ly)
    ly += 4.5
  }
  if (company.cvr?.trim()) {
    doc.text(`CVR: ${company.cvr.trim()}`, 14, ly)
    ly += 4.5
  }
  if (company.invoice_phone?.trim()) {
    doc.text(`Tlf.: ${company.invoice_phone.trim()}`, 14, ly)
    ly += 4.5
  }
  if (company.invoice_email?.trim()) {
    doc.text(`E-mail: ${company.invoice_email.trim()}`, 14, ly)
    ly += 4.5
  }
  if (company.invoice_website?.trim()) {
    doc.text(`Web: ${company.invoice_website.trim()}`, 14, ly)
    ly += 4.5
  }

  y = Math.max(ly + 6, logoDataUrl ? 34 : ly + 6)

  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 30, 40)
  doc.text('Faktura', 14, y)
  y += 10

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(70, 70, 80)
  doc.text(`Faktura nr. ${invoice.invoice_number}`, 14, y)
  y += 6

  doc.setFontSize(11)
  doc.setTextColor(30, 30, 40)
  doc.text(`Kunde: ${invoice.customer_name}`, 14, y)
  y += 5
  if (invoice.customer_email) {
    doc.setFontSize(10)
    doc.setTextColor(70, 70, 80)
    doc.text(`E-mail: ${invoice.customer_email}`, 14, y)
    y += 5
  }
  doc.text(`Fakturadato: ${formatDaDate(invoice.issue_date)}`, 14, y)
  y += 5
  doc.text(`Forfaldsdato: ${formatDaDate(invoice.due_date)}`, 14, y)
  y += 5

  const statusDa: Record<Invoice['status'], string> = {
    draft: 'Kladde',
    sent: 'Sendt',
    paid: 'Betalt',
    cancelled: 'Annulleret',
  }
  doc.text(`Status: ${statusDa[invoice.status]}`, 14, y)
  y += 10

  if (invoice.notes?.trim()) {
    doc.setFontSize(9)
    doc.setTextColor(90, 90, 100)
    const split = doc.splitTextToSize(invoice.notes, pageW - 28)
    doc.text(split, 14, y)
    y += 4 + split.length * 4.5
  }

  const sorted = [...lines].sort((a, b) => a.sort_order - b.sort_order)
  const body =
    sorted.length > 0
      ? sorted.map((l) => [
          l.description,
          String(l.quantity).replace('.', ','),
          money(l.unit_price_cents, invoice.currency),
          `${l.vat_rate} %`,
          money(l.line_net_cents, invoice.currency),
          money(l.line_vat_cents, invoice.currency),
          money(l.line_gross_cents, invoice.currency),
        ])
      : [
          [
            'Ingen linjer',
            '—',
            '—',
            '—',
            '—',
            '—',
            '—',
          ],
        ]

  autoTable(doc, {
    startY: y,
    head: [
      [
        'Beskrivelse',
        'Antal',
        'á pris',
        'Moms',
        'Netto',
        'Moms kr.',
        'Brutto',
      ],
    ],
    body,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [79, 70, 229], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 42 },
      1: { halign: 'right', cellWidth: 16 },
      2: { halign: 'right' },
      3: { halign: 'center', cellWidth: 14 },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
    },
    margin: { left: 14, right: 14 },
  })

  const docExt = doc as unknown as { lastAutoTable?: { finalY: number } }
  const finalY = docExt.lastAutoTable?.finalY ?? y + 50
  let ty = finalY + 10

  doc.setFontSize(10)
  doc.setTextColor(50, 50, 60)
  const rightX = pageW - 14
  doc.text(`Netto: ${money(invoice.net_cents, invoice.currency)}`, rightX, ty, {
    align: 'right',
  })
  ty += 6
  doc.text(`Moms: ${money(invoice.vat_cents, invoice.currency)}`, rightX, ty, {
    align: 'right',
  })
  ty += 6
  doc.setFont('helvetica', 'bold')
  doc.text(`Brutto: ${money(invoice.gross_cents, invoice.currency)}`, rightX, ty, {
    align: 'right',
  })
  doc.setFont('helvetica', 'normal')

  ty += 10
  const bankParts: string[] = []
  if (company.bank_reg_number?.trim() && company.bank_account_number?.trim()) {
    bankParts.push(`Reg.nr ${company.bank_reg_number.trim()} · Konto ${company.bank_account_number.trim()}`)
  }
  if (company.iban?.trim()) {
    bankParts.push(`IBAN ${company.iban.trim()}`)
  }
  if (bankParts.length > 0) {
    doc.setFontSize(8)
    doc.setTextColor(60, 60, 70)
    doc.text(bankParts.join(' · '), 14, ty)
    ty += 5
  }

  ty += 4
  doc.setFontSize(8)
  doc.setTextColor(120, 120, 130)
  if (company.invoice_footer_note?.trim()) {
    const foot = doc.splitTextToSize(company.invoice_footer_note.trim(), pageW - 28)
    doc.text(foot, 14, ty)
    ty += 4 + foot.length * 3.8
  }
  doc.text('Genereret i Bilago — ikke en juridisk e-faktura.', 14, ty)

  return doc.output('blob')
}
