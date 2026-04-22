import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { Link, useMatch, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useApp } from '@/context/AppProvider'
import { logActivity } from '@/lib/activity'
import { functionsHttpErrorMessage } from '@/lib/edge'
import { sendInvoiceToCustomerEmail } from '@/lib/invoiceCustomerEmail'
import { formatDkk } from '@/lib/format'
import {
  clearInvoiceWizardDraft,
  readInvoiceWizardDraft,
  writeInvoiceWizardDraft,
  type InvoiceWizardTab,
  type InvoiceWizardView,
  type WizardLine,
} from '@/lib/invoiceWizardDraft'
import { lineAmounts, totalsFromLines, type DraftLine } from '@/lib/invoiceMath'
import { searchCvrFromApicvr, type CvrCompany } from '@/lib/cvrSearchClient'
import type { Database } from '@/types/database'

type Invoice = Database['public']['Tables']['invoices']['Row']
type LineRow = Database['public']['Tables']['invoice_line_items']['Row']

const DEFAULT_ACCOUNT = '1000 - Salg af varer/ydelser m/moms'

/** Indhold + handlingsknapper i samme rude; scroller samlet ved lange lister. */
const invoiceWizardBodyClass =
  'max-h-[min(82dvh,calc(100dvh-9rem))] overflow-y-auto bg-slate-50 px-5 py-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]'

const emptyLine = (): WizardLine => ({
  description: '',
  quantity: 1,
  unit_price_cents: 0,
  vat_rate: 25,
  discount_pct: 0,
  comment: '',
  account: DEFAULT_ACCOUNT,
})

/** Accentfarver: indigo til almindelig faktura, rosenrød til kreditnota-flow. */
type WizardAccent = {
  link: string
  tabActive: string
  tabUnderline: string
  sendBtnClass: string
  primaryBtnClasses: string
  inputFocusRing: string
  inputFocusBorder: string
  cvrCardRing: string
  cvrCardRingHover: string
  recentCardHoverRing: string
  productRowHoverRing: string
  priceModeActive: string
  checkIcon: string
}

function wizardAccent(isCreditNota: boolean): WizardAccent {
  if (isCreditNota) {
    return {
      link: 'text-rose-700',
      tabActive: 'font-semibold text-rose-700',
      tabUnderline: 'bg-rose-600',
      sendBtnClass:
        'rounded-full bg-rose-600 py-3.5 text-[15px] font-semibold text-white hover:bg-rose-700 disabled:opacity-60',
      primaryBtnClasses:
        'w-full rounded-full bg-rose-600 py-3.5 text-[15px] font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50 ',
      inputFocusRing: 'focus:ring-rose-500',
      inputFocusBorder: 'focus:border-rose-500',
      cvrCardRing: 'ring-rose-200',
      cvrCardRingHover: 'hover:ring-rose-400',
      recentCardHoverRing: 'hover:ring-rose-300',
      productRowHoverRing: 'hover:ring-rose-300',
      priceModeActive: 'text-rose-700',
      checkIcon: 'text-rose-600',
    }
  }
  return {
    link: 'text-indigo-600',
    tabActive: 'font-semibold text-indigo-600',
    tabUnderline: 'bg-indigo-600',
    sendBtnClass:
      'rounded-full bg-indigo-600 py-3.5 text-[15px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-60',
    primaryBtnClasses:
      'w-full rounded-full bg-indigo-600 py-3.5 text-[15px] font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50 ',
    inputFocusRing: 'focus:ring-indigo-500',
    inputFocusBorder: 'focus:border-indigo-500',
    cvrCardRing: 'ring-indigo-200',
    cvrCardRingHover: 'hover:ring-indigo-400',
    recentCardHoverRing: 'hover:ring-indigo-300',
    productRowHoverRing: 'hover:ring-indigo-300',
    priceModeActive: 'text-indigo-600',
    checkIcon: 'text-indigo-600',
  }
}

type Tab = InvoiceWizardTab
type View = InvoiceWizardView

function defaultIssueDateIso() {
  return new Date().toISOString().slice(0, 10)
}

function defaultDueDateIso() {
  const d = new Date()
  d.setDate(d.getDate() + 14)
  return d.toISOString().slice(0, 10)
}

function noticeForCvrInvokeFailure(error: unknown, data: unknown): string {
  const fromBody = data as { error?: string } | null
  if (fromBody?.error && typeof fromBody.error === 'string') {
    return fromBody.error
  }
  if (error instanceof Error) {
    const m = error.message
    const lower = m.toLowerCase()
    /* Supabase: «Failed to send a request to the Edge Function» m.m. — ofte ikke-deployet funktion eller netværk */
    if (
      lower.includes('failed to fetch') ||
      lower.includes('failed to send') ||
      lower.includes('edge function') ||
      lower.includes('functions fetch') ||
      lower.includes('networkerror') ||
      lower.includes('load failed')
    ) {
      return (
        'CVR-søgning kunne ikke starte på serveren (Edge Function). Tjek netværk, og deploy «cvr-search» til dit ' +
        'Supabase-projekt: supabase functions deploy cvr-search — samme projekt som i VITE_SUPABASE_URL.'
      )
    }
    return m
  }
  return 'Kunne ikke søge i CVR.'
}

async function sendInvoiceSentEmailWithOptionalPdf(opts: {
  companyId: string
  invoiceId: string
}) {
  const { data: company, error: ce } = await supabase
    .from('companies')
    .select('*')
    .eq('id', opts.companyId)
    .single()
  if (ce || !company) return
  await sendInvoiceToCustomerEmail({
    company,
    invoiceId: opts.invoiceId,
    kind: 'invoice_sent',
  })
}

function useCvrSearch(query: string, active: boolean) {
  const [results, setResults] = useState<CvrCompany[]>([])
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!active) {
      setResults([])
      setNotice(null)
      return
    }
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setNotice(null)
      return
    }
    let cancelled = false
    const t = setTimeout(async () => {
      setLoading(true)
      setNotice(null)
      const { data, error } = await supabase.functions.invoke('cvr-search', {
        body: { q },
      })
      if (cancelled) return
      if (!error) {
        setLoading(false)
        const payload = data as {
          companies?: CvrCompany[]
          disabled?: boolean
          message?: string
        }
        if (payload.disabled && payload.message) {
          setNotice(payload.message)
          setResults([])
          return
        }
        setResults(payload.companies ?? [])
        return
      }

      let msg: string
      if (error instanceof FunctionsHttpError) {
        try {
          msg = await functionsHttpErrorMessage(error)
          if (!msg.trim()) msg = noticeForCvrInvokeFailure(error, data)
        } catch {
          msg = noticeForCvrInvokeFailure(error, data)
        }
      } else {
        msg = noticeForCvrInvokeFailure(error, data)
      }
      const low = msg.toLowerCase()
      if (
        low.includes('unauthorized') ||
        msg === 'Unauthorized' ||
        msg === 'JWT expired'
      ) {
        setLoading(false)
        setResults([])
        setNotice('Log ind igen for at søge i CVR.')
        return
      }

      try {
        const companies = await searchCvrFromApicvr(q)
        if (cancelled) return
        setResults(companies)
        setNotice(null)
      } catch {
        if (cancelled) return
        setResults([])
        setNotice(msg)
      }
      setLoading(false)
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query, active])

  return { results, loading, notice }
}

