/**
 * Bilagsnumre: fortløbende nummer pr. virksomhed, tildelt i databasen.
 * Vises nulpolstret (0042), men refereres uden nuller i banken hvor
 * tegnbudgettet er stramt.
 */

const DOCUMENT_NUMBER_WIDTH = 4

/**
 * 42 → «0042». Fælles format for alle fortløbende dokumentnumre — bilag og
 * indtægter har hver sin serie, men vises ens.
 */
export function formatDocumentNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return String(n).padStart(DOCUMENT_NUMBER_WIDTH, '0')
}

/** 42 → «0042». */
export function formatVoucherNumber(n: number | null | undefined): string {
  return formatDocumentNumber(n)
}

/**
 * Tolker en søgetekst som bilagsnummer: «42», «0042» og «bilag 42» → 42.
 * Returnerer null hvis teksten ikke er et nummer.
 */
export function parseVoucherNumberQuery(input: string): number | null {
  const cleaned = input.trim().replace(/^bilag\s*/i, '').replace(/^#/, '').trim()
  if (!/^\d{1,9}$/.test(cleaned)) return null
  const n = parseInt(cleaned, 10)
  return n > 0 ? n : null
}

/**
 * Tekstfeltet til modtageren i danske bankoverførsler er typisk begrænset til
 * 35 tegn — længere tekst bliver afkortet af banken.
 */
export const BANK_REFERENCE_MAX_LENGTH = 35

/**
 * Betalingstekst til en samlet refundering: «Bilag 42,43,51».
 * Er der for mange numre til tegngrænsen, tages så mange med som muligt
 * og resten angives som «+N» (fx «Bilag 42,43,51 +6»).
 */
export function buildRefundReference(
  numbers: ReadonlyArray<number | null | undefined>,
  maxLength = BANK_REFERENCE_MAX_LENGTH,
): string {
  const sorted = Array.from(
    new Set(numbers.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))),
  ).sort((a, b) => a - b)
  if (sorted.length === 0) return ''

  const prefix = 'Bilag '
  const full = `${prefix}${sorted.join(',')}`
  if (full.length <= maxLength) return full

  for (let take = sorted.length - 1; take >= 1; take--) {
    const candidate = `${prefix}${sorted.slice(0, take).join(',')} +${sorted.length - take}`
    if (candidate.length <= maxLength) return candidate
  }
  return `${prefix}${sorted.length} stk.`.slice(0, maxLength)
}
