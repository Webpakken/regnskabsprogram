import { ensurePdfjsWorker, pdfjsLib } from '@/lib/ensurePdfjsWorker'

export type InvoiceExtract = {
  invoiceNumber: string | null
  issueDate: string | null
  dueDate: string | null
  customerName: string | null
  grossCents: number | null
  vatCents: number | null
  netCents: number | null
  rawText: string
  confidence: 'high' | 'medium' | 'low'
}

/** Hent ren tekst fra alle sider i en PDF. */
async function extractPdfText(file: File): Promise<string> {
  await ensurePdfjsWorker()
  const buf = new Uint8Array(await file.arrayBuffer())
  const loadingTask = pdfjsLib.getDocument({ data: buf })
  const doc = await loadingTask.promise
  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const lines: string[] = []
    let currentLine = ''
    let lastY: number | null = null
    for (const item of content.items as Array<{ str: string; transform?: number[] }>) {
      const y = item.transform?.[5] ?? null
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 1.5) {
        if (currentLine.trim()) lines.push(currentLine.trim())
        currentLine = item.str
      } else {
        currentLine += (currentLine && !currentLine.endsWith(' ') ? ' ' : '') + item.str
      }
      lastY = y
    }
    if (currentLine.trim()) lines.push(currentLine.trim())
    pages.push(lines.join('\n'))
  }
  return pages.join('\n')
}

const DATE_PATTERNS: RegExp[] = [
  // 25-04-2026, 25.04.2026, 25/04/2026
  /\b(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})\b/,
  // 2026-04-25
  /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/,
  // 25. apr. 2026, 25 april 2026
  /\b(\d{1,2})\.?\s*(jan|feb|mar|apr|maj|jun|jul|aug|sep|okt|nov|dec)[a-zæøå.]*\s+(\d{4})\b/i,
]

const MONTHS_DA: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, maj: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, dec: 12,
}

function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n)
}

function normalizeDateMatch(match: RegExpMatchArray): string | null {
  const raw = match[0]
  // 2026-04-25 (allerede iso)
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (iso) {
    const [, y, m, d] = iso
    return `${y}-${pad2(Number(m))}-${pad2(Number(d))}`
  }
  // 25-04-2026 / 25.04.2026 / 25/04/2026
  const dmy = raw.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/)
  if (dmy) {
    const [, d, m, y] = dmy
    return `${y}-${pad2(Number(m))}-${pad2(Number(d))}`
  }
  // 25. apr. 2026
  const danish = raw.match(/^(\d{1,2})\.?\s*([a-zæøå]+)[a-zæøå.]*\s+(\d{4})$/i)
  if (danish) {
    const [, d, mname, y] = danish
    const monthKey = mname.slice(0, 3).toLowerCase()
    const m = MONTHS_DA[monthKey]
    if (m) return `${y}-${pad2(m)}-${pad2(Number(d))}`
  }
  return null
}

function findDate(text: string, ...labels: string[]): string | null {
  // Søg efter dato i nærheden af et label (fx "Fakturadato"). Falder tilbage til
  // første dato i dokumentet hvis intet label-match findes.
  for (const label of labels) {
    const labelRe = new RegExp(label + '[^\\n]{0,40}', 'i')
    const labelMatch = text.match(labelRe)
    if (labelMatch) {
      for (const re of DATE_PATTERNS) {
        const m = labelMatch[0].match(re)
        if (m) {
          const iso = normalizeDateMatch(m)
          if (iso) return iso
        }
      }
    }
  }
  for (const re of DATE_PATTERNS) {
    const m = text.match(re)
    if (m) {
      const iso = normalizeDateMatch(m)
      if (iso) return iso
    }
  }
  return null
}

function findInvoiceNumber(text: string): string | null {
  // Mest typiske danske faktura-tekster
  const labels = [
    /faktura\s*(?:nr\.?|nummer|#)\s*[:.]?\s*([A-Z0-9-]{1,30})/i,
    /fakturanummer\s*[:.]?\s*([A-Z0-9-]{1,30})/i,
    /faktura[\s.]+(\d{1,10})\b/i,
    /invoice\s*(?:no\.?|number|#)\s*[:.]?\s*([A-Z0-9-]{1,30})/i,
  ]
  for (const re of labels) {
    const m = text.match(re)
    if (m && m[1]) return m[1].trim()
  }
  return null
}

function parseDanishAmount(raw: string): number | null {
  // "1.234,56" → 1234.56 ; "1234,56" → 1234.56 ; "1234.56" → 1234.56
  const cleaned = raw.replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.')
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

function findAmountNear(text: string, ...labels: string[]): number | null {
  for (const label of labels) {
    const re = new RegExp(label + '[^\\n]{0,80}', 'i')
    const block = text.match(re)
    if (!block) continue
    // Find sidste tal i blokken — mest pålideligt for "Total: ... DKK 1.234,56"
    const numbers = block[0].match(/-?\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|-?\d+[.,]\d{2}/g)
    if (numbers && numbers.length > 0) {
      const cents = parseDanishAmount(numbers[numbers.length - 1])
      if (cents !== null) return cents
    }
  }
  return null
}

function findCustomerName(text: string): string | null {
  // Heuristik: kunde-blokken kommer typisk efter "Faktura til", "Kunde", "Bill to".
  // Hvis ikke fundet, brug første ikke-tomme linje efter de første 3 (springer logo/header over).
  const labels = [
    /(?:faktura\s*til|kunde|customer|bill\s*to)[:\s]*\n([^\n]+)/i,
  ]
  for (const re of labels) {
    const m = text.match(re)
    if (m && m[1]) {
      const name = m[1].trim()
      if (name.length >= 2 && name.length <= 80) return name
    }
  }
  return null
}

export async function extractInvoiceFromPdf(file: File): Promise<InvoiceExtract> {
  const text = await extractPdfText(file)
  const invoiceNumber = findInvoiceNumber(text)
  const issueDate = findDate(text, 'fakturadato', 'faktura\\s*dato', 'invoice\\s*date', 'dato')
  const dueDate = findDate(text, 'forfald', 'forfaldsdato', 'betalingsfrist', 'due\\s*date')
  const grossCents = findAmountNear(text, 'i\\s*alt', 'total', 'beløb\\s*i\\s*alt', 'amount\\s*due', 'samlet')
  const vatCents = findAmountNear(text, 'moms', 'vat\\b')
  const netCents =
    grossCents !== null && vatCents !== null
      ? Math.max(0, grossCents - vatCents)
      : findAmountNear(text, 'subtotal', 'før\\s*moms', 'eks\\.?\\s*moms')
  const customerName = findCustomerName(text)

  // Konfidens: 'high' hvis nummer + dato + brutto er fundet; 'medium' hvis kun 2 ud af 3; 'low' ellers.
  const found = [invoiceNumber, issueDate, grossCents].filter((v) => v !== null && v !== '').length
  const confidence: InvoiceExtract['confidence'] = found === 3 ? 'high' : found === 2 ? 'medium' : 'low'

  return {
    invoiceNumber,
    issueDate,
    dueDate,
    customerName,
    grossCents,
    vatCents,
    netCents,
    rawText: text,
    confidence,
  }
}
