import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatDateLongNoTime } from '@/lib/format'
import type { Database } from '@/types/database'

type Invoice = Database['public']['Tables']['invoices']['Row']
type LineRow = Database['public']['Tables']['invoice_line_items']['Row']
type CompanyRow = Database['public']['Tables']['companies']['Row']

const MARGIN = 18
const LOGO_MAX_W_MM = 60
const LOGO_MAX_H_MM = 22

/** Standardtekst som på almindelige danske fakturaer (kan uddybes via bundtekst i indstillinger). */
const DEFAULT_LATE_PAYMENT_TEXT =
  'Ved betaling efter forfald tilskrives der renter på 0,0 % pr. påbegyndt måned, samt et gebyr på 100,00 DKK.'

function money(cents: number) {
  // Webpakken-stil: ren tal med tusind-separator, uden valutasymbol; valuta vises kun
  // i "Total DKK"-rækken som suffix på label'et.
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
    const formatted =
      r % 1 === 0
        ? `${Math.round(r)},00`
        : new Intl.NumberFormat('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(r)
    return `Moms (${formatted}%)`
  }
  return 'Moms'
}

function companyFooterLines(company: CompanyRow): { line1: string; line2: string } {
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
 * Faktura-PDF — Webpakken-inspireret stil:
 * • Logo top-højre, kunde top-venstre
 * • Dato + fakturanr. som rækkens før titlen
 * • Stor "Faktura"-overskrift (eller "Krediterring af faktura X" for kreditnota)
 * • Ren linje-tabel uden mørk header — kun tynde streger
 * • Totaler højre-justeret
 * • Bank-betalingsblok kun for fakturaer (ikke kreditnotaer)
 * • Centreret to-linje footer i bunden af siden med virksomhed + kontakt
 */
export type InvoicePdfOptions = {
  /** Standard: «Faktura»; kreditnota: «Kreditnota». */
  heading?: string
  /** Vises som overskrift når sat (fx «Krediterring af faktura 1033»). */
  creditReferenceLine?: string | null
}

export function generateInvoicePdfBlob(
  company: CompanyRow,
  invoice: Invoice,
  lines: LineRow[],
  logoDataUrl?: string | null,
  pdfOptions?: InvoicePdfOptions,
): Blob {
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

  // ── Top-højre: logo + sælger-blok (firmanavn, email, telefon) ──────────
  let sy = topY
  if (logoDataUrl) {
    try {
      const fmt = guessImageFormat(logoDataUrl)
      const { w, h } = logoDimensionsMm(doc, logoDataUrl)
      const lx = rightX - w
      doc.addImage(logoDataUrl, fmt, lx, topY, w, h)
      sy = topY + h + 3
    } catch {
      /* ignore */
    }
  }
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(20, 20, 30)
  doc.text(company.name.trim(), rightX, sy, { align: 'right' })
  sy += 4.6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(70, 70, 80)
  if (company.invoice_email?.trim()) {
    doc.text(company.invoice_email.trim(), rightX, sy, { align: 'right' })
    sy += 4.2
  }
  if (company.invoice_phone?.trim()) {
    doc.text(`Tlf. ${company.invoice_phone.trim()}`, rightX, sy, { align: 'right' })
    sy += 4.2
  }

  // ── Dato + fakturanr-række (over titlen) ────────────────────────────────
  let y = Math.max(customerBottomY, sy) + 14
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(70, 70, 80)
  doc.text('Dato: ', MARGIN, y)
  const dateLabelW = doc.getTextWidth('Dato: ')
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(20, 20, 30)
  doc.text(formatDateLongNoTime(invoice.issue_date), MARGIN + dateLabelW, y)

  const invNo = String(invoice.invoice_number ?? '—')
  const numberLabel = isCreditNote ? 'Kreditnotanr. ' : 'Fakturanr. '
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(70, 70, 80)
  const numberLabelW = doc.getTextWidth(numberLabel)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(20, 20, 30)
  const numberValueW = doc.getTextWidth(invNo)
  // Skriv label + nummer højre-justeret
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(70, 70, 80)
  doc.text(numberLabel, rightX - numberValueW - numberLabelW, y)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(20, 20, 30)
  doc.text(invNo, rightX, y, { align: 'right' })

  y += 6

  // ── Notes (fx "Del 1 af 2 gennemført") — kun for fakturaer ─────────────
  if (!isCreditNote && invoice.notes?.trim()) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(70, 70, 80)
    const split = doc.splitTextToSize(invoice.notes.trim(), contentW)
    doc.text(split, MARGIN, y)
    y += 4.5 + (split.length - 1) * 4.5
  }

  // ── Stor titel ──────────────────────────────────────────────────────────
  // Skub titel + tabel ned mod midten af siden så produktlinjerne ligger
  // visuelt centreret. pageH * 0.38 ≈ 113mm på A4 → titel midt-øverst.
  y = Math.max(y + 8, pageH * 0.38)
  const heading = isCreditNote
    ? (pdfOptions?.creditReferenceLine?.trim() ?? 'Kreditnota')
    : (pdfOptions?.heading?.trim() || 'Faktura')
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(20, 20, 30)
  doc.text(heading, MARGIN, y)
  y += 8

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
    head: [['Beskrivelse', 'Antal', 'Enhed', 'Enhedspris', 'Pris']],
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

  // ── Betalings-blok (kun for fakturaer, ikke kreditnotaer) ───────────────
  if (!isCreditNote) {
    const netDays = netCalendarDays(invoice.issue_date, invoice.due_date)
    const lateLines = doc.splitTextToSize(DEFAULT_LATE_PAYMENT_TEXT, contentW)
    const extraLines = company.invoice_footer_note?.trim()
      ? doc.splitTextToSize(company.invoice_footer_note.trim(), contentW)
      : null

    // Beregn hvor højt betalings-blokken er, og forsøg at placere den lige
    // over den centrerede footer.
    doc.setFontSize(9.5)
    let bankLines = 0
    if (
      (company.bank_reg_number?.trim() && company.bank_account_number?.trim()) ||
      company.iban?.trim()
    ) {
      bankLines = 1
    }
    const blockH =
      4.5 + // Betalingsbetingelser
      4.5 + // Beløbet indbetales på bankkonto
      bankLines * 4.5 +
      4.5 + // Fakturanr-bedes-angivet
      3 +
      lateLines.length * 4 +
      (extraLines ? 2 + extraLines.length * 4 : 0)

    let py = Math.max(ty, footerY - blockH - 8)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(40, 40, 50)
    // "Betalingsbetingelser: Netto X dage - Forfaldsdato: <dato>"
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
  // Første linje: virksomhedsnavn er fed, resten normal — vi simulerer ved at vise hele
  // linjen som normal, men starte med fed virksomhedsnavn.
  const nameStr = company.name.trim()
  const restAfterName = footer.line1.slice(nameStr.length) // " / Edwin Rahrs Vej 82 / 8220 Brabrand"
  const footerCenterX = pageW / 2
  // Mål for centrering
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

  const raw = doc.output('blob')
  /** Safari m.m. viser ofte hvid side uden eksplicit application/pdf. */
  return raw.type === 'application/pdf' ? raw : new Blob([raw], { type: 'application/pdf' })
}
