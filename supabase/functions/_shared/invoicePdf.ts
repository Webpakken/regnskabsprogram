// Server-side (Deno) port af web/src/lib/invoicePdf.ts.
// Genererer den samme faktura-PDF som klienten, men returnerer rå bytes klar
// til e-mail-vedhæftning. Bruges af platform-email og invoice-automation-reminders
// samt (via en wrapper) Bilagos egne abonnements-fakturaer.
import { jsPDF } from 'https://esm.sh/jspdf@4.2.1?target=deno'
import autoTable from 'https://esm.sh/jspdf-autotable@5.0.7?deps=jspdf@4.2.1&target=deno'

const APP_TIMEZONE = 'Europe/Copenhagen'

/** Kun de kolonner PDF'en faktisk bruger — så modulet er uafhængigt af web-typerne. */
export type PdfCompany = {
  name: string
  street_address?: string | null
  postal_code?: string | null
  city?: string | null
  cvr?: string | null
  invoice_phone?: string | null
  invoice_website?: string | null
  invoice_email?: string | null
  bank_reg_number?: string | null
  bank_account_number?: string | null
  iban?: string | null
  invoice_footer_note?: string | null
}

export type PdfInvoice = {
  invoice_number: string | number
  customer_name?: string | null
  customer_address?: string | null
  customer_zip?: string | null
  customer_city?: string | null
  customer_cvr?: string | null
  customer_phone?: string | null
  customer_email?: string | null
  notes?: string | null
  issue_date: string
  due_date: string
  currency: string
  net_cents: number
  vat_cents: number
  gross_cents: number
}

export type PdfLine = {
  description: string
  quantity: number
  unit_price_cents: number
  line_net_cents: number
  vat_rate: number
  sort_order: number
}

export type InvoicePdfOptions = {
  /** Standard: «Faktura»; kreditnota: «Kreditnota». */
  heading?: string
  /** Vises som overskrift når sat (fx «Krediterring af faktura 1033»). */
  creditReferenceLine?: string | null
  /**
   * Når sat (og ikke kreditnota): erstat bankoverførsels-/betalingsbetingelses-blokken
   * med denne «Betalt»-note. Bruges til allerede betalte kvitteringer (fx kort-betaling).
   */
  paidNote?: string | null
}

const MARGIN = 18
const LOGO_MAX_W_MM = 60
const LOGO_MAX_H_MM = 22

const DEFAULT_LATE_PAYMENT_TEXT =
  'Ved betaling efter forfald tilskrives der renter på 0,0 % pr. påbegyndt måned, samt et gebyr på 100,00 DKK.'