function effectiveDraft(line: WizardLine): DraftLine {
  const raw = Math.round(
    line.unit_price_cents * (1 - line.discount_pct / 100),
  )
  const adjusted = line.unit_price_cents < 0 ? raw : Math.max(0, raw)
  return {
    description: line.description,
    quantity: line.quantity,
    unit_price_cents: adjusted,
    vat_rate: line.vat_rate,
  }
}

export function InvoiceWizardPage() {
  const { currentCompany, user } = useApp()
  const navigate = useNavigate()
  const params = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const creditForParam = searchParams.get('creditFor')
  const isNew = useMatch({ path: '/app/invoices/new', end: true }) !== null
  const invoiceId = isNew ? null : (params.id ?? null)
  const creditSourceIdRef = useRef<string | null>(null)
  /** Maks. brutto (øre) på oprindelig faktura — kreditnota må ikke overstige dette beløb. */
  const creditSourceMaxGrossCentsRef = useRef<number | null>(null)
  const creditDataLoadedRef = useRef(false)
  const [isCreditDraft, setIsCreditDraft] = useState(false)

  const [loading, setLoading] = useState(!isNew)
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [tab, setTab] = useState<Tab>('kunde')
  const [view, setView] = useState<View>({ kind: 'wizard' })

  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerQuery, setCustomerQuery] = useState('')

  const [issueDate, setIssueDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  )
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 14)
    return d.toISOString().slice(0, 10)
  })
  const [title, setTitle] = useState('Faktura')
  const [notes, setNotes] = useState('')
  const [priceMode, setPriceMode] = useState<'excl' | 'incl'>('excl')
  const [status, setStatus] = useState<Invoice['status']>('draft')

  const [lines, setLines] = useState<WizardLine[]>([])
  const [recentCustomers, setRecentCustomers] = useState<
    { name: string; email: string | null }[]
  >([])

  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const isCreditNotaFlow = Boolean(creditForParam) || isCreditDraft
  const accent = useMemo(() => wizardAccent(isCreditNotaFlow), [isCreditNotaFlow])

  useLayoutEffect(() => {
    if (isCreditNotaFlow && tab === 'kunde') {
      setTab('produkter')
    }
  }, [isCreditNotaFlow, tab])

  const canPersistInvoiceDraft = useRef(false)
  const skipNextInvoiceDraftPersist = useRef(true)
  const latestInvoiceDraftRef = useRef({
    tab: 'kunde' as Tab,
    view: { kind: 'wizard' } as View,
    customerName: '',
    customerEmail: '',
    customerQuery: '',
    issueDate: defaultIssueDateIso(),
    dueDate: defaultDueDateIso(),
    title: 'Faktura',
    notes: '',
    priceMode: 'excl' as 'excl' | 'incl',
    status: 'draft' as Invoice['status'],
    lines: [] as WizardLine[],
    credit_source_invoice_id: null as string | null,
    credit_source_max_gross_cents: null as number | null,
  })

  useLayoutEffect(() => {
    if (!isNew || !currentCompany?.id) {
      canPersistInvoiceDraft.current = false
      return
    }
    if (creditForParam) {
      canPersistInvoiceDraft.current = true
      skipNextInvoiceDraftPersist.current = true
      setIsCreditDraft(true)
      setTab('produkter')
      setView({ kind: 'wizard' })
      setCustomerName('')
      setCustomerEmail('')
      setCustomerQuery('')
      setIssueDate(defaultIssueDateIso())
      setDueDate(defaultDueDateIso())
      setTitle('Kreditnota')
      setNotes('')
      setPriceMode('excl')
      setStatus('draft')
      setLines([])
      return
    }
    if (creditDataLoadedRef.current) {
      canPersistInvoiceDraft.current = true
      return
    }
    canPersistInvoiceDraft.current = false
    skipNextInvoiceDraftPersist.current = true
    const draft = readInvoiceWizardDraft(currentCompany.id)
    if (draft) {
      setTab(draft.tab)
      setView(draft.view)
      setCustomerName(draft.customerName)
      setCustomerEmail(draft.customerEmail)
      setCustomerQuery(draft.customerQuery)
      setIssueDate(draft.issueDate || defaultIssueDateIso())
      setDueDate(draft.dueDate || defaultDueDateIso())
      setTitle(draft.title)
      setNotes(draft.notes)
      setPriceMode(draft.priceMode)
      setStatus(draft.status)
      setLines(draft.lines.length > 0 ? draft.lines : [])
      if (draft.title === 'Kreditnota') {
        setIsCreditDraft(true)
        if (draft.credit_source_invoice_id) {
          creditSourceIdRef.current = draft.credit_source_invoice_id
        }
        if (typeof draft.credit_source_max_gross_cents === 'number') {
          creditSourceMaxGrossCentsRef.current = draft.credit_source_max_gross_cents
        }
      }
    } else {
      setTab('kunde')
      setView({ kind: 'wizard' })
      setCustomerName('')
      setCustomerEmail('')
      setCustomerQuery('')
      setIssueDate(defaultIssueDateIso())
      setDueDate(defaultDueDateIso())
      setTitle('Faktura')
      setNotes('')
      setPriceMode('excl')
      setStatus('draft')
      setLines([])
    }
    canPersistInvoiceDraft.current = true
  }, [isNew, currentCompany?.id, creditForParam])

  useEffect(() => {
    if (!isNew || !currentCompany?.id || !canPersistInvoiceDraft.current) return
    if (skipNextInvoiceDraftPersist.current) {
      skipNextInvoiceDraftPersist.current = false
      return
    }
    const cid = currentCompany.id
    const t = window.setTimeout(() => {
      writeInvoiceWizardDraft(cid, latestInvoiceDraftRef.current)
    }, 0)
    return () => window.clearTimeout(t)
  }, [
    isNew,
    currentCompany?.id,
    tab,
    view,
    customerName,
    customerEmail,
    customerQuery,
    issueDate,
    dueDate,
    title,
    notes,
    priceMode,
    status,
    lines,
  ])

  useEffect(() => {
    if (!currentCompany) return
    let c = false
    ;(async () => {
      const { data } = await supabase
        .from('invoices')
        .select('customer_name, customer_email')
        .eq('company_id', currentCompany.id)
        .order('created_at', { ascending: false })
        .limit(50)
      if (c || !data) return
      const seen = new Set<string>()
      const uniq: { name: string; email: string | null }[] = []
      for (const row of data) {
        const key = row.customer_name.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        uniq.push({ name: row.customer_name, email: row.customer_email })
        if (uniq.length >= 10) break
      }
      setRecentCustomers(uniq)
    })()
    return () => {
      c = true
    }
  }, [currentCompany])

  useEffect(() => {
    if (!isNew || !currentCompany || !creditForParam) return
    let cancelled = false
    void (async () => {
      const { data: src, error: e1 } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', creditForParam)
        .eq('company_id', currentCompany.id)
        .maybeSingle()
      if (cancelled) return
      if (e1 || !src) {
        setError('Kunne ikke indlæse faktura til kreditering')
        return
      }
      if (src.credited_invoice_id) {
        setError('Denne post er allerede en kreditnota — vælg en almindelig faktura')
        return
      }
      const { data: li } = await supabase
        .from('invoice_line_items')
        .select('*')
        .eq('invoice_id', creditForParam)
        .order('sort_order', { ascending: true })
      if (cancelled) return
      setCustomerName(src.customer_name)
      setCustomerEmail(src.customer_email ?? '')
      setIssueDate(defaultIssueDateIso())
      setNotes(`Krediterer faktura ${src.invoice_number}.`)
      setTitle('Kreditnota')
      setLines(
        (li as LineRow[] | null)?.length
          ? (li as LineRow[]).map((r) => ({
              description: r.description,
              quantity: Number(r.quantity),
              unit_price_cents: -r.unit_price_cents,
              vat_rate: Number(r.vat_rate),
              discount_pct: 0,
              comment: '',
              account: DEFAULT_ACCOUNT,
            }))
          : [emptyLine()],
      )
      creditSourceIdRef.current = creditForParam
      creditSourceMaxGrossCentsRef.current = Math.max(0, Number(src.gross_cents ?? 0))
      creditDataLoadedRef.current = true
      setIsCreditDraft(true)
      setTab('produkter')
      setSearchParams({}, { replace: true })
    })()
    return () => {
      cancelled = true
    }
  }, [isNew, currentCompany, creditForParam, setSearchParams])

  useEffect(() => {
    if (!invoiceId || !currentCompany) {
      setLoading(false)
      return
    }
    setLoading(true)
    let c = false
    ;(async () => {
      const { data: inv, error: e1 } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .eq('company_id', currentCompany.id)
        .single()
      if (e1 || !inv) {
        if (!c) {
          setError('Faktura ikke fundet')
          setLoading(false)
        }
        return
      }
      const { data: li } = await supabase
        .from('invoice_line_items')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('sort_order', { ascending: true })
      if (c) return
      setCustomerName(inv.customer_name)
      setCustomerEmail(inv.customer_email ?? '')
      setIssueDate(inv.issue_date)
      setDueDate(inv.due_date)
      setNotes(inv.notes ?? '')
      setStatus(inv.status)
      setIsCreditDraft(!!inv.credited_invoice_id)
      if (inv.credited_invoice_id) {
        setTitle('Kreditnota')
      }
      setInvoiceNumber(
        typeof inv.invoice_number === 'string'
          ? inv.invoice_number
          : String(inv.invoice_number ?? ''),
      )
      setLines(
        (li as LineRow[] | null)?.length
          ? (li as LineRow[]).map((r) => ({
              description: r.description,
              quantity: Number(r.quantity),
              unit_price_cents: r.unit_price_cents,
              vat_rate: Number(r.vat_rate),
              discount_pct: 0,
              comment: '',
              account: DEFAULT_ACCOUNT,
            }))
          : [],
      )
      setLoading(false)
    })()
    return () => {
      c = true
    }
  }, [invoiceId, currentCompany])

  const totals = useMemo(
    () =>
      totalsFromLines(
        lines.filter((l) => l.description.trim()).map(effectiveDraft),
      ),
    [lines],
  )

  function updateLine(i: number, patch: Partial<WizardLine>) {
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()])
    setView({ kind: 'lineEditor', index: lines.length })
  }

  function addLineFromProduct(p: {
    description: string
    unit_price_cents: number
    vat_rate: number
  }) {
    const newIndex = lines.length
    const unit = isCreditNotaFlow ? -Math.abs(p.unit_price_cents) : p.unit_price_cents
    setLines((prev) => [
      ...prev,
      {
        ...emptyLine(),
        description: p.description,
        unit_price_cents: unit,
        vat_rate: p.vat_rate,
      },
    ])
    setView({ kind: 'lineEditor', index: newIndex })
  }

  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, j) => j !== i))
  }

  async function persist(nextStatus?: Invoice['status']) {
    if (!currentCompany || !user) return
    setSaving(true)
    setError(null)
    const effective = lines.filter((l) => l.description.trim())
    if (effective.length === 0) {
      setError('Tilføj mindst én fakturalinje')
      setSaving(false)
      setTab('produkter')
      return
    }
    if (!isCreditNotaFlow && !customerName.trim()) {
      setError('Vælg en kunde')
      setSaving(false)
      setTab('kunde')
      return
    }
    const drafts = effective.map(effectiveDraft)
    const t = totalsFromLines(drafts)
    const st = nextStatus ?? status

    const creditId = creditSourceIdRef.current
    let creditMax = creditSourceMaxGrossCentsRef.current
    if (creditId && (creditMax == null || creditMax <= 0)) {
      const { data: srcInv, error: srcErr } = await supabase
        .from('invoices')
        .select('gross_cents')
        .eq('id', creditId)
        .eq('company_id', currentCompany.id)
        .maybeSingle()
      if (srcErr || !srcInv) {
        setError('Kunne ikke hente oprindelig faktura til kreditloft.')
        setSaving(false)
        return
      }
      creditMax = Math.max(0, Number(srcInv.gross_cents ?? 0))
      creditSourceMaxGrossCentsRef.current = creditMax
    }
    if (creditId && creditMax != null && creditMax > 0) {
      if (t.gross_cents > 0) {
        setError(
          'Kreditnota må have negativ eller nul total — justér linjerne (negative beløb som ved kredit).',
        )
        setSaving(false)
        setTab('produkter')
        return
      }
      if (Math.abs(t.gross_cents) > creditMax) {
        setError(
          `Samlet kredit (${formatDkk(Math.abs(t.gross_cents))}) må ikke overstige oprindelig faktura (${formatDkk(creditMax)}).`,
        )
        setSaving(false)
        setTab('produkter')
        return
      }
    }

    try {
      if (isNew || !invoiceId) {
        const { data: num, error: nErr } = await supabase.rpc(
          'next_invoice_number',
          { p_company_id: currentCompany.id },
        )
        if (nErr || !num) {
          throw new Error(nErr?.message ?? 'Kunne ikke allokere nummer')
        }
        const { data: inv, error: iErr } = await supabase
          .from('invoices')
          .insert({
            company_id: currentCompany.id,
            invoice_number: num,
            customer_name: customerName,
            customer_email: customerEmail || null,
            issue_date: issueDate,
            due_date: dueDate,
            currency: 'DKK',
            status: st,
            net_cents: t.net_cents,
            vat_cents: t.vat_cents,
            gross_cents: t.gross_cents,
            notes: notes || null,
            sent_at: st === 'sent' ? new Date().toISOString() : null,
            credited_invoice_id: creditSourceIdRef.current,
          })
          .select('id, invoice_number')
          .single()
        if (iErr || !inv) {
          throw new Error(iErr?.message ?? 'Kunne ikke oprette')
        }
        const rows = drafts.map((l, idx) => {
          const a = lineAmounts(l)
          return {
            invoice_id: inv.id,
            description: l.description,
            quantity: l.quantity,
            unit_price_cents: l.unit_price_cents,
            vat_rate: l.vat_rate,
            ...a,
            sort_order: idx,
          }
        })
        const { error: lErr } = await supabase
          .from('invoice_line_items')
          .insert(rows)
        if (lErr) throw new Error(lErr.message)
        await logActivity(
          currentCompany.id,
          'invoice_created',
          `Faktura ${inv.invoice_number} oprettet`,
          { invoice_id: inv.id },
        )
        creditSourceIdRef.current = null
        creditSourceMaxGrossCentsRef.current = null
        creditDataLoadedRef.current = false
        if (st === 'sent') {
          void sendInvoiceSentEmailWithOptionalPdf({
            companyId: currentCompany.id,
            invoiceId: inv.id,
          }).catch(() => {})
        }
        const numStr = String(inv.invoice_number ?? '').trim()
        setInvoiceNumber(numStr)
        setStatus(st)
        setTab('overblik')
        clearInvoiceWizardDraft(currentCompany.id)
        navigate(`/app/invoices/${inv.id}`, { replace: true })
      } else {
        const { error: uErr } = await supabase
          .from('invoices')
          .update({
            customer_name: customerName,
            customer_email: customerEmail || null,
            issue_date: issueDate,
            due_date: dueDate,
            status: st,
            net_cents: t.net_cents,
            vat_cents: t.vat_cents,
            gross_cents: t.gross_cents,
            notes: notes || null,
            sent_at:
              st === 'sent' ? new Date().toISOString() : undefined,
          })
          .eq('id', invoiceId)
          .eq('company_id', currentCompany.id)
        if (uErr) throw new Error(uErr.message)
        await supabase
          .from('invoice_line_items')
          .delete()
          .eq('invoice_id', invoiceId)
        const rows = drafts.map((l, idx) => {
          const a = lineAmounts(l)
          return {
            invoice_id: invoiceId,
            description: l.description,
            quantity: l.quantity,
            unit_price_cents: l.unit_price_cents,
            vat_rate: l.vat_rate,
            ...a,
            sort_order: idx,
          }
        })
        const { error: lErr } = await supabase
          .from('invoice_line_items')
          .insert(rows)
        if (lErr) throw new Error(lErr.message)
        if (nextStatus === 'sent') {
          await logActivity(
            currentCompany.id,
            'invoice_sent',
            `Faktura ${invoiceNumber} sendt`,
            { invoice_id: invoiceId },
          )
          void sendInvoiceSentEmailWithOptionalPdf({
            companyId: currentCompany.id,
            invoiceId,
          }).catch(() => {})
        }
      }
      setStatus(st)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fejl')
    } finally {
      setSaving(false)
    }
  }

  if (isNew && currentCompany) {
    latestInvoiceDraftRef.current = {
      tab,
      view,
      customerName,
      customerEmail,
      customerQuery,
      issueDate,
      dueDate,
      title,
      notes,
      priceMode,
      status,
      lines,
      credit_source_invoice_id: creditSourceIdRef.current,
      credit_source_max_gross_cents: creditSourceMaxGrossCentsRef.current,
    }
  }

  if (!currentCompany) {
    return (
      <p className="text-slate-600">
        Vælg virksomhed i menuen eller gennemfør{' '}
        <Link className="text-indigo-600" to="/onboarding">
          onboarding
        </Link>
        .
      </p>
    )
  }
  if (loading) {
    return (
      <p className="text-slate-500">
        {isCreditNotaFlow ? 'Indlæser kreditnota…' : 'Indlæser faktura…'}
      </p>
    )
  }

  const heading = isNew
    ? isCreditNotaFlow
      ? invoiceNumber
        ? `Opret kreditnota (${invoiceNumber})`
        : 'Opret kreditnota'
      : invoiceNumber
        ? `Opret faktura (${invoiceNumber})`
        : 'Opret faktura'
    : invoiceNumber.trim()
      ? `Faktura ${invoiceNumber}`
      : 'Faktura'

  return (
    <div className="-mx-4 -mt-6 md:mx-auto md:mt-0 md:max-w-xl">
      <div className="overflow-hidden bg-white md:mt-4 md:rounded-3xl md:shadow-xl md:ring-1 md:ring-slate-200">
        {view.kind === 'wizard' && (
          <WizardView
            heading={heading}
            accent={accent}
            creditWizard={isCreditNotaFlow}
            tab={tab}
            setTab={setTab}
            onClose={() => navigate('/app/invoices')}
            onOpenSettings={() => setView({ kind: 'settings' })}
            customerName={customerName}
            setCustomerName={setCustomerName}
            customerEmail={customerEmail}
            setCustomerEmail={setCustomerEmail}
            customerQuery={customerQuery}
            setCustomerQuery={setCustomerQuery}
            recentCustomers={recentCustomers}
            lines={lines}
            onOpenLine={(i) => setView({ kind: 'lineEditor', index: i })}
            onAddLine={addLine}
            onAddLineFromProduct={addLineFromProduct}
            companyId={currentCompany?.id ?? null}
            onRemoveLine={removeLine}
            totals={totals}
            issueDate={issueDate}
            setIssueDate={setIssueDate}
            dueDate={dueDate}
            setDueDate={setDueDate}
            title={title}
            notes={notes}
            saving={saving}
            error={error}
            onSave={() => void persist('draft')}
            onSend={() => void persist('sent')}
            isNew={isNew}
            invoiceStatus={status}
            invoiceNumber={invoiceNumber}
          />
        )}

        {view.kind === 'lineEditor' && lines[view.index] && (
          <LineEditorView
            line={lines[view.index]}
            accent={accent}
            lineSheetTitle={isCreditNotaFlow ? 'Kreditlinje' : 'Fakturalinje'}
            onBack={() => setView({ kind: 'wizard' })}
            onOpenSettings={() => setView({ kind: 'settings' })}
            onChange={(p) => updateLine(view.index, p)}
            onDelete={() => {
              removeLine(view.index)
              setView({ kind: 'wizard' })
            }}
            onSave={() => setView({ kind: 'wizard' })}
            priceMode={priceMode}
            allowNegativePrice={
              isCreditDraft || lines.some((l) => l.unit_price_cents < 0)
            }
          />
        )}

        {view.kind === 'settings' && (
          <SettingsView
            accent={accent}
            onBack={() => setView({ kind: 'wizard' })}
            title={title}
            setTitle={setTitle}
            notes={notes}
            setNotes={setNotes}
            priceMode={priceMode}
            setPriceMode={setPriceMode}
            issueDate={issueDate}
            setIssueDate={setIssueDate}
            dueDate={dueDate}
            setDueDate={setDueDate}
          />
        )}
      </div>
    </div>
  )
}

