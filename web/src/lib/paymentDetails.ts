/**
 * Betalingsoplysninger udlæst af et bilag — FIK/GIK-indbetalingskort,
 * kontonummer eller IBAN — så brugeren kan kopiere dem over i netbanken.
 *
 * AI-pathen (`voucher-extract`) fylder felterne direkte. Tesseract-fallbacken
 * bruger `parsePaymentDetailsFromText` herunder, som leder efter de samme
 * mønstre i rå OCR-tekst.
 */
import type { VoucherPaymentMethod } from '@/types/database'

export type VoucherPaymentInfo = {
  paymentMethod: VoucherPaymentMethod | null
  /** Hele FIK-linjen uden mellemrum, fx "+71<0000000000123456+12345678<". */
  fikLine: string | null
  /** Kortart: 01, 04, 15, 71, 73 eller 75. */
  fikCardType: string | null
  /** Kreditornummer, 8 cifre. */
  fikCreditorNo: string | null
  /** Betalingsid, op til 16 cifre (15 + kontrolciffer). Tomt på kortart 01. */
  fikPaymentId: string | null
  bankRegNo: string | null
  bankAccountNo: string | null
  iban: string | null
  paymentReference: string | null
  /** Forfaldsdato, ISO yyyy-mm-dd. Ikke det samme som bilagsdatoen. */
  dueDate: string | null
}

export const EMPTY_PAYMENT_INFO: VoucherPaymentInfo = {
  paymentMethod: null,
  fikLine: null,
  fikCardType: null,
  fikCreditorNo: null,
  fikPaymentId: null,
  bankRegNo: null,
  bankAccountNo: null,
  iban: null,
  paymentReference: null,
  dueDate: null,
}

export function hasPaymentInfo(p: VoucherPaymentInfo): boolean {
  return Boolean(p.fikLine || (p.bankRegNo && p.bankAccountNo) || p.iban)
}

/** Delene af en FIK-linje, i den rækkefølge de tastes i netbanken. */
export type FikLineParts = {
  /** Normaliseret linje, fx "+71<0000000000123456+12345678<". */
  line: string
  cardType: string
  /** Null på kortart 01, som ikke har et betalingsid. */
  paymentId: string | null
  creditorNo: string
}

const FIK_LINE_STRICT_RE = /^\+(\d{2})<(\d{0,16})\+(\d{8})</

/**
 * Tolker en FIK-linje skrevet eller indsat i hånden. Mellemrum ignoreres, og
 * '(' og 'C' accepteres for '<', fordi brugere ofte kopierer fra en OCR-tekst
 * hvor tegnet er læst forkert. Returnerer null hvis linjen ikke er gyldig —
 * en halv linje er værre end ingen, fordi den ser rigtig ud i netbanken.
 */
