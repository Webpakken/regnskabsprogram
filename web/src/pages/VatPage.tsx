import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppPageLayout } from '@/components/AppPageLayout'
import { SortableTh } from '@/components/SortableTh'
import { nextColumnSortState, type ColumnSortDir } from '@/lib/tableSort'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppProvider'
import { copenhagenYmd, copenhagenYear, formatDkk } from '@/lib/format'

type Period = { label: string; from: string; to: string }

function danishQuarters(year: number): Period[] {
  return [
    { label: `${year} · Q1 (jan–mar)`, from: `${year}-01-01`, to: `${year}-03-31` },
    { label: `${year} · Q2 (apr–jun)`, from: `${year}-04-01`, to: `${year}-06-30` },
    { label: `${year} · Q3 (jul–sep)`, from: `${year}-07-01`, to: `${year}-09-30` },
    { label: `${year} · Q4 (okt–dec)`, from: `${year}-10-01`, to: `${year}-12-31` },
  ]
}

function currentQuarterKey(): string {
  const ymd = copenhagenYmd()
  const m = parseInt(ymd.slice(5, 7), 10)
  const y = parseInt(ymd.slice(0, 4), 10)
  const q = Math.floor((m - 1) / 3) + 1
  return `${y}-q${q}`
}

type InvoiceRow = {
  id: string
  invoice_number: string
  customer_name: string
  issue_date: string
  net_cents: number
  vat_cents: number
  gross_cents: number
}

type VoucherRow = {
  id: string
  title: string | null
  category: string | null
  expense_date: string
  net_cents: number
  vat_cents: number
  gross_cents: number
}

type VatInvSortKey = 'number' | 'customer' | 'date' | 'net' | 'vat' | 'gross'
type VatVouSortKey = 'title' | 'category' | 'date' | 'net' | 'vat' | 'gross'

function sortVatInvoices(list: InvoiceRow[], key: VatInvSortKey, dir: ColumnSortDir): InvoiceRow[] {
  const mul = dir === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    switch (key) {
      case 'number':
        return mul * String(a.invoice_number).localeCompare(String(b.invoice_number), undefined, { numeric: true })
      case 'customer':
        return mul * String(a.customer_name).localeCompare(String(b.customer_name), 'da', { sensitivity: 'base' })
      case 'date':
        return mul * String(a.issue_date).localeCompare(String(b.issue_date))
      case 'net':
        return mul * ((a.net_cents ?? 0) - (b.net_cents ?? 0))
      case 'vat':
        return mul * ((a.vat_cents ?? 0) - (b.vat_cents ?? 0))
      case 'gross':
        return mul * ((a.gross_cents ?? 0) - (b.gross_cents ?? 0))
      default:
        return 0
    }
  })
}

function sortVatVouchers(list: VoucherRow[], key: VatVouSortKey, dir: ColumnSortDir): VoucherRow[] {
  const mul = dir === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    switch (key) {
      case 'title':
        return mul * String(a.title ?? '').localeCompare(String(b.title ?? ''), 'da', { sensitivity: 'base' })
      case 'category':
        return mul * String(a.category ?? '').localeCompare(String(b.category ?? ''), 'da', { sensitivity: 'base' })
      case 'date':
        return mul * String(a.expense_date).localeCompare(String(b.expense_date))
      case 'net':
        return mul * ((a.net_cents ?? 0) - (b.net_cents ?? 0))
      case 'vat':
        return mul * ((a.vat_cents ?? 0) - (b.vat_cents ?? 0))
      case 'gross':
        return mul * ((a.gross_cents ?? 0) - (b.gross_cents ?? 0))
      default:
        return 0
    }
  })
}