type WizardViewProps = {
  heading: string
  accent: WizardAccent
  /** Kreditnota: ingen kundetrin — kun Produkter + Overblik. */
  creditWizard: boolean
  tab: Tab
  setTab: (t: Tab) => void
  onClose: () => void
  onOpenSettings: () => void
  customerName: string
  setCustomerName: (v: string) => void
  customerEmail: string
  setCustomerEmail: (v: string) => void
  customerQuery: string
  setCustomerQuery: (v: string) => void
  recentCustomers: { name: string; email: string | null }[]
  lines: WizardLine[]
  onOpenLine: (i: number) => void
  onAddLine: () => void
  onAddLineFromProduct: (p: {
    description: string
    unit_price_cents: number
    vat_rate: number
  }) => void
  companyId: string | null
  onRemoveLine: (i: number) => void
  totals: { net_cents: number; vat_cents: number; gross_cents: number }
  issueDate: string
  setIssueDate: (v: string) => void
  dueDate: string
  setDueDate: (v: string) => void
  title: string
  notes: string
  saving: boolean
  error: string | null
  onSave: () => void
  onSend: () => void
  isNew: boolean
  invoiceStatus: Invoice['status']
  invoiceNumber: string
}

function WizardView(p: WizardViewProps) {
  const { accent, creditWizard } = p
  const tabs = creditWizard ? (['produkter', 'overblik'] as const) : (['kunde', 'produkter', 'overblik'] as const)
  /** Kredit: aldrig vis kundetrin — behandl evt. gammel `kunde`-state som Produkter. */
  const step = creditWizard && p.tab === 'kunde' ? 'produkter' : p.tab
  const filtered = p.customerQuery.trim()
    ? p.recentCustomers.filter((c) =>
        c.name.toLowerCase().includes(p.customerQuery.toLowerCase()),
      )
    : p.recentCustomers

  return (
    <div className="flex flex-col">
      <SheetHeader
        left={
          <button
            type="button"
            onClick={p.onClose}
            className={`text-[15px] font-medium ${accent.link}`}
          >
            Luk
          </button>
        }
        title={p.heading}
      />

      <div
        className={
          'grid shrink-0 border-b border-slate-200 bg-white text-[15px] ' +
          (creditWizard ? 'grid-cols-2' : 'grid-cols-3')
        }
      >
        {tabs.map((t) => {
          const active = step === t
          const label = t === 'kunde' ? 'Kunde' : t === 'produkter' ? 'Produkter' : 'Overblik'
          return (
            <button
              key={t}
              type="button"
              onClick={() => p.setTab(t)}
              className={
                'relative py-3 text-center transition ' +
                (active ? accent.tabActive : 'text-slate-500 hover:text-slate-700')
              }
            >
              {label}
              <span
                className={
                  'absolute inset-x-0 -bottom-px mx-auto h-[3px] rounded-full ' +
                  (active ? accent.tabUnderline : 'bg-transparent')
                }
              />
            </button>
          )
        })}
      </div>

      <div className={invoiceWizardBodyClass}>
        {step === 'kunde' && (
          <CustomerTab
            accent={accent}
            customerName={p.customerName}
            setCustomerName={p.setCustomerName}
            customerEmail={p.customerEmail}
            setCustomerEmail={p.setCustomerEmail}
            query={p.customerQuery}
            setQuery={p.setCustomerQuery}
            recent={filtered}
          />
        )}
        {step === 'produkter' && (
          <ProductsTab
            accent={accent}
            lines={p.lines}
            onOpen={p.onOpenLine}
            onAdd={p.onAddLine}
            onAddFromProduct={p.onAddLineFromProduct}
            companyId={p.companyId}
            onRemove={p.onRemoveLine}
          />
        )}
        {step === 'overblik' && (
          <OverviewTab
            accent={accent}
            customerName={p.customerName}
            customerEmail={p.customerEmail}
            issueDate={p.issueDate}
            setIssueDate={p.setIssueDate}
            dueDate={p.dueDate}
            setDueDate={p.setDueDate}
            title={p.title}
            notes={p.notes}
            lines={p.lines}
            totals={p.totals}
            onOpenSettings={p.onOpenSettings}
            invoiceNumber={p.invoiceNumber}
            showInvoiceNumber={!p.isNew}
          />
        )}

        {p.error ? (
          <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">
            {p.error}
          </p>
        ) : null}

        <div className="mt-6 border-t border-slate-200/90 pt-4">
          {step === 'kunde' ? (
            <PrimaryButton
              accent={accent}
              disabled={!p.customerName.trim()}
              onClick={() => p.setTab('produkter')}
            >
              Videre
            </PrimaryButton>
          ) : step === 'produkter' ? (
            <PrimaryButton
              accent={accent}
              disabled={p.lines.filter((l) => l.description.trim()).length === 0}
              onClick={() => p.setTab('overblik')}
            >
              Videre
            </PrimaryButton>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={p.saving}
                onClick={p.onSave}
                className="rounded-full border border-slate-300 bg-white py-3.5 text-[15px] font-semibold text-slate-700 disabled:opacity-60"
              >
                Gem kladde
              </button>
              <button
                type="button"
                disabled={p.saving}
                onClick={p.onSend}
                className={accent.sendBtnClass}
              >
                {p.invoiceStatus === 'draft' ? 'Opret og send' : 'Marker sendt'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CustomerTab({
  accent,
  customerName,
  setCustomerName,
  customerEmail,
  setCustomerEmail,
  query,
  setQuery,
  recent,
}: {
  accent: WizardAccent
  customerName: string
  setCustomerName: (v: string) => void
  customerEmail: string
  setCustomerEmail: (v: string) => void
  query: string
  setQuery: (v: string) => void
  recent: { name: string; email: string | null }[]
}) {
  const cvr = useCvrSearch(query, !customerName)

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-slate-900">Tilføj kunde</h2>
      {customerName ? (
        <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-4 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-center gap-3">
            <FactoryIcon />
            <div>
              <div className="text-[15px] font-semibold text-slate-900">
                {customerName}
              </div>
              {customerEmail ? (
                <div className="text-xs text-slate-500">{customerEmail}</div>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setCustomerName('')
              setCustomerEmail('')
            }}
            aria-label="Fjern kunde"
            className="text-slate-400 hover:text-slate-700"
          >
            <CloseIcon />
          </button>
        </div>
      ) : (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Navn, firma eller CVR"
          className={`w-full rounded-xl border-0 bg-white px-4 py-3.5 text-[15px] shadow-sm ring-1 ring-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${accent.inputFocusRing}`}
        />
      )}

      {!customerName && (
        <>
          <button
            type="button"
            onClick={() => {
              if (query.trim()) {
                setCustomerName(query.trim())
                setQuery('')
              }
            }}
            className={`flex w-full items-center gap-3 text-[15px] font-medium ${accent.link}`}
          >
            <PlusIcon />
            Opret ny kontakt
          </button>

          {cvr.notice ? (
            <p className="text-xs text-slate-500">{cvr.notice}</p>
          ) : null}

          {cvr.loading ? (
            <p className="text-xs text-slate-500">Søger i CVR…</p>
          ) : null}

          {!cvr.notice && cvr.results.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                CVR
              </p>
              {cvr.results.map((row) => (
                <button
                  key={`${row.vat}-${row.name}`}
                  type="button"
                  onClick={() => {
                    setCustomerName(row.name)
                    setCustomerEmail(row.email ?? '')
                    setQuery('')
                  }}
                  className={`flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3.5 text-left shadow-sm ring-1 ${accent.cvrCardRing} ${accent.cvrCardRingHover}`}
                >
                  <FactoryIcon />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold text-slate-900">
                      {row.name}
                    </div>
                    <div className="truncate text-xs text-slate-500">
                      CVR {String(row.vat).padStart(8, '0')}
                      {row.email ? ` · ${row.email}` : ''}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : null}

          {recent.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Seneste
              </p>
              {recent.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => {
                    setCustomerName(c.name)
                    setCustomerEmail(c.email ?? '')
                  }}
                  className={`flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3.5 text-left shadow-sm ring-1 ring-slate-200 ${accent.recentCardHoverRing}`}
                >
                  <FactoryIcon />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold text-slate-900">
                      {c.name}
                    </div>
                    {c.email ? (
                      <div className="truncate text-xs text-slate-500">
                        {c.email}
                      </div>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {customerName && (
        <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <label className="block">
            <span className="text-xs font-medium text-slate-500">E-mail</span>
            <input
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              placeholder="kunde@firma.dk"
              className={`mt-1 w-full border-0 border-b border-slate-200 bg-transparent px-0 py-2 text-[15px] ${accent.inputFocusBorder} focus:outline-none focus:ring-0`}
            />
          </label>
        </div>
      )}
    </div>
  )
}

type PopularProductRow = {
  description: string
  unit_price_cents: number
  vat_rate: number
  usage_count: number
}

function popularProductKey(p: PopularProductRow) {
  return `${p.description}\0${Number(p.unit_price_cents)}\0${Number(p.vat_rate)}`
}

function ProductsTab({
  accent,
  lines,
  onOpen,
  onAdd,
  onAddFromProduct,
  companyId,
  onRemove,
}: {
  accent: WizardAccent
  lines: WizardLine[]
  onOpen: (i: number) => void
  onAdd: () => void
  onAddFromProduct: (p: {
    description: string
    unit_price_cents: number
    vat_rate: number
  }) => void
  companyId: string | null
  onRemove: (i: number) => void
}) {
  const [companyPopular, setCompanyPopular] = useState<PopularProductRow[]>(
    [],
  )
  const [globalPopular, setGlobalPopular] = useState<PopularProductRow[]>([])
  const [popularLoading, setPopularLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setPopularLoading(true)
      const globalP = supabase.rpc('get_popular_invoice_products_globally', {
        p_limit: 8,
      })
      const companyP = companyId
        ? supabase.rpc('get_popular_invoice_products_for_company', {
            p_company_id: companyId,
            p_limit: 8,
          })
        : Promise.resolve({
            data: null as PopularProductRow[] | null,
            error: null,
          })

      const [gRes, cRes] = await Promise.all([globalP, companyP])
      if (cancelled) return
      setPopularLoading(false)

      const companyRows = (cRes.data ?? []) as PopularProductRow[]
      setCompanyPopular(cRes.error ? [] : companyRows)

      const globalRows = ((gRes.data ?? []) as PopularProductRow[]) 
      setGlobalPopular(
        gRes.error
          ? []
          : globalRows.filter((r) => {
              const keys = new Set(companyRows.map(popularProductKey))
              return !keys.has(popularProductKey(r))
            }),
      )
    })()
    return () => {
      cancelled = true
    }
  }, [companyId])

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-slate-900">Tilføj fakturalinje</h2>

      <input
        placeholder="Hvad har du solgt?"
        className={`w-full rounded-xl border-0 bg-white px-4 py-3.5 text-[15px] shadow-sm ring-1 ring-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${accent.inputFocusRing}`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.currentTarget.value.trim()) {
            onAdd()
          }
        }}
      />

      <button
        type="button"
        onClick={onAdd}
        className={`flex w-full items-center gap-3 text-[15px] font-medium ${accent.link}`}
      >
        <PlusIcon />
        Opret fakturalinje
      </button>

      {popularLoading ? (
        <p className="text-xs text-slate-500">Indlæser forslag…</p>
      ) : null}

      {!popularLoading && companyId && companyPopular.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Ofte brugt i din virksomhed
          </p>
          <div className="space-y-2">
            {companyPopular.map((row) => (
              <button
                key={`c-${popularProductKey(row)}`}
                type="button"
                onClick={() =>
                  onAddFromProduct({
                    description: row.description,
                    unit_price_cents: Number(row.unit_price_cents),
                    vat_rate: Number(row.vat_rate),
                  })
                }
                className={`flex w-full flex-col gap-0.5 rounded-2xl bg-white px-4 py-3 text-left shadow-sm ring-1 ring-slate-200 transition ${accent.productRowHoverRing}`}
              >
                <span className="text-[15px] font-semibold leading-snug text-slate-900">
                  {row.description}
                </span>
                <span className="text-xs text-slate-500">
                  {formatDkk(Number(row.unit_price_cents))} · {Number(row.vat_rate)}% moms
                  {row.usage_count > 1 ? ` · ${row.usage_count}×` : ''}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {!popularLoading && globalPopular.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Ofte brugt på tværs af virksomheder
          </p>
          <div className="space-y-2">
            {globalPopular.map((row) => (
              <button
                key={`g-${popularProductKey(row)}`}
                type="button"
                onClick={() =>
                  onAddFromProduct({
                    description: row.description,
                    unit_price_cents: Number(row.unit_price_cents),
                    vat_rate: Number(row.vat_rate),
                  })
                }
                className={`flex w-full flex-col gap-0.5 rounded-2xl bg-white px-4 py-3 text-left shadow-sm ring-1 ring-slate-200 transition ${accent.productRowHoverRing}`}
              >
                <span className="text-[15px] font-semibold leading-snug text-slate-900">
                  {row.description}
                </span>
                <span className="text-xs text-slate-500">
                  {formatDkk(Number(row.unit_price_cents))} · {Number(row.vat_rate)}% moms
                  {row.usage_count > 1 ? ` · ${row.usage_count}×` : ''}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {lines.length > 0 && (
        <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          {lines.map((l, i) => {
            const adjustedPrice = Math.round(
              l.unit_price_cents * (1 - l.discount_pct / 100),
            )
            return (
              <div
                key={i}
                className="flex items-start gap-3 px-4 py-3.5"
              >
                <button
                  type="button"
                  onClick={() => onOpen(i)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="truncate text-[15px] font-semibold text-slate-900">
                    {l.description || 'Ny fakturalinje'}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {l.quantity.toLocaleString('da-DK')} stk. × {formatDkk(adjustedPrice)}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  aria-label="Fjern linje"
                  className="shrink-0 p-1 text-slate-400 hover:text-red-600"
                >
                  <CloseIcon />
                </button>
                <ChevronIcon className="mt-1 h-4 w-4 shrink-0 text-slate-300" />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function OverviewTab({
  accent,
  customerName,
  customerEmail,
  issueDate,
  setIssueDate,
  dueDate,
  setDueDate,
  title,
  notes,
  lines,
  totals,
  onOpenSettings,
  invoiceNumber,
  showInvoiceNumber,
}: {
  accent: WizardAccent
  customerName: string
  customerEmail: string
  issueDate: string
  setIssueDate: (v: string) => void
  dueDate: string
  setDueDate: (v: string) => void
  title: string
  notes: string
  lines: WizardLine[]
  totals: { net_cents: number; vat_cents: number; gross_cents: number }
  onOpenSettings: () => void
  invoiceNumber: string
  showInvoiceNumber: boolean
}) {
  return (
    <div className="space-y-4">
      {showInvoiceNumber && invoiceNumber.trim() ? (
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="text-xs font-medium text-slate-500">Fakturanr.</div>
          <div className="mt-1 text-[15px] font-semibold tabular-nums text-slate-900">
            {invoiceNumber}
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-slate-500">Overskrift</div>
            <div className="text-[15px] font-semibold text-slate-900">{title}</div>
          </div>
          <button
            type="button"
            onClick={onOpenSettings}
            className={`text-[13px] font-medium ${accent.link}`}
          >
            Rediger
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="text-xs font-medium text-slate-500">Kunde</div>
        <div className="mt-1 text-[15px] font-semibold text-slate-900">
          {customerName || '—'}
        </div>
        {customerEmail ? (
          <div className="text-xs text-slate-500">{customerEmail}</div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <span className="text-xs font-medium text-slate-500">Fakturadato</span>
          <input
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            className="mt-1 w-full border-0 bg-transparent px-0 py-1 text-[15px] focus:outline-none focus:ring-0"
          />
        </label>
        <label className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <span className="text-xs font-medium text-slate-500">Forfald</span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="mt-1 w-full border-0 bg-transparent px-0 py-1 text-[15px] focus:outline-none focus:ring-0"
          />
        </label>
      </div>

      <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        {lines.filter((l) => l.description.trim()).length === 0 ? (
          <div className="px-4 py-5 text-sm text-slate-500">
            Ingen fakturalinjer endnu.
          </div>
        ) : (
          lines
            .filter((l) => l.description.trim())
            .map((l, i) => {
              const adj = Math.round(l.unit_price_cents * (1 - l.discount_pct / 100))
              const sum = Math.round(l.quantity * adj)
              return (
                <div key={i} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-medium text-slate-900">
                      {l.description}
                    </div>
                    <div className="text-xs text-slate-500">
                      {l.quantity.toLocaleString('da-DK')} × {formatDkk(adj)}
                    </div>
                  </div>
                  <div className="text-[15px] font-semibold text-slate-900">
                    {formatDkk(sum)}
                  </div>
                </div>
              )
            })
        )}
      </div>

      {notes ? (
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="text-xs font-medium text-slate-500">Kommentar</div>
          <div className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{notes}</div>
        </div>
      ) : null}

      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="flex justify-between text-sm text-slate-600">
          <span>Netto</span>
          <span className="font-medium text-slate-800">{formatDkk(totals.net_cents)}</span>
        </div>
        <div className="mt-1 flex justify-between text-sm text-slate-600">
          <span>Moms</span>
          <span className="font-medium text-slate-800">{formatDkk(totals.vat_cents)}</span>
        </div>
        <div className="mt-3 flex items-end justify-between border-t border-slate-100 pt-3">
          <span className="text-sm text-slate-500">Brutto</span>
          <span className="text-2xl font-bold text-slate-900">
            {formatDkk(totals.gross_cents)}
          </span>
        </div>
      </div>
    </div>
  )
}

function LineEditorView({
  line,
  accent,
  lineSheetTitle,
  onBack,
  onOpenSettings,
  onChange,
  onDelete,
  onSave,
  priceMode,
  allowNegativePrice,
}: {
  line: WizardLine
  accent: WizardAccent
  lineSheetTitle: string
  onBack: () => void
  onOpenSettings: () => void
  onChange: (p: Partial<WizardLine>) => void
  onDelete: () => void
  onSave: () => void
  priceMode: 'excl' | 'incl'
  allowNegativePrice: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  const adjustedPrice = Math.round(
    line.unit_price_cents * (1 - line.discount_pct / 100),
  )
  const net = Math.round(line.quantity * adjustedPrice)
  const gross = Math.round(net * (1 + line.vat_rate / 100))
  const displayedTotal = priceMode === 'incl' ? gross : net

  return (
    <div className="flex flex-col">
      <SheetHeader
        left={
          <button
            type="button"
            onClick={onBack}
            className={`flex items-center gap-1 text-[15px] font-medium ${accent.link}`}
          >
            <ChevronIcon className="h-4 w-4 rotate-180" /> Tilbage
          </button>
        }
        title={lineSheetTitle}
        right={
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Indstillinger"
            className={accent.link}
          >
            <SlidersIcon />
          </button>
        }
      />

      <div className={invoiceWizardBodyClass}>
        <div className="space-y-5">
          <label className="block">
            <span className="text-xs font-medium text-slate-500">Beskrivelse</span>
            <textarea
              rows={2}
              value={line.description}
              onChange={(e) => onChange({ description: e.target.value })}
              className={`mt-1 w-full resize-none border-0 border-b border-slate-300 bg-transparent px-0 py-2 text-[17px] leading-snug text-slate-900 ${accent.inputFocusBorder} focus:outline-none focus:ring-0`}
              placeholder="Beskriv ydelsen"
            />
          </label>

          <div className="grid grid-cols-[1fr_auto] items-end gap-4">
            <label>
              <span className="text-xs font-medium text-slate-500">Antal:</span>
              <input
                type="number"
                min={0}
                step="any"
                value={line.quantity}
                onChange={(e) =>
                  onChange({ quantity: Number(e.target.value) || 0 })
                }
                className={`mt-1 w-full rounded-xl bg-white px-4 py-3 text-[17px] shadow-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 ${accent.inputFocusRing}`}
              />
            </label>
            <div className={`pb-3 text-[15px] font-medium ${accent.link}`}>Stk.</div>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-slate-500">
              Pris pr. stk.{priceMode === 'incl' ? ' (inkl. moms)' : ''}
            </span>
            <CurrencyInput
              accent={accent}
              cents={line.unit_price_cents}
              onChange={(c) => onChange({ unit_price_cents: c })}
              allowNegative={allowNegativePrice}
            />
          </label>

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className={`flex w-full items-center justify-center gap-2 py-1 text-[15px] font-medium ${accent.link}`}
          >
            Flere valgmuligheder
            <ChevronIcon className={expanded ? 'h-4 w-4 -rotate-90' : 'h-4 w-4 rotate-90'} />
          </button>

          {expanded && (
            <div className="space-y-5 border-t border-slate-200 pt-5">
              <label className="block">
                <span className="text-xs font-medium text-slate-500">Rabat (%)</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  value={line.discount_pct}
                  onChange={(e) =>
                    onChange({
                      discount_pct: Math.max(
                        0,
                        Math.min(100, Number(e.target.value) || 0),
                      ),
                    })
                  }
                  className={`mt-1 w-full rounded-xl bg-white px-4 py-3 text-[17px] shadow-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 ${accent.inputFocusRing}`}
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-slate-500">Kommentar</span>
                <input
                  value={line.comment}
                  onChange={(e) => onChange({ comment: e.target.value })}
                  placeholder="Angiv en kommentar til produktet"
                  className={`mt-1 w-full rounded-xl bg-white px-4 py-3 text-[15px] shadow-sm ring-1 ring-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${accent.inputFocusRing}`}
                />
              </label>

              <div>
                <div className="text-xs font-medium text-slate-500">Bogføringskonto</div>
                <div className="mt-2 flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
                  <div className="text-[15px] text-slate-800">{line.account}</div>
                  <span className={`flex items-center gap-1 text-[15px] font-medium ${accent.link}`}>
                    Skift konto <ChevronIcon className="h-4 w-4" />
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="pt-4">
            <div className="text-xs font-medium text-slate-500">Samlet pris</div>
            <div className="mt-1 text-3xl font-bold text-slate-900">
              {formatDkk(displayedTotal)}
            </div>
            {priceMode === 'excl' ? (
              <div className="mt-0.5 text-xs text-slate-500">
                {formatDkk(gross)} inkl. moms
              </div>
            ) : (
              <div className="mt-0.5 text-xs text-slate-500">
                {formatDkk(net)} ekskl. moms
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <button
          type="button"
          onClick={onDelete}
          className="text-[13px] font-medium text-red-600"
        >
          Slet linje
        </button>
        <PrimaryButton accent={accent} onClick={onSave} className="flex-1 max-w-xs">
          Gem
        </PrimaryButton>
      </div>
    </div>
  )
}

function SettingsView({
  accent,
  onBack,
  title,
  setTitle,
  notes,
  setNotes,
  priceMode,
  setPriceMode,
  issueDate,
  setIssueDate,
  dueDate,
  setDueDate,
}: {
  accent: WizardAccent
  onBack: () => void
  title: string
  setTitle: (v: string) => void
  notes: string
  setNotes: (v: string) => void
  priceMode: 'excl' | 'incl'
  setPriceMode: (v: 'excl' | 'incl') => void
  issueDate: string
  setIssueDate: (v: string) => void
  dueDate: string
  setDueDate: (v: string) => void
}) {
  return (
    <div className="flex flex-col">
      <SheetHeader
        left={
          <button
            type="button"
            onClick={onBack}
            className={`flex items-center gap-1 text-[15px] font-medium ${accent.link}`}
          >
            <ChevronIcon className="h-4 w-4 rotate-180" /> Tilbage
          </button>
        }
        title="Indstillinger"
      />
      <div className={`${invoiceWizardBodyClass} space-y-6`}>
        <label className="block">
          <span className="text-xs font-medium text-slate-500">Kommentar</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Tilføj kommentar til fakturaen"
            className={`mt-1 w-full resize-none rounded-xl bg-white px-4 py-3 text-[15px] shadow-sm ring-1 ring-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${accent.inputFocusRing}`}
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-500">Overskrift</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={`mt-1 w-full rounded-xl bg-white px-4 py-3 text-[15px] shadow-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 ${accent.inputFocusRing}`}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-500">Fakturadato</span>
            <input
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              className={`mt-1 w-full rounded-xl bg-white px-4 py-3 text-[15px] shadow-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 ${accent.inputFocusRing}`}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-500">Forfaldsdato</span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={`mt-1 w-full rounded-xl bg-white px-4 py-3 text-[15px] shadow-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 ${accent.inputFocusRing}`}
            />
          </label>
        </div>

        <div>
          <div className="text-xs font-medium text-slate-500">Beløb</div>
          <div className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
            <button
              type="button"
              onClick={() => setPriceMode('incl')}
              className="flex w-full items-center justify-between px-4 py-3.5 text-left"
            >
              <span
                className={
                  priceMode === 'incl'
                    ? `text-[15px] font-semibold ${accent.priceModeActive}`
                    : 'text-[15px] text-slate-700'
                }
              >
                Indtast beløb inkl. moms
              </span>
              {priceMode === 'incl' ? <CheckIcon accent={accent} /> : null}
            </button>
            <button
              type="button"
              onClick={() => setPriceMode('excl')}
              className="flex w-full items-center justify-between px-4 py-3.5 text-left"
            >
              <span
                className={
                  priceMode === 'excl'
                    ? `text-[15px] font-semibold ${accent.priceModeActive}`
                    : 'text-[15px] text-slate-700'
                }
              >
                Indtast beløb ekskl. moms
              </span>
              {priceMode === 'excl' ? <CheckIcon accent={accent} /> : null}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3.5 shadow-sm ring-1 ring-slate-200">
          <span className="text-[15px] text-slate-700">Valuta</span>
          <span className={`text-[15px] font-medium ${accent.link}`}>Danske kroner (DKK)</span>
        </div>
      </div>
    </div>
  )
}

function SheetHeader({
  left,
  title,
  right,
}: {
  left?: React.ReactNode
  title: string
  right?: React.ReactNode
}) {
  return (
    <div className="sticky top-0 z-10 grid grid-cols-[1fr_auto_1fr] items-center border-b border-slate-200 bg-white px-4 py-3.5">
      <div className="flex justify-start">{left}</div>
      <div className="text-[17px] font-semibold text-slate-900">{title}</div>
      <div className="flex justify-end">{right}</div>
    </div>
  )
}

function PrimaryButton({
  accent,
  children,
  onClick,
  disabled,
  className = '',
}: {
  accent: WizardAccent
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={accent.primaryBtnClasses + className}
    >
      {children}
    </button>
  )
}

function CurrencyInput({
  accent,
  cents,
  onChange,
  allowNegative = false,
}: {
  accent: WizardAccent
  cents: number
  onChange: (cents: number) => void
  allowNegative?: boolean
}) {
  const [text, setText] = useState(() => (cents / 100).toFixed(2).replace('.', ','))
  useEffect(() => {
    setText((cents / 100).toFixed(2).replace('.', ','))
  }, [cents])

  return (
    <input
      inputMode="decimal"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const n = Number(text.replace(/\./g, '').replace(',', '.'))
        if (Number.isFinite(n)) {
          const c = Math.round(n * 100)
          onChange(allowNegative ? c : Math.max(0, c))
        } else {
          setText((cents / 100).toFixed(2).replace('.', ','))
        }
      }}
      className={`mt-1 w-full rounded-xl bg-white px-4 py-3 text-[17px] shadow-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 ${accent.inputFocusRing}`}
    />
  )
}

function PlusIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 6l12 12M6 18 18 6" />
    </svg>
  )
}

function ChevronIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}

function CheckIcon({ accent }: { accent: WizardAccent }) {
  return (
    <svg
      className={`h-5 w-5 ${accent.checkIcon}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m5 12 5 5L20 7" />
    </svg>
  )
}

function SlidersIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </svg>
  )
}

function FactoryIcon() {
  return (
    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 21V9l6 3V9l6 3V9l6 3v9z" />
        <path d="M3 21h18" />
      </svg>
    </div>
  )
}
