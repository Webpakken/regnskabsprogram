import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppProvider'
import { formatDkk } from '@/lib/format'

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
  const now = new Date()
  const q = Math.floor(now.getUTCMonth() / 3)
  return `${now.getUTCFullYear()}-q${q + 1}`
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

export function VatPage() {
  const { currentCompany } = useApp()
  const year = new Date().getUTCFullYear()
  const years = [year - 1, year, year + 1]
  const periods = useMemo(
    () => years.flatMap((y) => danishQuarters(y).map((p, i) => ({ key: `${y}-q${i + 1}`, ...p }))),
    [years],
  )
  const [periodKey, setPeriodKey] = useState(currentQuarterKey())
  const period = periods.find((p) => p.key === periodKey) ?? periods[0]

  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [vouchers, setVouchers] = useState<VoucherRow[]>([])
  const [loading, setLoading] = useState(true)

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
    <div className="space-y-6">
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

      <Section title="Salg (udgående fakturaer)" empty="Ingen fakturaer i perioden.">
        {loading ? null : invoices.length === 0 ? null : (
          <Table
            headers={['Fakturanr', 'Kunde', 'Dato', 'Netto', 'Moms', 'Brutto']}
            rows={invoices.map((r) => [
              r.invoice_number,
              r.customer_name,
              r.issue_date,
              formatDkk(r.net_cents),
              formatDkk(r.vat_cents),
              formatDkk(r.gross_cents),
            ])}
            rightCols={[3, 4, 5]}
          />
        )}
      </Section>

      <Section title="Køb (bilag)" empty="Ingen bilag i perioden.">
        {loading ? null : vouchers.length === 0 ? null : (
          <Table
            headers={['Titel', 'Kategori', 'Dato', 'Netto', 'Moms', 'Brutto']}
            rows={vouchers.map((r) => [
              r.title ?? '—',
              r.category ?? '—',
              r.expense_date,
              formatDkk(r.net_cents),
              formatDkk(r.vat_cents),
              formatDkk(r.gross_cents),
            ])}
            rightCols={[3, 4, 5]}
          />
        )}
      </Section>

      <p className="text-xs text-slate-500">
        Tallene kan indtastes direkte i TastSelv Erhverv. Direkte indberetning kræver SKAT-certifikat og kommer senere.
      </p>
    </div>
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
  children,
}: {
  title: string
  empty: string
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      </header>
      {children ?? <p className="px-4 py-6 text-sm text-slate-500">{empty}</p>}
    </section>
  )
}

function Table({
  headers,
  rows,
  rightCols,
}: {
  headers: string[]
  rows: (string | number)[][]
  rightCols: number[]
}) {
  return (
    <table className="min-w-full text-left text-sm">
      <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
        <tr>
          {headers.map((h, i) => (
            <th key={h} className={`px-4 py-3 ${rightCols.includes(i) ? 'text-right' : ''}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, idx) => (
          <tr key={idx} className="border-t border-slate-100">
            {r.map((c, i) => (
              <td
                key={i}
                className={`px-4 py-3 ${rightCols.includes(i) ? 'text-right font-mono text-slate-800' : 'text-slate-700'}`}
              >
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
