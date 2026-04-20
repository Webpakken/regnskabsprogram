/**
 * Heuristik til danske kvitteringer (REMA, Netto, osv.) — ikke 100 %, men god MVP.
 */

export type ParsedReceipt = {
  totalKr: number | null
  expenseDate: string | null
  /** ISO yyyy-mm-dd */
  expenseDateIso: string | null
  lineItems: string[]
  merchantGuess: string | null
  rawSnippet: string
}

function parseDanishNumber(s: string): number | null {
  const t = s.replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : null
}

/** Datoer: 19.04.24 12:37 eller 19-04-2024 */
function extractDate(text: string): { display: string; iso: string } | null {
  const re =
    /\b(\d{1,2})[\.\-/](\d{1,2})[\.\-/](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/
  const m = text.match(re)
  if (!m) return null
  let d = parseInt(m[1], 10)
  let mo = parseInt(m[2], 10)
  let y = parseInt(m[3], 10)
  if (y < 100) y += 2000
  if (d > 31 || mo > 12) return null
  const iso = `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  return { display: m[0].trim(), iso }
}

/** Total: AT BETALE, TOTAL, TIL BETALING, SUM */
function extractTotal(lines: string[]): number | null {
  const joined = lines.join('\n').toUpperCase()
  const patterns = [
    /AT\s+BETALE[:\s]+([\d\s.,]+)/i,
    /TIL\s+BETALING[:\s]+([\d\s.,]+)/i,
    /TOTAL[:\s]+([\d\s.,]+)/i,
    /SUM[:\s]+([\d\s.,]+)/i,
    /BETALT[:\s]+([\d\s.,]+)/i,
    /DKK\s*([\d\s.,]+)\s*$/im,
  ]
  for (const p of patterns) {
    const m = joined.match(p)
    if (m?.[1]) {
      const n = parseDanishNumber(m[1])
      if (n !== null && n > 0 && n < 1_000_000) return n
    }
  }
  /* Sidste linje med "xxx,xx" som ligner beløb */
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 8); i--) {
    const line = lines[i]
    const m = line.match(/(\d{1,3}(?:\.\d{3})*,\d{2})\s*$/)
    if (m) {
      const n = parseDanishNumber(m[1])
      if (n !== null && n > 1 && n < 50000) return n
    }
  }
  return null
}

/** Linjer der ligner varelinjer (tekst + beløb til sidst) */
function extractLineItems(lines: string[]): string[] {
  const out: string[] = []
  const lineRe = /^.{2,80}\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s*$/
  for (const line of lines) {
    const t = line.trim()
    if (t.length < 5) continue
    if (/AT BETALE|TOTAL|MOMS|BON:|CVR|TLF|KORT/i.test(t)) continue
    if (lineRe.test(t)) out.push(t)
    if (out.length >= 25) break
  }
  return out.slice(0, 20)
}

function firstLineMerchant(lines: string[]): string | null {
  for (const line of lines.slice(0, 6)) {
    const t = line.trim()
    if (t.length >= 3 && t.length < 60 && !/^\d/.test(t) && !/CVR|TLF|\.dk/i.test(t))
      return t
  }
  return null
}

export function parseDanishReceiptText(ocrText: string): ParsedReceipt {
  const normalized = ocrText.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const dateInfo = extractDate(normalized)
  const totalKr = extractTotal(lines)
  const lineItems = extractLineItems(lines)
  const merchantGuess = firstLineMerchant(lines)

  return {
    totalKr,
    expenseDate: dateInfo?.display ?? null,
    expenseDateIso: dateInfo?.iso ?? null,
    lineItems,
    merchantGuess,
    rawSnippet: normalized.slice(0, 4000),
  }
}

export function formatParsedNotes(p: ParsedReceipt): string {
  const parts: string[] = ['[OCR]']
  if (p.merchantGuess) parts.push(`Butik: ${p.merchantGuess}`)
  if (p.totalKr != null) parts.push(`Total: ${p.totalKr.toFixed(2).replace('.', ',')} kr`)
  if (p.lineItems.length) {
    parts.push('Varer:')
    p.lineItems.forEach((l) => parts.push(`- ${l}`))
  }
  return parts.join('\n')
}
