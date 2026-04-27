/**
 * Heuristik til danske kvitteringer (REMA, Netto, osv.) — ikke 100 %, men god MVP.
 */

export type ParsedReceipt = {
  totalKr: number | null
  expenseDate: string | null
  /** ISO yyyy-mm-dd */
  expenseDateIso: string | null
  /** 0 eller 25 når teksten tyder på det; null = kend ikke, brug formularens momssats */
  vatRateGuess: number | null
  lineItems: string[]
  merchantGuess: string | null
  rawSnippet: string
}

function parseDanishNumber(s: string): number | null {
  const t = s.replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : null
}

/** Datoer: 19.04.24 12:37, 19-04-2024, eller efter "Fakturadato" */
function extractDate(text: string): { display: string; iso: string } | null {
  const invoiceLabel =
    /(?:Faktura|faktura|Fakturadato|Dato)[:\s]+(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})/i.exec(
      text,
    )
  if (invoiceLabel) {
    const d = parseInt(invoiceLabel[1], 10)
    const mo = parseInt(invoiceLabel[2], 10)
    let y = parseInt(invoiceLabel[3], 10)
    if (y < 100) y += 2000
    if (d <= 31 && mo <= 12) {
      const iso = `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      return { display: invoiceLabel[0].trim(), iso }
    }
  }
  const re = /\b(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/
  const m = text.match(re)
  if (!m) return null
  const d = parseInt(m[1], 10)
  const mo = parseInt(m[2], 10)
  let y = parseInt(m[3], 10)
  if (y < 100) y += 2000
  if (d > 31 || mo > 12) return null
  const iso = `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  return { display: m[0].trim(), iso }
}

/**
 * Slutbeløb til betaling. Vigtigt: "TOTAL" må ikke matche inde i "SUBTOTAL"
 * (regex uden ordgrænse gav 24.400 i stedet for "Total DKK: 25.500").
 * Beløb står ofte på linjen under "Total DKK".
 */
function extractTotal(lines: string[]): number | null {
  for (let i = 0; i < lines.length; i++) {
    if (!/TOTAL\s+DKK/i.test(lines[i])) continue
    let best: number | null = null
    for (let j = i; j <= Math.min(i + 6, lines.length - 1); j++) {
      const amounts = lines[j].matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2})/g)
      for (const m of amounts) {
        const n = parseDanishNumber(m[1])
        if (n !== null && n > 0 && n < 1_000_000_000) {
          if (best === null || n > best) best = n
        }
      }
    }
    if (best !== null) return best
  }

  const joined = lines.join('\n')
  const patterns: RegExp[] = [
    /AT\s+BETALE[:\s]+([\d\s.,]+)/i,
    /TIL\s+BETALING[:\s]+([\d\s.,]+)/i,
    /TOTAL\s+DKK\s*[:\s]*([\d\s.,]+)/i,
    /SLUTBEL[ØO]B[:\s]+([\d\s.,]+)/i,
    /\bTOTAL\s*(?:INKL\.?\s*MOMS|EX\.?\s*MOMS|MOMS)?[:\s]+([\d\s.,]+)/i,
    /\bSUM[:\s]+([\d\s.,]+)/i,
    /BETALT[:\s]+([\d\s.,]+)/i,
    /BEL[ØO]B\s+I\s+ALT[:\s]+([\d\s.,]+)/i,
    /SAMLET\s+(?:PRIS|BEL[ØO]B)[:\s]+([\d\s.,]+)/i,
    /DKK\s*([\d\s.,]+)\s*$/im,
  ]
  for (const p of patterns) {
    const m = joined.match(p)
    if (m?.[1]) {
      const n = parseDanishNumber(m[1])
      if (n !== null && n > 0 && n < 1_000_000_000) return n
    }
  }
  /* Linjer nederst — spring subtotal over */
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 12); i--) {
    const line = lines[i]
    if (/SUBTOTAL|SUB\s*TOTAL|MOMSGRUNDLAG|HERAF\s+MOMS/i.test(line)) continue
    const m = line.match(/(\d{1,3}(?:\.\d{3})*,\d{2})\s*$/)
    if (m) {
      const n = parseDanishNumber(m[1])
      if (n !== null && n > 1 && n < 10_000_000) return n
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

/** Fjern parenteser med branch/butiks-koder ("F24 (8132)" → "F24"), trim støj. */
function cleanMerchantCandidate(raw: string): string | null {
  let t = raw
    .replace(/\s*\(\s*\d{2,6}\s*\)\s*/g, ' ') // (8132), (123)
    .replace(/\s+/g, ' ')
    .trim()
  // Strip ledende/efterstillede ikke-tegn
  t = t.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}.&'-]+$/u, '')
  if (t.length < 2 || t.length > 60) return null
  return t
}

/** Heuristisk afvisning af linjer der IKKE er forretningsnavne. */
function isObviouslyNotMerchant(t: string): boolean {
  if (/^\d/.test(t)) return true
  if (/CVR|TLF|TELEFON|FAX|E-mail|@|\.dk\b|\.com\b|www\./i.test(t)) return true
  if (/\bkvittering\b|\bbon\s*[:#]/i.test(t)) return true
  if (/^[a-zæøå .'-]+\s+\d{1,4}[a-z]?$/i.test(t)) return true // adresse: "Ribevej 9"
  if (/^\d{4}\s+[a-zæøå]/i.test(t)) return true // postnr+by: "6800 Varde"
  if (/^kassenr|kasse\s*\d/i.test(t)) return true
  if (/^(dato|tid|kl\.?\s*\d|reg\s*nr|kontonr)/i.test(t)) return true
  return false
}

/** Score linje som muligt forretningsnavn. Højere = bedre. 0 = afvis. */
function scoreMerchant(t: string): number {
  if (isObviouslyNotMerchant(t)) return 0
  const letters = t.replace(/[^a-zæøåA-ZÆØÅ]/g, '')
  if (letters.length === 0) return 0

  const tokens = t.split(/\s+/)
  const maxTokenLen = Math.max(...tokens.map((tok) => tok.length))
  const isBrandCode =
    tokens.length === 1 && /^[A-ZÆØÅ][A-ZÆØÅ0-9-]{1,5}$/.test(t)

  // OCR-garbage: korte tokens uden noget ordlignende ("TEE TE SNS", "JX QQ ZZ").
  // Brand-koder som "F24" undtages.
  if (maxTokenLen < 4 && !isBrandCode) return 0

  // Mange korte tokens uden vokaler er typisk OCR-støj.
  const noisyTokens = tokens.filter(
    (tok) => tok.length <= 3 && !/[aeiouæøåAEIOUÆØÅ]/.test(tok),
  ).length
  if (noisyTokens >= 2) return 0

  let score = letters.length + tokens.length * 2
  // Bonus for ord-lignende tokens (≥4 tegn med vokal — "Netto", "Føtex", "Shell")
  if (tokens.some((tok) => tok.length >= 4 && /[aeiouæøåAEIOUÆØÅ]/.test(tok))) {
    score += 20
  }
  // Bonus for korte brand-koder med blandet bogstav+tal ("F24", "7-Eleven")
  if (isBrandCode) {
    score += 12
  }
  return score
}

/**
 * Forsøg at finde forretningsnavnet — flere strategier i prioritetsrækkefølge:
 *  1. Eksplicitte mønstre ("Velkommen til X", "Tak for besøget hos X", "Faktura fra X")
 *  2. Linjer over CVR/TLF-blokken, scoret efter "navn-likeness"
 *  3. Fallback: bedst-scorede linje i top-8
 */
function extractMerchant(lines: string[], normalized: string): string | null {
  // 1) Eksplicitte signaler
  const welcome =
    normalized.match(
      /(?:Velkommen\s+(?:til|hos)|Tak\s+for\s+bes[øo]get\s+(?:hos|i)|Faktura\s+fra)\s+([A-ZÆØÅa-zæøå0-9 .&'-]{2,40})/i,
    )
  if (welcome) {
    const cleaned = cleanMerchantCandidate(welcome[1])
    if (cleaned && scoreMerchant(cleaned) > 0) return cleaned
  }

  // 2) Linjer over CVR/TLF-blokken
  const stopIdx = lines.findIndex((l) =>
    /^\s*(?:CVR|TLF|TELEFON|FAX)\b|^\d{4}\s+[a-zæøå]/i.test(l),
  )
  const headLines = lines.slice(0, stopIdx > 0 ? stopIdx : 8)

  let best: { name: string; score: number } | null = null
  for (const raw of headLines) {
    const cleaned = cleanMerchantCandidate(raw)
    if (!cleaned) continue
    const s = scoreMerchant(cleaned)
    if (s <= 0) continue
    if (!best || s > best.score) best = { name: cleaned, score: s }
  }
  if (best) return best.name

  // 3) Fallback: udvid til top-8 hvis intet ramte ovenfor
  for (const raw of lines.slice(0, 8)) {
    const cleaned = cleanMerchantCandidate(raw)
    if (!cleaned) continue
    if (scoreMerchant(cleaned) > 0) return cleaned
  }
  return null
}

/**
 * Gæt momssats fra bilag (0 % vs 25 %). Ved blandede fakturaer (fx margin + moms) → null.
 */
function extractVatRate(text: string): number | null {
  const t = text.replace(/\r\n/g, '\n')

  const hasZeroMomsLine =
    /0\s*,\s*00\s*%\s*moms/i.test(t) || /\b0\s*%\s*moms\b/i.test(t)
  const has25MomsLine =
    /25\s*,\s*00\s*%\s*moms/i.test(t) || /\b25\s*%\s*moms\b/i.test(t)

  if (
    /momspligtigt\s+bel[øo]b\s*:\s*0\s*[,.]\s*00/i.test(t) ||
    /momspligtigt\s+beløb\s*:\s*0\s*[,.]\s*00/i.test(t)
  ) {
    return 0
  }

  if (hasZeroMomsLine && !has25MomsLine) return 0
  if (has25MomsLine && !hasZeroMomsLine) return 25
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
  const merchantGuess = extractMerchant(lines, normalized)
  const vatRateGuess = extractVatRate(normalized)

  return {
    totalKr,
    expenseDate: dateInfo?.display ?? null,
    expenseDateIso: dateInfo?.iso ?? null,
    vatRateGuess,
    lineItems,
    merchantGuess,
    rawSnippet: normalized.slice(0, 4000),
  }
}

export function formatParsedNotes(p: ParsedReceipt): string {
  const parts: string[] = ['[OCR]']
  if (p.merchantGuess) parts.push(`Butik: ${p.merchantGuess}`)
  if (p.vatRateGuess !== null) {
    parts.push(`Momssats (gættet): ${p.vatRateGuess} %`)
  }
  if (p.totalKr != null) parts.push(`Total: ${p.totalKr.toFixed(2).replace('.', ',')} kr`)
  if (p.lineItems.length) {
    parts.push('Varer:')
    p.lineItems.forEach((l) => parts.push(`- ${l}`))
  }
  return parts.join('\n')
}