export function parseFikLine(input: string): FikLineParts | null {
  const compact = input.replace(/\s+/g, '').replace(/[(C]/gi, '<')
  const m = FIK_LINE_STRICT_RE.exec(compact)
  if (!m || !FIK_CARD_TYPES.has(m[1])) return null
  return {
    line: `+${m[1]}<${m[2]}+${m[3]}<`,
    cardType: m[1],
    paymentId: m[2] || null,
    creditorNo: m[3],
  }
}

/**
 * Betalingsmetoden skal altid afspejle de felter der faktisk er udfyldt —
 * ellers kan en manuel rettelse efterlade fx `payment_method: 'fik'` på et
 * bilag hvor FIK-linjen er slettet.
 */
export function derivePaymentMethod(p: VoucherPaymentInfo): VoucherPaymentMethod | null {
  if (p.fikLine) return 'fik'
  if (p.bankRegNo && p.bankAccountNo) return 'bank_transfer'
  if (p.iban) return 'iban'
  if (p.paymentMethod === 'mobilepay') return 'mobilepay'
  return null
}

export const FIK_CARD_TYPES = new Set(['01', '04', '15', '71', '73', '75'])

/**
 * Betalingsid fylder op til 16 cifre: 15 cifres identifikation plus et
 * mod10-kontrolciffer. Feltet er tomt på kortart 01.
 */
export const FIK_PAYMENT_ID_MAX_LENGTH = 16
export const FIK_CREDITOR_NO_LENGTH = 8

/**
 * FIK-linjen kan i OCR-tekst indeholde mellemrum som padding, og '<' bliver
 * ofte læst som '(' eller 'C'. Vi accepterer de varianter og normaliserer.
 */
const FIK_LINE_RE = /\+\s*(\d{2})\s*[<(C]([\d\s]{0,20})\+([\d\s]{8,12})[<(C>]/i

/** "Reg.nr. 1234 Konto 5678901234", "Reg 1234 - 5678901234", "1234 5678901234". */
const BANK_RE =
  /(?:reg\.?\s*(?:nr\.?)?\s*:?\s*)(\d{4})\s*(?:[-–/]|\s|konto(?:nr\.?)?\s*:?\s*)+(\d{6,10})\b/i

const IBAN_RE = /\bDK\s*(\d{2}(?:\s*\d){14})\b/i

/**
 * "Ved betaling oplys fakturanr. 10432" / "Betalingsreference: 10432".
 *
 * Efter triggerordet springes op til 40 tegn label over ("fakturanr.", "nr.")
 * før selve værdien. Lookaheaden kræver mindst ét ciffer, så labelordet ikke
 * selv bliver fanget som reference. \b i starten forhindrer match inde i
 * længere ord som "Betalingsoplysninger".
 */
const REFERENCE_RE =
  /\b(?:betalings(?:reference|id)|posteringstekst|reference|oplys(?:\s+venligst)?|faktura(?:nr)?|kundenr|ordrenr)\b[^\n]{0,40}?\b((?=[A-Za-z0-9/-]*\d)[A-Za-z0-9][A-Za-z0-9/-]{2,29})\b/i

/** Modulus 10 med vægte 1-2-1-2 fra højre (Luhn) — FIK-betalingsids kontrolciffer. */
export function fikPaymentIdPassesMod10(digits: string): boolean {
  let sum = 0
  let double = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48
    if (double) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    double = !double
  }
  return sum % 10 === 0
}

/**
 * Heuristisk udtræk af betalingsoplysninger fra rå OCR-tekst.
 *
 * Bruges kun når AI-pathen fejler. Vi er bevidst strenge: et forkert
 * kontonummer er værre end intet, fordi brugeren kopierer det direkte videre
 * uden at kontrollere det.
 */
export function parsePaymentDetailsFromText(text: string): VoucherPaymentInfo {
  const out: VoucherPaymentInfo = { ...EMPTY_PAYMENT_INFO }

  const fik = FIK_LINE_RE.exec(text)
  if (fik) {
    const cardType = fik[1]
    const paymentId = fik[2].replace(/\s/g, '')
    const creditorNo = fik[3].replace(/\s/g, '')
    if (
      FIK_CARD_TYPES.has(cardType) &&
      creditorNo.length === FIK_CREDITOR_NO_LENGTH &&
      paymentId.length <= FIK_PAYMENT_ID_MAX_LENGTH
    ) {
      // Kontrolcifferet skal passe — ellers har OCR sandsynligvis læst forkert,
      // og så er linjen ubrugelig som betalingsgrundlag. Vi kontrollerer kun
      // fuldlange betalingsid (16 cifre), hvor kontrolcifferet sidder; kortere
      // varianter slipper igennem frem for at blive kasseret på en antagelse.
      if (
        paymentId.length !== FIK_PAYMENT_ID_MAX_LENGTH ||
        fikPaymentIdPassesMod10(paymentId)
      ) {
        out.fikLine = `+${cardType}<${paymentId}+${creditorNo}<`
        out.fikCardType = cardType
        out.fikPaymentId = paymentId || null
        out.fikCreditorNo = creditorNo
        out.paymentMethod = 'fik'
      }
    }
  }

  const bank = BANK_RE.exec(text)
  if (bank) {
    out.bankRegNo = bank[1]
    out.bankAccountNo = bank[2]
    if (!out.paymentMethod) out.paymentMethod = 'bank_transfer'
  }

  const iban = IBAN_RE.exec(text)
  if (iban) {
    const compact = `DK${iban[1].replace(/\s/g, '')}`
    if (/^DK\d{16}$/.test(compact)) {
      out.iban = compact
      if (!out.paymentMethod) out.paymentMethod = 'iban'
    }
  }

  const ref = REFERENCE_RE.exec(text)
  if (ref) out.paymentReference = ref[1]

  return out
}

/** "1234 5678901234" — reg.nr. og kontonr. som de vises i netbanken. */
export function formatBankAccount(regNo: string | null, accountNo: string | null): string | null {
  if (!regNo || !accountNo) return null
  return `${regNo} ${accountNo}`
}
