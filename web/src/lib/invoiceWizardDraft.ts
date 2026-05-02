import type { Database } from '@/types/database'
import type { DraftLine } from '@/lib/invoiceMath'

export type WizardLine = DraftLine & {
  discount_pct: number
  comment: string
  account: string
}

type InvoiceStatus = Database['public']['Tables']['invoices']['Row']['status']

export type InvoiceWizardTab = 'kunde' | 'produkter' | 'overblik'

export type InvoiceWizardView =
  | { kind: 'wizard' }
  | { kind: 'lineEditor'; index: number }
  | { kind: 'settings' }

export type InvoiceWizardDraftV1 = {
  v: 1
  tab: InvoiceWizardTab
  view: InvoiceWizardView
  customerName: string
  customerEmail: string
  customerCvr: string
  customerPhone: string
  customerAddress: string
  customerZip: string
  customerCity: string
  customerQuery: string
  issueDate: string
  dueDate: string
  title: string
  notes: string
  priceMode: 'excl' | 'incl'
  status: InvoiceStatus
  lines: WizardLine[]
  /** Kreditnota: oprindelig faktura-id (til `credited_invoice_id` ved gem). */
  credit_source_invoice_id?: string | null
  /** Kreditnota: maks. brutto der må krediteres (øre), = oprindelig fakturas brutto. */
  credit_source_max_gross_cents?: number | null
}

const PREFIX = 'bilago:invoice-wizard-draft:'
const LEGACY_PREFIX = 'hisab:invoice-wizard-draft:'

export function invoiceWizardDraftKey(companyId: string) {
  return `${PREFIX}${companyId}`
}

function invoiceWizardDraftLegacyKey(companyId: string) {
  return `${LEGACY_PREFIX}${companyId}`
}

export function clearInvoiceWizardDraft(companyId: string) {
  try {
    sessionStorage.removeItem(invoiceWizardDraftKey(companyId))
    sessionStorage.removeItem(invoiceWizardDraftLegacyKey(companyId))
  } catch {
    /* ignore */
  }
}

function parseTab(x: unknown): InvoiceWizardTab {
  if (x === 'kunde' || x === 'produkter' || x === 'overblik') return x
  return 'kunde'
}

function parseView(x: unknown, lineCount: number): InvoiceWizardView {
  if (!x || typeof x !== 'object') return { kind: 'wizard' }
  const o = x as { kind?: string; index?: number }
  if (o.kind === 'wizard') return { kind: 'wizard' }
  if (o.kind === 'settings') return { kind: 'settings' }
  if (lineCount === 0 && o.kind === 'lineEditor') {
    return { kind: 'wizard' }
  }
  if (o.kind === 'lineEditor' && typeof o.index === 'number' && Number.isFinite(o.index)) {
    const max = Math.max(0, lineCount - 1)
    return { kind: 'lineEditor', index: Math.min(Math.max(0, Math.floor(o.index)), max) }
  }
  return { kind: 'wizard' }
}

function parseLine(item: unknown): WizardLine | null {
  if (!item || typeof item !== 'object') return null
  const o = item as Record<string, unknown>
  const description = typeof o.description === 'string' ? o.description : ''
  const quantity =
    typeof o.quantity === 'number' && Number.isFinite(o.quantity) && o.quantity > 0
      ? o.quantity
      : 1
  const unit_price_cents =
    typeof o.unit_price_cents === 'number' && Number.isFinite(o.unit_price_cents)
      ? Math.round(o.unit_price_cents)
      : 0
  const vat_rate =
    typeof o.vat_rate === 'number' && Number.isFinite(o.vat_rate) ? o.vat_rate : 25
  const discount_pct =
    typeof o.discount_pct === 'number' && Number.isFinite(o.discount_pct)
      ? Math.max(0, o.discount_pct)
      : 0
  const comment = typeof o.comment === 'string' ? o.comment : ''
  const account =
    typeof o.account === 'string' && o.account.trim() !== ''
      ? o.account
      : '1000 - Salg af varer/ydelser m/moms'
  return {
    description,
    quantity,
    unit_price_cents,
    vat_rate,
    discount_pct,
    comment,
    account,
  }
}