export function VatPage() {
  const { currentCompany } = useApp()
  const year = copenhagenYear()
  /* Vigtigt: stabilt dependency-array — ikke `years` som nyt [] hver render (gav useEffect-loop og blink). */
  const periods = useMemo(() => {
    const years = [year - 1, year, year + 1]
    return years.flatMap((y) =>
      danishQuarters(y).map((p, i) => ({ key: `${y}-q${i + 1}`, ...p })),
    )
  }, [year])
  const [periodKey, setPeriodKey] = useState(currentQuarterKey())
  const period = periods.find((p) => p.key === periodKey) ?? periods[0]

  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [vouchers, setVouchers] = useState<VoucherRow[]>([])
  const [loading, setLoading] = useState(true)
  const [invSortKey, setInvSortKey] = useState<VatInvSortKey | null>(null)
  const [invSortDir, setInvSortDir] = useState<ColumnSortDir>('desc')
  const [vouSortKey, setVouSortKey] = useState<VatVouSortKey | null>(null)
  const [vouSortDir, setVouSortDir] = useState<ColumnSortDir>('desc')

  const sortedInvoices = useMemo(() => {
    if (invSortKey === null) return invoices
    return sortVatInvoices(invoices, invSortKey, invSortDir)
  }, [invoices, invSortKey, invSortDir])

  const sortedVouchers = useMemo(() => {
    if (vouSortKey === null) return vouchers
    return sortVatVouchers(vouchers, vouSortKey, vouSortDir)
  }, [vouchers, vouSortKey, vouSortDir])

  function onInvSort(col: VatInvSortKey) {
    const next = nextColumnSortState(col, invSortKey, invSortDir, true)
    setInvSortKey(next.key as VatInvSortKey | null)
    setInvSortDir(next.dir)
  }

  function onVouSort(col: VatVouSortKey) {
    const next = nextColumnSortState(col, vouSortKey, vouSortDir, true)
    setVouSortKey(next.key as VatVouSortKey | null)
    setVouSortDir(next.dir)
  }

  const load = useCallback(async () => {
    if (!currentCompany || !period) return
    setLoading(true)
    const [invRes, vouRes] = await Promise.all([
      supabase
        .from('invoices')
        .select('id, invoice_number, customer_name, issue_date, net_cents, vat_cents, gross_cents, status')
        .eq('company_id', currentCompany.id)
        .gte('issue_date', period.from)
        .lte('issue_date', period.to)
        .in('status', ['sent', 'paid']),
      supabase
        .from('vouchers')
        .select('id, title, category, expense_date, net_cents, vat_cents, gross_cents')
        .eq('company_id', currentCompany.id)
        .gte('expense_date', period.from)
        .lte('expense_date', period.to),
    ])
    setInvoices((invRes.data ?? []) as InvoiceRow[])
    setVouchers((vouRes.data ?? []) as VoucherRow[])
    setLoading(false)
  }, [currentCompany, period])

  useEffect(() => {
    void load()
  }, [load])

  const salgsmoms = invoices.reduce((s, r) => s + (r.vat_cents ?? 0), 0)
  const koebsmoms = vouchers.reduce((s, r) => s + (r.vat_cents ?? 0), 0)
  const salgsNet = invoices.reduce((s, r) => s + (r.net_cents ?? 0), 0)
  const koebsNet = vouchers.reduce((s, r) => s + (r.net_cents ?? 0), 0)
  const tilsvar = salgsmoms - koebsmoms

  function exportCsv() {
    if (!period) return
    const rows: string[] = []
    rows.push(`"Bilago momsrapport","${currentCompany?.name ?? ''}","${period.from} til ${period.to}"`)
    rows.push('')
    rows.push('"Salg (udgående fakturaer)"')
    rows.push('"Fakturanr","Kunde","Dato","Netto","Moms","Brutto"')
    for (const r of invoices) {
      rows.push(
        [r.invoice_number, r.customer_name, r.issue_date, r.net_cents / 100, r.vat_cents / 100, r.gross_cents / 100]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(','),
      )
    }
    rows.push(`"Total salgsmoms",,,${salgsNet / 100},${salgsmoms / 100},`)
    rows.push('')
    rows.push('"Køb (bilag)"')
    rows.push('"Titel","Kategori","Dato","Netto","Moms","Brutto"')
    for (const r of vouchers) {
      rows.push(
        [r.title ?? '', r.category ?? '', r.expense_date, r.net_cents / 100, r.vat_cents / 100, r.gross_cents / 100]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(','),
      )
    }
    rows.push(`"Total købsmoms",,,${koebsNet / 100},${koebsmoms / 100},`)
    rows.push('')
    rows.push(`"Momstilsvar (salgs - køb)",,,,${tilsvar / 100},`)

    const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `momsrapport-${period.from}-${period.to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!currentCompany) return <p className="text-slate-600">Vælg virksomhed.</p>

  return (
    <AppPageLayout maxWidth="6xl" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Moms</h1>
          <p className="text-sm text-slate-600">
            Beregn momsangivelse for en periode — klar til TastSelv Erhverv.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            value={periodKey}
            onChange={(e) => setPeriodKey(e.target.value)}
          >
            {periods.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
            onClick={exportCsv}
          >
            Eksporter CSV
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card label="Salgsmoms (udgående)" value={salgsmoms} subtle={`Netto ${formatDkk(salgsNet)}`} tone="emerald" />
        <Card label="Købsmoms (indgående)" value={koebsmoms} subtle={`Netto ${formatDkk(koebsNet)}`} tone="amber" />
        <Card
          label="Momstilsvar"
          value={tilsvar}
          subtle={tilsvar >= 0 ? 'Skal betales til SKAT' : 'Tilbagebetales af SKAT'}
          tone={tilsvar >= 0 ? 'indigo' : 'slate'}
        />
      </div>

      <Section
        title="Salg (udgående fakturaer)"
        empty="Ingen fakturaer i perioden."
        loading={loading}
      >
        {invoices.length > 0 ? (
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
              <tr>
                <SortableTh
                  label="Fakturanr"
                  isActive={invSortKey === 'number'}
                  direction={invSortKey === 'number' ? invSortDir : null}
                  onClick={() => onInvSort('number')}
                />
                <SortableTh
                  label="Kunde"
                  isActive={invSortKey === 'customer'}
                  direction={invSortKey === 'customer' ? invSortDir : null}
                  onClick={() => onInvSort('customer')}
                />
                <SortableTh
                  label="Dato"
                  isActive={invSortKey === 'date'}
                  direction={invSortKey === 'date' ? invSortDir : null}
                  onClick={() => onInvSort('date')}
                />
                <SortableTh
                  label="Netto"
                  isActive={invSortKey === 'net'}
                  direction={invSortKey === 'net' ? invSortDir : null}
                  onClick={() => onInvSort('net')}
                  align="right"
                />
                <SortableTh
                  label="Moms"
                  isActive={invSortKey === 'vat'}
                  direction={invSortKey === 'vat' ? invSortDir : null}
                  onClick={() => onInvSort('vat')}
                  align="right"
                />
                <SortableTh
                  label="Brutto"
                  isActive={invSortKey === 'gross'}
                  direction={invSortKey === 'gross' ? invSortDir : null}
                  onClick={() => onInvSort('gross')}
                  align="right"
                />
              </tr>
            </thead>
            <tbody>
              {sortedInvoices.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 text-slate-700">{r.invoice_number}</td>
                  <td className="px-4 py-3 text-slate-700">{r.customer_name}</td>
                  <td className="px-4 py-3 text-slate-700">{r.issue_date}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-800">{formatDkk(r.net_cents)}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-800">{formatDkk(r.vat_cents)}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-800">{formatDkk(r.gross_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </Section>

      <Section
        title="Køb (bilag)"
        empty="Ingen bilag i perioden."
        loading={loading}
      >
        {vouchers.length > 0 ? (
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
              <tr>
                <SortableTh
                  label="Titel"
                  isActive={vouSortKey === 'title'}
                  direction={vouSortKey === 'title' ? vouSortDir : null}
                  onClick={() => onVouSort('title')}
                />
                <SortableTh
                  label="Kategori"
                  isActive={vouSortKey === 'category'}
                  direction={vouSortKey === 'category' ? vouSortDir : null}
                  onClick={() => onVouSort('category')}
                />
                <SortableTh
                  label="Dato"
                  isActive={vouSortKey === 'date'}
                  direction={vouSortKey === 'date' ? vouSortDir : null}
                  onClick={() => onVouSort('date')}
                />
                <SortableTh
                  label="Netto"
                  isActive={vouSortKey === 'net'}
                  direction={vouSortKey === 'net' ? vouSortDir : null}
                  onClick={() => onVouSort('net')}
                  align="right"
                />
                <SortableTh
                  label="Moms"
                  isActive={vouSortKey === 'vat'}
                  direction={vouSortKey === 'vat' ? vouSortDir : null}
                  onClick={() => onVouSort('vat')}
                  align="right"
                />
                <SortableTh
                  label="Brutto"
                  isActive={vouSortKey === 'gross'}
                  direction={vouSortKey === 'gross' ? vouSortDir : null}
                  onClick={() => onVouSort('gross')}
                  align="right"
                />
              </tr>
            </thead>
            <tbody>
              {sortedVouchers.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 text-slate-700">{r.title ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-700">{r.category ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-700">{r.expense_date}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-800">{formatDkk(r.net_cents)}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-800">{formatDkk(r.vat_cents)}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-800">{formatDkk(r.gross_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </Section>

      <p className="text-xs text-slate-500">
        Tallene kan indtastes direkte i TastSelv Erhverv. Direkte indberetning kræver SKAT-certifikat og kommer senere.
      </p>
    </AppPageLayout>
  )
}

function Card({
  label,
  value,
  subtle,
  tone,
}: {
  label: string
  value: number
  subtle: string
  tone: 'emerald' | 'amber' | 'indigo' | 'slate'
}) {
  const toneMap = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    amber: 'bg-amber-50 text-amber-800 border-amber-100',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
  }
  return (
    <div className={`rounded-2xl border ${toneMap[tone]} p-5`}>
      <div className="text-xs font-semibold uppercase tracking-wide">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{formatDkk(value)}</div>
      <div className="mt-1 text-xs opacity-80">{subtle}</div>
    </div>
  )
}

function Section({
  title,
  empty,
  loading,
  children,
}: {
  title: string
  empty: string
  loading: boolean
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      </header>
      {loading ? (
        <p className="px-4 py-6 text-sm text-slate-500">Indlæser…</p>
      ) : children ? (
        children
      ) : (
        <p className="px-4 py-6 text-sm text-slate-500">{empty}</p>
      )}
    </section>
  )
}

