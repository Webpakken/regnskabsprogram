import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Link, useMatch, useNavigate, useParams } from 'react-router-dom'
import { useApp } from '@/context/AppProvider'
import { logActivity } from '@/lib/activity'
import { blobToBase64 } from '@/lib/blobToBase64'
import { invokePlatformEmail } from '@/lib/edge'
import { formatDkk } from '@/lib/format'
import { fetchCompanyLogoDataUrl } from '@/lib/invoiceBranding'
import { generateInvoicePdfBlob } from '@/lib/invoicePdf'
import { lineAmounts, totalsFromLines, type DraftLine } from '@/lib/invoiceMath'
import type { Database } from '@/types/database'

type Invoice = Database['public']['Tables']['invoices']['Row']
type LineRow = Database['public']['Tables']['invoice_line_items']['Row']

type WizardLine = DraftLine & {
  discount_pct: number
  comment: string
  account: string
}

const DEFAULT_ACCOUNT = '1000 - Salg af varer/ydelser m/moms'

const emptyLine = (): WizardLine => ({
  description: '',
  quantity: 1,
  unit_price_cents: 0,
  vat_rate: 25,
  discount_pct: 0,
  comment: '',
  account: DEFAULT_ACCOUNT,
})

type Tab = 'kunde' | 'produkter' | 'overblik'
type View =
  | { kind: 'wizard' }
  | { kind: 'lineEditor'; index: number }
  | { kind: 'settings' }

type CvrCompany = { vat: number; name: string; email: string | null }

async function sendInvoiceSentEmailWithOptionalPdf(opts: {
  companyId: string
  attachPdf: boolean
  invoiceId: string
}) {
  const { companyId, attachPdf, invoiceId } = opts
  const payload: Record<string, unknown> = { invoice_id: invoiceId }
  if (attachPdf) {
    try {
      const { data: company, error: ce } = await supabase
        .from('companies')
        .select('*')
        .eq('id', companyId)
        .single()
      const { data: inv, error: e1 } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .eq('company_id', companyId)
        .single()
      const { data: li } = await supabase
        .from('invoice_line_items')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('sort_order', { ascending: true })
      if (!ce && !e1 && company && inv && li) {
        const logo = await fetchCompanyLogoDataUrl(company.invoice_logo_path)
        const blob = generateInvoicePdfBlob(company, inv, li as LineRow[], logo)
        payload.invoice_pdf_base64 = await blobToBase64(blob)
      }
    } catch {
      /* e-mail sendes uden vedhæftning */
    }
  }
  await invokePlatformEmail('invoice_sent', payload)
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
      setLoading(false)
      if (error) {
        setResults([])
        setNotice('Kunne ikke søge i CVR.')
        return
      }
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
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query, active])

  return { results, loading, notice }
}