function parseLines(raw: unknown): WizardLine[] {
  if (!Array.isArray(raw)) return []
  const out: WizardLine[] = []
  for (const item of raw) {
    const row = parseLine(item)
    if (row) out.push(row)
  }
  return out
}

function parseStatus(x: unknown): InvoiceStatus {
  const allowed = new Set(['draft', 'sent', 'paid', 'cancelled'] as const)
  if (typeof x === 'string' && allowed.has(x as InvoiceStatus)) return x as InvoiceStatus
  return 'draft'
}

/** Læser og validerer kladde fra sessionStorage; returnerer null hvis intet/brudt. */
export function readInvoiceWizardDraft(
  companyId: string,
): InvoiceWizardDraftV1 | null {
  try {
    let raw = sessionStorage.getItem(invoiceWizardDraftKey(companyId))
    if (!raw) raw = sessionStorage.getItem(invoiceWizardDraftLegacyKey(companyId))
    if (!raw) return null
    const data = JSON.parse(raw) as Partial<InvoiceWizardDraftV1>
    if (data.v !== 1) return null
    const lines = parseLines(data.lines)
    const view = parseView(data.view, lines.length)
    const title = typeof data.title === 'string' ? data.title : 'Faktura'
    let tab = parseTab(data.tab)
    if (title === 'Kreditnota' && tab === 'kunde') {
      tab = 'produkter'
    }
    const creditId =
      typeof data.credit_source_invoice_id === 'string'
        ? data.credit_source_invoice_id
        : data.credit_source_invoice_id === null
          ? null
          : undefined
    const creditMax =
      typeof data.credit_source_max_gross_cents === 'number' &&
      Number.isFinite(data.credit_source_max_gross_cents)
        ? data.credit_source_max_gross_cents
        : data.credit_source_max_gross_cents === null
          ? null
          : undefined

    const parsed: InvoiceWizardDraftV1 = {
      v: 1,
      tab,
      view,
      customerName: typeof data.customerName === 'string' ? data.customerName : '',
      customerEmail: typeof data.customerEmail === 'string' ? data.customerEmail : '',
      customerCvr: typeof data.customerCvr === 'string' ? data.customerCvr : '',
      customerPhone: typeof data.customerPhone === 'string' ? data.customerPhone : '',
      customerAddress: typeof data.customerAddress === 'string' ? data.customerAddress : '',
      customerZip: typeof data.customerZip === 'string' ? data.customerZip : '',
      customerCity: typeof data.customerCity === 'string' ? data.customerCity : '',
      customerQuery: typeof data.customerQuery === 'string' ? data.customerQuery : '',
      issueDate: typeof data.issueDate === 'string' ? data.issueDate : '',
      dueDate: typeof data.dueDate === 'string' ? data.dueDate : '',
      title,
      notes: typeof data.notes === 'string' ? data.notes : '',
      priceMode: data.priceMode === 'incl' ? 'incl' : 'excl',
      status: parseStatus(data.status),
      lines,
      ...(creditId !== undefined ? { credit_source_invoice_id: creditId } : {}),
      ...(creditMax !== undefined ? { credit_source_max_gross_cents: creditMax } : {}),
    }
    try {
      sessionStorage.setItem(
        invoiceWizardDraftKey(companyId),
        JSON.stringify(parsed),
      )
      sessionStorage.removeItem(invoiceWizardDraftLegacyKey(companyId))
    } catch {
      /* ignore */
    }
    return parsed
  } catch {
    return null
  }
}

export function writeInvoiceWizardDraft(
  companyId: string,
  draft: Omit<InvoiceWizardDraftV1, 'v'> & { v?: 1 },
) {
  try {
    const payload: InvoiceWizardDraftV1 = {
      v: 1,
      ...draft,
    }
    sessionStorage.setItem(
      invoiceWizardDraftKey(companyId),
      JSON.stringify(payload),
    )
  } catch {
    /* quota el.l. */
  }
}
