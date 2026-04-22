import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatDateLongNoTime } from '@/lib/format'
import type { Database } from '@/types/database'

type Invoice = Database['public']['Tables']['invoices']['Row']
type LineRow = Database['public']['Tables']['invoice_line_items']['Row']
type CompanyRow = Database['public']['Tables']['companies']['Row']

const MARGIN = 14
const LOGO_MAX_W_MM = 52
const LOGO_MAX_H_MM = 18

/** Standardtekst som på almindelige danske fakturaer (kan uddybes via bundtekst i indstillinger). */
const DEFAULT_LATE_PAYMENT_TEXT =
  'Ved betaling efter forfald tilskrives der renter på 0,0 % pr. påbegyndt måned, samt et gebyr på 100,00 DKK.'

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

function formatQty(q: number) {
  return new Intl.NumberFormat('da-DK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(q)
}

function netCalendarDays(issueIso: string, dueIso: string): number {
  const a = new Date(issueIso + 'T12:00:00').getTime()
  const b = new Date(dueIso + 'T12:00:00').getTime()
  return Math.max(0, Math.round((b - a) / 86400000))
}

function addressBlock(c: CompanyRow): string[] {
  const lines: string[] = []
  if (c.street_address?.trim()) lines.push(c.street_address.trim())
  const pc = [c.postal_code?.trim(), c.city?.trim()].filter(Boolean).join(' ')
  if (pc) lines.push(pc)
  return lines
}

function formatCvrLine(cvr: string | null): string | null {
  const t = cvr?.trim()
  if (!t) return null
  return `Cvr-nr. ${t}`
}

function guessImageFormat(dataUrl: string): 'PNG' | 'JPEG' {
  if (dataUrl.includes('image/jpeg') || dataUrl.includes('image/jpg')) return 'JPEG'
  return 'PNG'
}

function logoDimensionsMm(doc: jsPDF, dataUrl: string): { w: number; h: number } {
  try {
    const p = doc.getImageProperties(dataUrl)
    const iw = p.width || 1
    const ih = p.height || 1
    const ar = iw / ih
    let w = LOGO_MAX_W_MM
    let h = w / ar
    if (h > LOGO_MAX_H_MM) {
      h = LOGO_MAX_H_MM
      w = h * ar
    }
    return { w, h }
  } catch {
    return { w: LOGO_MAX_W_MM, h: LOGO_MAX_H_MM / (16 / 9) }
  }
}

function dominantVatLabel(lines: LineRow[]): string {
  if (lines.length === 0) return 'Moms'
  const rates = new Set(lines.map((l) => l.vat_rate))
  if (rates.size === 1) {
    const r = [...rates][0]
    return `Moms (${r % 1 === 0 ? String(Math.round(r)) : String(r)} %)`
  }
  return 'Moms'
}

function companyFooterOneLiner(company: CompanyRow): string {
  const parts: string[] = [company.name.trim()]
  for (const line of addressBlock(company)) parts.push(line)
  if (company.cvr?.trim()) parts.push(`CVR-nr. ${company.cvr.trim()}`)
  if (company.invoice_phone?.trim()) parts.push(`Tlf. ${company.invoice_phone.trim()}`)
  if (company.invoice_website?.trim()) {
    const w = company.invoice_website.trim().replace(/^https?:\/\//i, '')
    parts.push(`Web: ${w}`)
  }
  if (company.invoice_email?.trim()) parts.push(`Mail: ${company.invoice_email.trim()}`)
  return parts.join(' / ')
}

function estimateBottomBlockHeightMm(doc: jsPDF, company: CompanyRow, contentW: number): number {
  doc.setFont('helvetica', 'normal')
  let h = 0
  h += 5.5
  h += 5
  const bankParts: string[] = []
  if (company.bank_reg_number?.trim() && company.bank_account_number?.trim()) {
    bankParts.push(`Reg.nr. ${company.bank_reg_number.trim()}`)
    bankParts.push(`Kontonr. ${company.bank_account_number.trim()}`)
  }
  if (company.iban?.trim()) bankParts.push(`IBAN ${company.iban.trim()}`)
  if (bankParts.length > 0) h += 5.5
  h += 6
  doc.setFontSize(8.5)
  h += 4 + doc.splitTextToSize(DEFAULT_LATE_PAYMENT_TEXT, contentW).length * 4
  if (company.invoice_footer_note?.trim()) {
    h += 2
    h += 4 + doc.splitTextToSize(company.invoice_footer_note.trim(), contentW).length * 4
  }
  h += 3
  doc.setFontSize(8)
  h += footerSplitLineHeightMm(doc, companyFooterOneLiner(company), contentW)
  doc.setFontSize(9)
  return h
}

function footerSplitLineHeightMm(doc: jsPDF, text: string, contentW: number): number {
  const lines = doc.splitTextToSize(text, contentW).length
  return lines * 4.2
}

/**
 * Faktura-PDF: kunde øverst til venstre, udsteder med logo øverst til højre,
 * linjetabel fuld bredde, betalingsblok i bunden af siden.
 */
export function generateInvoicePdfBlob(
  company: CompanyRow,
  invoice: Invoice,
  lines: LineRow[],
  logoDataUrl?: string | null,
): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const rightX = pageW - MARGIN
  const contentW = pageW - 2 * MARGIN
  let y = 12

  const leftColW = pageW * 0.48
  const issuerStartY = y

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 30, 40)
  doc.text(invoice.customer_name.trim(), MARGIN, y)
  y += 5.5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(55, 55, 65)
  if (invoice.customer_email?.trim()) {
    doc.text(invoice.customer_email.trim(), MARGIN, y)
    y += 4.5
  }

  const leftBlockEndY = y + 4

  let logoBottomY = issuerStartY
  if (logoDataUrl) {
    try {
      const fmt = guessImageFormat(logoDataUrl)
      const { w, h } = logoDimensionsMm(doc, logoDataUrl)
      const lx = rightX - w
      doc.addImage(logoDataUrl, fmt, lx, issuerStartY, w, h)
      logoBottomY = issuerStartY + h + 3
    } catch {
      logoBottomY = issuerStartY
    }
  } else {
    logoBottomY = issuerStartY
  }

  let ry = Math.max(logoBottomY, issuerStartY + 2)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 30, 40)
  doc.text(company.name.trim(), rightX, ry, { align: 'right' })
  ry += 4.5
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(55, 55, 65)
  for (const line of addressBlock(company)) {
    doc.text(line, rightX, ry, { align: 'right' })
    ry += 4.2
  }
  const cvrLine = formatCvrLine(company.cvr)
  if (cvrLine) {
    doc.text(cvrLine, rightX, ry, { align: 'right' })
    ry += 4.2
  }
  if (company.invoice_phone?.trim()) {
    doc.text(`Tlf. ${company.invoice_phone.trim()}`, rightX, ry, { align: 'right' })
    ry += 4.2
  }
  if (company.invoice_email?.trim()) {
    doc.text(`Mail: ${company.invoice_email.trim()}`, rightX, ry, { align: 'right' })
    ry += 4.2
  }
  if (company.invoice_website?.trim()) {
    const w = company.invoice_website.trim().replace(/^https?:\/\//i, '')
    doc.text(`Web: ${w}`, rightX, ry, { align: 'right' })
    ry += 4.2
  }

  y = Math.max(leftBlockEndY, ry) + 10

  const titleY = y
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 30, 40)
  doc.text('Faktura', MARGIN, titleY)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(55, 55, 65)
  doc.text(`Dato ${formatDateLongNoTime(invoice.issue_date)}`, rightX, titleY, { align: 'right' })
  const invNo = String(invoice.invoice_number ?? '—')
  doc.text(`Fakturanr. ${invNo}`, rightX, titleY + 4.5, { align: 'right' })

  y = titleY + Math.max(12, 4.5 + 5)

  if (invoice.notes?.trim()) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(80, 80, 90)
    const split = doc.splitTextToSize(invoice.notes.trim(), leftColW)
    doc.text(split, MARGIN, y)
    y += 4 + split.length * 4.2
  }

  const sorted = [...lines].sort((a, b) => a.sort_order - b.sort_order)
  const body =
    sorted.length > 0
      ? sorted.map((l) => [
          l.description,
          formatQty(Number(l.quantity)),
          'stk.',
          money(l.unit_price_cents, invoice.currency),
          money(l.line_net_cents, invoice.currency),
        ])
      : [['Ingen linjer', '—', '—', '—', '—']]

  const tw = contentW
  const c0 = Math.floor(tw * 0.4)
  const c1 = Math.floor(tw * 0.11)
  const c2 = Math.floor(tw * 0.09)
  const c3 = Math.floor(tw * 0.2)
  const c4 = tw - c0 - c1 - c2 - c3

  autoTable(doc, {
    startY: y,
    head: [['Beskrivelse', 'Antal', 'Enhed', 'Enhedspris', 'Pris']],
    body,
    styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: [45, 45, 55], textColor: 255 },
    tableWidth: tw,
    columnStyles: {
      0: { cellWidth: c0 },
      1: { cellWidth: c1, halign: 'right' },
      2: { cellWidth: c2, halign: 'center' },
      3: { cellWidth: c3, halign: 'right' },
      4: { cellWidth: c4, halign: 'right' },
    },
    margin: { left: MARGIN, right: MARGIN },
  })

  const docExt = doc as unknown as { lastAutoTable?: { finalY: number } }
  const finalY = docExt.lastAutoTable?.finalY ?? y + 50
  let ty = finalY + 8

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(45, 45, 55)
  const vatTitle = dominantVatLabel(sorted)
  const labelX = rightX - 46
  doc.text('Subtotal', labelX, ty)
  doc.text(money(invoice.net_cents, invoice.currency), rightX, ty, { align: 'right' })
  ty += 5.5
  doc.text(vatTitle, labelX, ty)
  doc.text(money(invoice.vat_cents, invoice.currency), rightX, ty, { align: 'right' })
  ty += 5.5
  doc.setFont('helvetica', 'bold')
  doc.text(`Total ${invoice.currency}`, labelX, ty)
  doc.text(money(invoice.gross_cents, invoice.currency), rightX, ty, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  ty += 10

  const bottomH = estimateBottomBlockHeightMm(doc, company, contentW)
  const minGapAfterTotals = 8
  let yPay = pageH - MARGIN - bottomH
  if (yPay < ty + minGapAfterTotals) {
    yPay = ty + minGapAfterTotals
  }

  const netDays = netCalendarDays(invoice.issue_date, invoice.due_date)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(45, 45, 55)
  let py = yPay
  doc.text(
    `Betalingsbetingelser: Netto ${netDays} dage — Forfaldsdato: ${formatDateLongNoTime(invoice.due_date)}`,
    MARGIN,
    py,
  )
  py += 5.5

  doc.text('Beløbet indbetales på bankkonto:', MARGIN, py)
  py += 5

  const bankLineParts: string[] = []
  if (company.bank_reg_number?.trim() && company.bank_account_number?.trim()) {
    bankLineParts.push(`Reg.nr. ${company.bank_reg_number.trim()}`)
    bankLineParts.push(`Kontonr. ${company.bank_account_number.trim()}`)
  }
  if (company.iban?.trim()) {
    bankLineParts.push(`IBAN ${company.iban.trim()}`)
  }
  if (bankLineParts.length > 0) {
    doc.text(bankLineParts.join(' / '), MARGIN, py)
    py += 5.5
  }

  doc.text(
    `Fakturanr. ${invNo} bedes angivet ved bankoverførsel.`,
    MARGIN,
    py,
  )
  py += 6

  doc.setFontSize(8.5)
  doc.setTextColor(55, 55, 65)
  const lateLines = doc.splitTextToSize(DEFAULT_LATE_PAYMENT_TEXT, contentW)
  doc.text(lateLines, MARGIN, py)
  py += 4 + lateLines.length * 4

  if (company.invoice_footer_note?.trim()) {
    py += 2
    const extra = doc.splitTextToSize(company.invoice_footer_note.trim(), contentW)
    doc.text(extra, MARGIN, py)
    py += 4 + extra.length * 4
  }

  py += 3
  doc.setFontSize(8)
  doc.setTextColor(70, 70, 80)
  const oneLiner = companyFooterOneLiner(company)
  const footerSplit = doc.splitTextToSize(oneLiner, contentW)
  doc.text(footerSplit, MARGIN, py)

  return doc.output('blob')
}