function money(cents: number) {
  return new Intl.NumberFormat('da-DK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

function formatQty(q: number) {
  return new Intl.NumberFormat('da-DK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(q)
}

/** Dato uden tid med langt månedsnavn (faktura-PDF). Port af format.ts. */
function formatDateLongNoTime(iso: string): string {
  const d = iso.slice(0, 10)
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split('-').map(Number)
    return new Intl.DateTimeFormat('da-DK', opts).format(
      new Date(Date.UTC(y, m - 1, day, 12, 0, 0)),
    )
  }
  return new Intl.DateTimeFormat('da-DK', opts).format(new Date(iso))
}

function netCalendarDays(issueIso: string, dueIso: string): number {
  const a = new Date(issueIso + 'T12:00:00').getTime()
  const b = new Date(dueIso + 'T12:00:00').getTime()
  return Math.max(0, Math.round((b - a) / 86400000))
}

function addressBlock(c: PdfCompany): string[] {
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

function dominantVatLabel(lines: PdfLine[]): string {
  if (lines.length === 0) return 'Moms'
  const rates = new Set(lines.map((l) => l.vat_rate))
  if (rates.size === 1) {
    const r = [...rates][0]
    const formatted =
      r % 1 === 0
        ? `${Math.round(r)},00`
        : new Intl.NumberFormat('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(r)
    return `Moms (${formatted}%)`
  }
  return 'Moms'
}

function companyFooterLines(company: PdfCompany): { line1: string; line2: string } {
  const line1Parts: string[] = [company.name.trim()]
  for (const line of addressBlock(company)) line1Parts.push(line)
  const line2Parts: string[] = []
  if (company.cvr?.trim()) line2Parts.push(`CVR-nr. ${company.cvr.trim()}`)
  if (company.invoice_phone?.trim()) line2Parts.push(`Tlf. ${company.invoice_phone.trim()}`)
  if (company.invoice_website?.trim()) {
    const w = company.invoice_website.trim().replace(/^https?:\/\//i, '')
    line2Parts.push(`Web: ${w}`)
  }
  if (company.invoice_email?.trim()) line2Parts.push(`Mail: ${company.invoice_email.trim()}`)
  return { line1: line1Parts.join(' / '), line2: line2Parts.join(' / ') }
}

/**
 * Faktura-PDF — Webpakken-inspireret stil (byte-for-byte port af klientens layout).
 * Returnerer rå PDF-bytes.
 */
export function generateInvoicePdfBytes(
  company: PdfCompany,
  invoice: PdfInvoice,
  lines: PdfLine[],
  logoDataUrl?: string | null,
  pdfOptions?: InvoicePdfOptions,
): Uint8Array {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const rightX = pageW - MARGIN
  const contentW = pageW - 2 * MARGIN
  const isCreditNote = !!pdfOptions?.creditReferenceLine?.trim()

  const topY = MARGIN

  // ── Top-venstre: kunde-blok (køber) ────────────────────────────────────
  let cy = topY
  const cName = invoice.customer_name?.trim()
  if (cName) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(20, 20, 30)
    doc.text(cName, MARGIN, cy)
    cy += 4.6
  }
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(70, 70, 80)
  const cAddr = invoice.customer_address?.trim()
  if (cAddr) {
    doc.text(cAddr, MARGIN, cy)
    cy += 4.2
  }
  const cZipCity = [invoice.customer_zip?.trim(), invoice.customer_city?.trim()]
    .filter(Boolean)
    .join(' ')
  if (cZipCity) {
    doc.text(cZipCity, MARGIN, cy)
    cy += 4.2
  }
  const cCvr = invoice.customer_cvr?.trim()
  if (cCvr) {
    doc.text(`CVR-nr. ${cCvr}`, MARGIN, cy)
    cy += 4.2
  }
  const cPhone = invoice.customer_phone?.trim()
  if (cPhone) {
    doc.text(`Tlf. ${cPhone}`, MARGIN, cy)
    cy += 4.2
  }
  const cEmail = invoice.customer_email?.trim()
  if (cEmail) {
    doc.text(cEmail, MARGIN, cy)
    cy += 4.2
  }
  const customerBottomY = cy

  // ── Top-højre: kun logo (sælger-info står i den centrerede footer) ─────
  let logoBottomY = topY
  if (logoDataUrl) {
    try {
      const fmt = guessImageFormat(logoDataUrl)
      const { w, h } = logoDimensionsMm(doc, logoDataUrl)
      const lx = rightX - w + 4
      doc.addImage(logoDataUrl, fmt, lx, topY, w, h)
      logoBottomY = topY + h
    } catch {
      /* ignore */
    }
  }

  let y = Math.max(customerBottomY, logoBottomY) + 14

  // ── Notes (fx "Del 1 af 2 gennemført") — kun for fakturaer ─────────────
  if (!isCreditNote && invoice.notes?.trim()) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(70, 70, 80)
    const split = doc.splitTextToSize(invoice.notes.trim(), contentW)
    doc.text(split, MARGIN, y)
    y += 4.5 + (split.length - 1) * 4.5
  }

  // ── Stor titel + dato/fakturanr på samme linje ─────────────────────────
  y = Math.max(y + 8, pageH * 0.38)
  const heading = isCreditNote
    ? (pdfOptions?.creditReferenceLine?.trim() ?? 'Kreditnota')
    : (pdfOptions?.heading?.trim() || 'Faktura')
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(20, 20, 30)
  doc.text(heading, MARGIN, y)

  const invNo = String(invoice.invoice_number ?? '—')
  const numberLabel = isCreditNote ? 'Kreditnotanr. ' : 'Fakturanr. '
  const dateLabel = 'Dato: '
  const dateValue = formatDateLongNoTime(invoice.issue_date)

  doc.setFontSize(10)
  let metaY = y - 3
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(70, 70, 80)
  const dateValueW = doc.getTextWidth(dateValue)
  doc.text(dateLabel, rightX - dateValueW - doc.getTextWidth(dateLabel), metaY)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(20, 20, 30)
  doc.text(dateValue, rightX, metaY, { align: 'right' })

  metaY += 5.5
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(70, 70, 80)
  const invNoW = doc.getTextWidth(invNo)
  doc.text(numberLabel, rightX - invNoW - doc.getTextWidth(numberLabel), metaY)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(20, 20, 30)
  doc.text(invNo, rightX, metaY, { align: 'right' })

  y += 18

  // ── Linje-tabel (ren stil, lyse rammer) ─────────────────────────────────
  const sorted = [...lines].sort((a, b) => a.sort_order - b.sort_order)
  const body =
    sorted.length > 0
      ? sorted.map((l) => [
          l.description,
          formatQty(Number(l.quantity)),
          'stk.',
          money(l.unit_price_cents),
          money(l.line_net_cents),
        ])
      : [['Ingen linjer', '—', '—', '—', '—']]

  const tw = contentW
  const c0 = Math.floor(tw * 0.46)
  const c1 = Math.floor(tw * 0.1)
  const c2 = Math.floor(tw * 0.1)
  const c3 = Math.floor(tw * 0.17)
  const c4 = tw - c0 - c1 - c2 - c3

  autoTable(doc, {
    startY: y,
    head: [
      [
        { content: 'Beskrivelse', styles: { halign: 'left' } },
        { content: 'Antal', styles: { halign: 'right' } },
        { content: 'Enhed', styles: { halign: 'left' } },
        { content: 'Enhedspris', styles: { halign: 'right' } },
        { content: 'Pris', styles: { halign: 'right' } },
      ],
    ],
    body,
    theme: 'plain',
    styles: {
      fontSize: 9.5,
      cellPadding: { top: 2.2, right: 2, bottom: 2.2, left: 2 },
      overflow: 'linebreak',
      lineColor: [220, 220, 225],
      textColor: [40, 40, 50],
    },
    headStyles: {
      fontStyle: 'normal',
      textColor: [110, 110, 120],
      fillColor: false as unknown as undefined,
      lineWidth: { top: 0, right: 0, bottom: 0.2, left: 0 },
      lineColor: [200, 200, 210],
    },
    bodyStyles: {
      lineWidth: { top: 0, right: 0, bottom: 0.1, left: 0 },
      lineColor: [235, 235, 240],
    },
    tableWidth: tw,
    columnStyles: {
      0: { cellWidth: c0 },
      1: { cellWidth: c1, halign: 'right' },
      2: { cellWidth: c2, halign: 'left' },
      3: { cellWidth: c3, halign: 'right' },
      4: { cellWidth: c4, halign: 'right' },
    },
    margin: { left: MARGIN, right: MARGIN },
  })

  const docExt = doc as unknown as { lastAutoTable?: { finalY: number } }
  const finalY = docExt.lastAutoTable?.finalY ?? y + 50
  let ty = finalY + 6

  // ── Totaler højre-justeret ──────────────────────────────────────────────
  const totalsLabelX = pageW - MARGIN - 60
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(50, 50, 60)
  doc.text('Subtotal', totalsLabelX, ty)
  doc.text(money(invoice.net_cents), rightX, ty, { align: 'right' })
  ty += 5
  doc.text(dominantVatLabel(sorted), totalsLabelX, ty)
  doc.text(money(invoice.vat_cents), rightX, ty, { align: 'right' })
  ty += 5.5
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(20, 20, 30)
  doc.text(`Total ${invoice.currency}`, totalsLabelX, ty)
  doc.text(money(invoice.gross_cents), rightX, ty, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  ty += 12

  // ── Footer (centreret nederst på siden) ─────────────────────────────────
  const footer = companyFooterLines(company)
  const footerLineH = 4.2
  const footerBlockH = footer.line2 ? footerLineH * 2 + 2 : footerLineH
  const footerY = pageH - MARGIN - footerBlockH

  // ── Betalt-note (allerede betalte kvitteringer, fx kort) ────────────────
  if (!isCreditNote && pdfOptions?.paidNote?.trim()) {
    const paidLines = doc.splitTextToSize(pdfOptions.paidNote.trim(), contentW)
    const blockH = paidLines.length * 4.5
    const py = Math.max(ty, footerY - blockH - 8)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(40, 40, 50)
    doc.text(paidLines, MARGIN, py)
  } else if (!isCreditNote) {
    // ── Betalings-blok (kun for ubetalte fakturaer) ───────────────────────
    const netDays = netCalendarDays(invoice.issue_date, invoice.due_date)
    const lateLines = doc.splitTextToSize(DEFAULT_LATE_PAYMENT_TEXT, contentW)
    const extraLines = company.invoice_footer_note?.trim()
      ? doc.splitTextToSize(company.invoice_footer_note.trim(), contentW)
      : null

    doc.setFontSize(9.5)
    let bankLines = 0
    if (
      (company.bank_reg_number?.trim() && company.bank_account_number?.trim()) ||
      company.iban?.trim()
    ) {
      bankLines = 1
    }
    const blockH =
      4.5 +
      4.5 +
      bankLines * 4.5 +
      4.5 +
      3 +
      lateLines.length * 4 +
      (extraLines ? 2 + extraLines.length * 4 : 0)

    let py = Math.max(ty, footerY - blockH - 8)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(40, 40, 50)
    doc.text('Betalingsbetingelser: ', MARGIN, py)
    const lblW1 = doc.getTextWidth('Betalingsbetingelser: ')
    doc.text(`Netto ${netDays} dage - Forfaldsdato: `, MARGIN + lblW1, py)
    const lblW2 = doc.getTextWidth(`Netto ${netDays} dage - Forfaldsdato: `)
    doc.setFont('helvetica', 'bold')
    doc.text(formatDateLongNoTime(invoice.due_date), MARGIN + lblW1 + lblW2, py)
    doc.setFont('helvetica', 'normal')
    py += 6.5

    doc.text('Beløbet indbetales på bankkonto:', MARGIN, py)
    py += 5

    const bankLineParts: string[] = []
    if (company.bank_reg_number?.trim() && company.bank_account_number?.trim()) {
      bankLineParts.push(`Reg.nr. ${company.bank_reg_number.trim()}`)
      bankLineParts.push(`Kontonr. ${company.bank_account_number.trim()}`)
    }
    if (company.iban?.trim()) bankLineParts.push(`IBAN ${company.iban.trim()}`)
    if (bankLineParts.length > 0) {
      doc.text(bankLineParts.join(' / '), MARGIN, py)
      py += 5
    }

    doc.text(`Fakturanr. ${invNo} bedes angivet ved bankoverførsel`, MARGIN, py)
    py += 6

    doc.setFontSize(8.5)
    doc.setTextColor(80, 80, 90)
    doc.text(lateLines, MARGIN, py)
    py += 4 + lateLines.length * 4

    if (extraLines) {
      py += 2
      doc.text(extraLines, MARGIN, py)
    }
  }

  // ── Centreret footer ────────────────────────────────────────────────────
  doc.setFontSize(8.5)
  doc.setTextColor(70, 70, 80)
  doc.setFont('helvetica', 'bold')
  const nameStr = company.name.trim()
  const restAfterName = footer.line1.slice(nameStr.length)
  const footerCenterX = pageW / 2
  const nameW = doc.getTextWidth(nameStr)
  doc.setFont('helvetica', 'normal')
  const restW = doc.getTextWidth(restAfterName)
  const totalW = nameW + restW
  const startX = footerCenterX - totalW / 2
  doc.setFont('helvetica', 'bold')
  doc.text(nameStr, startX, footerY)
  doc.setFont('helvetica', 'normal')
  doc.text(restAfterName, startX + nameW, footerY)
  if (footer.line2) {
    doc.text(footer.line2, footerCenterX, footerY + footerLineH + 2, { align: 'center' })
  }

  const buf = doc.output('arraybuffer') as ArrayBuffer
  return new Uint8Array(buf)
}