function effectiveDraft(line: WizardLine): DraftLine {
  const adjusted = Math.max(
    0,
    Math.round(line.unit_price_cents * (1 - line.discount_pct / 100)),
  )
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
  const isNew = useMatch({ path: '/app/invoices/new', end: true }) !== null
  const invoiceId = isNew ? null : (params.id ?? null)

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
    if (!invoiceId || !currentCompany) {
      setLoading(false)
      return
    }
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
      setInvoiceNumber(inv.invoice_number)
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
    setLines((prev) => [
      ...prev,
      {
        ...emptyLine(),
        description: p.description,
        unit_price_cents: p.unit_price_cents,
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
    if (!customerName.trim()) {
      setError('Vælg en kunde')
      setSaving(false)
      setTab('kunde')
      return
    }
    const drafts = effective.map(effectiveDraft)
    const t = totalsFromLines(drafts)
    const st = nextStatus ?? status

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
        if (st === 'sent') {
          void sendInvoiceSentEmailWithOptionalPdf({
            companyId: currentCompany.id,
            attachPdf: currentCompany.invoice_attach_pdf_to_email !== false,
            invoiceId: inv.id,
          }).catch(() => {})
        }
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
            attachPdf: currentCompany.invoice_attach_pdf_to_email !== false,
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
  if (loading) return <p className="text-slate-500">Indlæser faktura…</p>

  const heading = isNew
    ? invoiceNumber
      ? `Opret faktura (${invoiceNumber})`
      : 'Opret faktura'
    : `Faktura ${invoiceNumber}`

  return (
    <div className="-mx-4 -mt-6 md:mx-auto md:mt-0 md:max-w-xl">
      <div className="overflow-hidden bg-white md:mt-4 md:rounded-3xl md:shadow-xl md:ring-1 md:ring-slate-200">
        {view.kind === 'wizard' && (
          <WizardView
            heading={heading}
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
          />
        )}

        {view.kind === 'lineEditor' && lines[view.index] && (
          <LineEditorView
            line={lines[view.index]}
            onBack={() => setView({ kind: 'wizard' })}
            onOpenSettings={() => setView({ kind: 'settings' })}
            onChange={(p) => updateLine(view.index, p)}
            onDelete={() => {
              removeLine(view.index)
              setView({ kind: 'wizard' })
            }}
            onSave={() => setView({ kind: 'wizard' })}
            priceMode={priceMode}
          />
        )}

        {view.kind === 'settings' && (
          <SettingsView
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
}

function WizardView(p: WizardViewProps) {
  const filtered = p.customerQuery.trim()
    ? p.recentCustomers.filter((c) =>
        c.name.toLowerCase().includes(p.customerQuery.toLowerCase()),
      )
    : p.recentCustomers

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col md:min-h-[640px]">
      <SheetHeader
        left={
          <button
            type="button"
            onClick={p.onClose}
            className="text-[15px] font-medium text-indigo-600"
          >
            Luk
          </button>
        }
        title={p.heading}
      />

      <div className="grid grid-cols-3 border-b border-slate-200 bg-white text-[15px]">
        {(['kunde', 'produkter', 'overblik'] as const).map((t) => {
          const active = p.tab === t
          const label = t === 'kunde' ? 'Kunde' : t === 'produkter' ? 'Produkter' : 'Overblik'
          return (
            <button
              key={t}
              type="button"
              onClick={() => p.setTab(t)}
              className={
                'relative py-3 text-center transition ' +
                (active
                  ? 'font-semibold text-indigo-600'
                  : 'text-slate-500 hover:text-slate-700')
              }
            >
              {label}
              <span
                className={
                  'absolute inset-x-0 -bottom-px mx-auto h-[3px] rounded-full ' +
                  (active ? 'bg-indigo-600' : 'bg-transparent')
                }
              />
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-y-auto bg-slate-50 px-5 py-6">
        {p.tab === 'kunde' && (
          <CustomerTab
            customerName={p.customerName}
            setCustomerName={p.setCustomerName}
            customerEmail={p.customerEmail}
            setCustomerEmail={p.setCustomerEmail}
            query={p.customerQuery}
            setQuery={p.setCustomerQuery}
            recent={filtered}
          />
        )}
        {p.tab === 'produkter' && (
          <ProductsTab
            lines={p.lines}
            onOpen={p.onOpenLine}
            onAdd={p.onAddLine}
            onAddFromProduct={p.onAddLineFromProduct}
            companyId={p.companyId}
            onRemove={p.onRemoveLine}
          />
        )}
        {p.tab === 'overblik' && (
          <OverviewTab
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
          />
        )}
      </div>

      {p.error ? (
        <p className="border-t border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700">
          {p.error}
        </p>
      ) : null}

      <div className="border-t border-slate-200 bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        {p.tab === 'kunde' ? (
          <PrimaryButton
            disabled={!p.customerName.trim()}
            onClick={() => p.setTab('produkter')}
          >
            Videre
          </PrimaryButton>
        ) : p.tab === 'produkter' ? (
          <PrimaryButton
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
              className="rounded-full bg-indigo-600 py-3.5 text-[15px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {p.invoiceStatus === 'draft' ? 'Opret og send' : 'Marker sendt'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function CustomerTab({
  customerName,
  setCustomerName,
  customerEmail,
  setCustomerEmail,
  query,
  setQuery,
  recent,
}: {
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
          className="w-full rounded-xl border-0 bg-white px-4 py-3.5 text-[15px] shadow-sm ring-1 ring-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
            className="flex w-full items-center gap-3 text-[15px] font-medium text-indigo-600"
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
                  className="flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3.5 text-left shadow-sm ring-1 ring-indigo-200 hover:ring-indigo-400"
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
                  className="flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3.5 text-left shadow-sm ring-1 ring-slate-200 hover:ring-indigo-300"
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
              className="mt-1 w-full border-0 border-b border-slate-200 bg-transparent px-0 py-2 text-[15px] focus:border-indigo-500 focus:outline-none focus:ring-0"
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
  lines,
  onOpen,
  onAdd,
  onAddFromProduct,
  companyId,
  onRemove,
}: {
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
        className="w-full rounded-xl border-0 bg-white px-4 py-3.5 text-[15px] shadow-sm ring-1 ring-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.currentTarget.value.trim()) {
            onAdd()
          }
        }}
      />

      <button
        type="button"
        onClick={onAdd}
        className="flex w-full items-center gap-3 text-[15px] font-medium text-indigo-600"
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
                className="flex w-full flex-col gap-0.5 rounded-2xl bg-white px-4 py-3 text-left shadow-sm ring-1 ring-slate-200 transition hover:ring-indigo-300"
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
                className="flex w-full flex-col gap-0.5 rounded-2xl bg-white px-4 py-3 text-left shadow-sm ring-1 ring-slate-200 transition hover:ring-indigo-300"
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
}: {
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
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-slate-500">Overskrift</div>
            <div className="text-[15px] font-semibold text-slate-900">{title}</div>
          </div>
          <button
            type="button"
            onClick={onOpenSettings}
            className="text-[13px] font-medium text-indigo-600"
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
  onBack,
  onOpenSettings,
  onChange,
  onDelete,
  onSave,
  priceMode,
}: {
  line: WizardLine
  onBack: () => void
  onOpenSettings: () => void
  onChange: (p: Partial<WizardLine>) => void
  onDelete: () => void
  onSave: () => void
  priceMode: 'excl' | 'incl'
}) {
  const [expanded, setExpanded] = useState(false)

  const adjustedPrice = Math.round(
    line.unit_price_cents * (1 - line.discount_pct / 100),
  )
  const net = Math.round(line.quantity * adjustedPrice)
  const gross = Math.round(net * (1 + line.vat_rate / 100))
  const displayedTotal = priceMode === 'incl' ? gross : net

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col md:min-h-[640px]">
      <SheetHeader
        left={
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 text-[15px] font-medium text-indigo-600"
          >
            <ChevronIcon className="h-4 w-4 rotate-180" /> Tilbage
          </button>
        }
        title="Fakturalinje"
        right={
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Indstillinger"
            className="text-indigo-600"
          >
            <SlidersIcon />
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto bg-slate-50 px-5 py-6">
        <div className="space-y-5">
          <label className="block">
            <span className="text-xs font-medium text-slate-500">Beskrivelse</span>
            <textarea
              rows={2}
              value={line.description}
              onChange={(e) => onChange({ description: e.target.value })}
              className="mt-1 w-full resize-none border-0 border-b border-slate-300 bg-transparent px-0 py-2 text-[17px] leading-snug text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-0"
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
                className="mt-1 w-full rounded-xl bg-white px-4 py-3 text-[17px] shadow-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
            <div className="pb-3 text-[15px] font-medium text-indigo-600">Stk.</div>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-slate-500">
              Pris pr. stk.{priceMode === 'incl' ? ' (inkl. moms)' : ''}
            </span>
            <CurrencyInput
              cents={line.unit_price_cents}
              onChange={(c) => onChange({ unit_price_cents: c })}
            />
          </label>

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center justify-center gap-2 py-1 text-[15px] font-medium text-indigo-600"
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
                  className="mt-1 w-full rounded-xl bg-white px-4 py-3 text-[17px] shadow-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-slate-500">Kommentar</span>
                <input
                  value={line.comment}
                  onChange={(e) => onChange({ comment: e.target.value })}
                  placeholder="Angiv en kommentar til produktet"
                  className="mt-1 w-full rounded-xl bg-white px-4 py-3 text-[15px] shadow-sm ring-1 ring-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>

              <div>
                <div className="text-xs font-medium text-slate-500">Bogføringskonto</div>
                <div className="mt-2 flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
                  <div className="text-[15px] text-slate-800">{line.account}</div>
                  <span className="flex items-center gap-1 text-[15px] font-medium text-indigo-600">
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

      <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <button
          type="button"
          onClick={onDelete}
          className="text-[13px] font-medium text-red-600"
        >
          Slet linje
        </button>
        <PrimaryButton onClick={onSave} className="flex-1 max-w-xs">
          Gem
        </PrimaryButton>
      </div>
    </div>
  )
}

function SettingsView({
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
    <div className="flex min-h-[calc(100vh-4rem)] flex-col md:min-h-[640px]">
      <SheetHeader
        left={
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 text-[15px] font-medium text-indigo-600"
          >
            <ChevronIcon className="h-4 w-4 rotate-180" /> Tilbage
          </button>
        }
        title="Indstillinger"
      />
      <div className="flex-1 overflow-y-auto bg-slate-50 px-5 py-6 space-y-6">
        <label className="block">
          <span className="text-xs font-medium text-slate-500">Kommentar</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Tilføj kommentar til fakturaen"
            className="mt-1 w-full resize-none rounded-xl bg-white px-4 py-3 text-[15px] shadow-sm ring-1 ring-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-500">Overskrift</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-xl bg-white px-4 py-3 text-[15px] shadow-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-500">Fakturadato</span>
            <input
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              className="mt-1 w-full rounded-xl bg-white px-4 py-3 text-[15px] shadow-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-500">Forfaldsdato</span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 w-full rounded-xl bg-white px-4 py-3 text-[15px] shadow-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
              <span className={priceMode === 'incl' ? 'text-[15px] font-semibold text-indigo-600' : 'text-[15px] text-slate-700'}>
                Indtast beløb inkl. moms
              </span>
              {priceMode === 'incl' ? <CheckIcon /> : null}
            </button>
            <button
              type="button"
              onClick={() => setPriceMode('excl')}
              className="flex w-full items-center justify-between px-4 py-3.5 text-left"
            >
              <span className={priceMode === 'excl' ? 'text-[15px] font-semibold text-indigo-600' : 'text-[15px] text-slate-700'}>
                Indtast beløb ekskl. moms
              </span>
              {priceMode === 'excl' ? <CheckIcon /> : null}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3.5 shadow-sm ring-1 ring-slate-200">
          <span className="text-[15px] text-slate-700">Valuta</span>
          <span className="text-[15px] font-medium text-indigo-600">Danske kroner (DKK)</span>
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
  children,
  onClick,
  disabled,
  className = '',
}: {
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
      className={
        'w-full rounded-full bg-indigo-600 py-3.5 text-[15px] font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50 ' +
        className
      }
    >
      {children}
    </button>
  )
}

function CurrencyInput({
  cents,
  onChange,
}: {
  cents: number
  onChange: (cents: number) => void
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
          onChange(Math.max(0, Math.round(n * 100)))
        } else {
          setText((cents / 100).toFixed(2).replace('.', ','))
        }
      }}
      className="mt-1 w-full rounded-xl bg-white px-4 py-3 text-[17px] shadow-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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

function CheckIcon() {
  return (
    <svg className="h-5 w-5 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
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
