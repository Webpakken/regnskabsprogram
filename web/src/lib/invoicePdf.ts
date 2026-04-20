import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Database } from '@/types/database'

type Invoice = Database['public']['Tables']['invoices']['Row']
type LineRow = Database['public']['Tables']['invoice_line_items']['Row']

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

/**
 * Genererer en simpel faktura-PDF til visning/download i browseren.
 */
export function generateInvoicePdfBlob(
  companyName: string,
  invoice: Invoice,
  lines: LineRow[],
): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  let y = 18

  doc.setFontSize(20)
  doc.setTextColor(30, 30, 40)
  doc.text('Faktura', 14, y)
  y += 10

  doc.setFontSize(10)
  doc.setTextColor(70, 70, 80)
  doc.text(companyName, 14, y)
  y += 8

  doc.setFontSize(11)
  doc.setTextColor(30, 30, 40)
  doc.text(`Faktura nr. ${invoice.invoice_number}`, 14, y)
  y += 6

  doc.setFontSize(10)
  doc.text(`Kunde: ${invoice.customer_name}`, 14, y)
  y += 5
  if (invoice.customer_email) {
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

  ty += 12
  doc.setFontSize(8)
  doc.setTextColor(120, 120, 130)
  doc.text('Genereret i Bilago — ikke en juridisk e-faktura.', 14, ty)

  return doc.output('blob')
}
