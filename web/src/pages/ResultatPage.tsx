import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppPageLayout } from '@/components/AppPageLayout'
import { useApp } from '@/context/AppProvider'
import { supabase } from '@/lib/supabase'
import { copenhagenYmd, copenhagenYear, formatDkk, formatDateOnly } from '@/lib/format'

type InvoiceRow = {
  id: string
  invoice_number: string
  customer_name: string
  issue_date: string
  net_cents: number
  vat_cents: number
  gross_cents: number
  status: 'draft' | 'sent' | 'paid' | 'cancelled'
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

type PeriodPreset = 'this_month' | 'last_month' | 'q1' | 'q2' | 'q3' | 'q4' | 'ytd' | 'last_year' | 'custom'

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

function presetRange(preset: PeriodPreset, year: number, todayYmd: string): { from: string; to: string } {
  const ym = todayYmd.slice(0, 7)
  switch (preset) {
    case 'this_month': {
      const m = parseInt(ym.slice(5, 7), 10)
      const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate()
      return { from: `${ym}-01`, to: `${ym}-${String(lastDay).padStart(2, '0')}` }
    }
    case 'last_month': {
      const dt = new Date(`${ym}-01T00:00:00Z`)
      dt.setUTCMonth(dt.getUTCMonth() - 1)
      const ly = dt.getUTCFullYear()
      const lm = dt.getUTCMonth() + 1
      const lastDay = new Date(Date.UTC(ly, lm, 0)).getUTCDate()
      return {
        from: `${ly}-${String(lm).padStart(2, '0')}-01`,
        to: `${ly}-${String(lm).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
      }
    }
    case 'q1':
      return { from: `${year}-01-01`, to: `${year}-03-31` }
    case 'q2':
      return { from: `${year}-04-01`, to: `${year}-06-30` }
    case 'q3':
      return { from: `${year}-07-01`, to: `${year}-09-30` }
    case 'q4':
      return { from: `${year}-10-01`, to: `${year}-12-31` }
    case 'ytd':
      return { from: `${year}-01-01`, to: todayYmd }
    case 'last_year':
      return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` }
    case 'custom':
    default:
      return { from: `${year}-01-01`, to: todayYmd }
  }
}

function presetLabel(preset: PeriodPreset, year: number): string {
  switch (preset) {
    case 'this_month':
      return 'Denne måned'
    case 'last_month':
      return 'Sidste måned'
    case 'q1':
      return `${year} · Q1`
    case 'q2':
      return `${year} · Q2`
    case 'q3':
      return `${year} · Q3`
    case 'q4':
      return `${year} · Q4`
    case 'ytd':
      return `År til dato (${year})`
    case 'last_year':
      return `Sidste år (${year - 1})`
    case 'custom':
      return 'Tilpas'
  }
}

export function ResultatPage() {
  const { currentCompany, currentRole, refresh } = useApp()
  const today = copenhagenYmd()
  const year = copenhagenYear()
  const canManageLock =
    currentRole === 'owner' || currentRole === 'manager' || currentRole === 'accountant'
  const [lockBusy, setLockBusy] = useState(false)
  const [lockMsg, setLockMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const lockedUntil = currentCompany?.accounting_locked_until ?? null

  const [preset, setPreset] = useState<PeriodPreset>('ytd')
  const [customRange, setCustomRange] = useState<{ from: string; to: string }>({
    from: `${year}-01-01`,
    to: today,
  })

  const range = useMemo(() => {
    if (preset === 'custom') {
      const ok = YMD_RE.test(customRange.from) && YMD_RE.test(customRange.to) && customRange.from <= customRange.to
      if (ok) return customRange
      return presetRange('ytd', year, today)
    }
    return presetRange(preset, year, today)
  }, [preset, customRange, year, today])

  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [vouchers, setVouchers] = useState<VoucherRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!currentCompany) return
    setLoading(true)
    const [invRes, vouRes] = await Promise.all([
      supabase
        .from('invoices')
        .select('id, invoice_number, customer_name, issue_date, net_cents, vat_cents, gross_cents, status')
        .eq('company_id', currentCompany.id)
        .gte('issue_date', range.from)
        .lte('issue_date', range.to)
        .in('status', ['sent', 'paid']),
      supabase
        .from('vouchers')
        .select('id, title, category, expense_date, net_cents, vat_cents, gross_cents')
        .eq('company_id', currentCompany.id)
        .gte('expense_date', range.from)
        .lte('expense_date', range.to),
    ])
    setInvoices((invRes.data ?? []) as InvoiceRow[])
    setVouchers((vouRes.data ?? []) as VoucherRow[])
    setLoading(false)
  }, [currentCompany, range.from, range.to])

  useEffect(() => {
    void load()
  }, [load])

  // Indtægter: positive fakturaer minus kreditnotaer (negative gross_cents).
  // Vi viser brutto, moms og netto separat så brugeren kan se hvad der ender på resultatet.
  const incomePositive = useMemo(
    () => invoices.filter((i) => i.gross_cents >= 0).reduce(
      (acc, r) => ({
        net: acc.net + (r.net_cents ?? 0),
        vat: acc.vat + (r.vat_cents ?? 0),
        gross: acc.gross + (r.gross_cents ?? 0),
        count: acc.count + 1,
      }),
      { net: 0, vat: 0, gross: 0, count: 0 },
    ),
    [invoices],
  )

  const incomeCredit = useMemo(
    () => invoices.filter((i) => i.gross_cents < 0).reduce(
      (acc, r) => ({
        net: acc.net + (r.net_cents ?? 0),
        vat: acc.vat + (r.vat_cents ?? 0),
        gross: acc.gross + (r.gross_cents ?? 0),
        count: acc.count + 1,
      }),
      { net: 0, vat: 0, gross: 0, count: 0 },
    ),
    [invoices],
  )

  const incomeNet = incomePositive.net + incomeCredit.net
  const incomeVat = incomePositive.vat + incomeCredit.vat
  const incomeGross = incomePositive.gross + incomeCredit.gross

  // Udgifter pr. kategori — sum af net_cents (resultatet bygger på netto, momsen
  // afregnes separat på moms-rapporten).
  const expenseByCategory = useMemo(() => {
    const map = new Map<string, { net: number; vat: number; gross: number; count: number }>()
    for (const v of vouchers) {
      const key = v.category?.trim() || 'Uden kategori'
      const cur = map.get(key) ?? { net: 0, vat: 0, gross: 0, count: 0 }
      cur.net += v.net_cents ?? 0
      cur.vat += v.vat_cents ?? 0
      cur.gross += v.gross_cents ?? 0
      cur.count += 1
      map.set(key, cur)
    }
    return Array.from(map.entries())
      .map(([category, t]) => ({ category, ...t }))
      .sort((a, b) => b.net - a.net)
  }, [vouchers])

  const expenseTotal = useMemo(
    () =>
      expenseByCategory.reduce(
        (acc, r) => ({
          net: acc.net + r.net,
          vat: acc.vat + r.vat,
          gross: acc.gross + r.gross,
          count: acc.count + r.count,
        }),
        { net: 0, vat: 0, gross: 0, count: 0 },
      ),
    [expenseByCategory],
  )

  // Resultat før skat = netto-indtægter minus netto-udgifter. Moms er ikke en del
  // af resultatet — det er en pengestrøm til/fra SKAT.
  const resultatNet = incomeNet - expenseTotal.net
  const resultatGross = incomeGross - expenseTotal.gross

  async function lockPeriod(date: string) {
    if (!currentCompany) return
    if (
      !window.confirm(
        `Lås regnskab til og med ${date}?\n\nIngen kan ændre, oprette eller slette fakturaer, bilag eller indtægter med dato på eller før ${date}, før perioden låses op igen.`,
      )
    )
      return
    setLockBusy(true)
    setLockMsg(null)
    const { error } = await supabase
      .from('companies')
      .update({ accounting_locked_until: date })
      .eq('id', currentCompany.id)
    setLockBusy(false)
    if (error) {
      setLockMsg({ kind: 'err', text: error.message })
      return
    }
    setLockMsg({ kind: 'ok', text: `Regnskabet er låst til og med ${formatDateOnly(date)}.` })
    await refresh()
  }

  async function unlockPeriod() {
    if (!currentCompany) return
    if (
      !window.confirm(
        'Lås regnskabet op?\n\nDet vil igen være muligt at oprette, ændre og slette poster i den tidligere låste periode. Husk at låse igen når du er færdig.',
      )
    )
      return
    setLockBusy(true)
    setLockMsg(null)
    const { error } = await supabase
      .from('companies')
      .update({ accounting_locked_until: null })
      .eq('id', currentCompany.id)
    setLockBusy(false)
    if (error) {
      setLockMsg({ kind: 'err', text: error.message })
      return
    }
    setLockMsg({ kind: 'ok', text: 'Regnskabet er låst op.' })
    await refresh()
  }

  function exportCsv() {
    const rows: string[] = []
    rows.push(
      `"Bilago resultatopgørelse","${currentCompany?.name ?? ''}","${range.from} til ${range.to}"`,
    )
    rows.push('')
    rows.push('"INDTÆGTER"')
    rows.push('"Type","Antal","Netto","Moms","Brutto"')
    rows.push(
      [
        '"Fakturaer"',
        incomePositive.count,
        (incomePositive.net / 100).toFixed(2),
        (incomePositive.vat / 100).toFixed(2),
        (incomePositive.gross / 100).toFixed(2),
      ].join(','),
    )
    rows.push(
      [
        '"Kreditnotaer"',
        incomeCredit.count,
        (incomeCredit.net / 100).toFixed(2),
        (incomeCredit.vat / 100).toFixed(2),
        (incomeCredit.gross / 100).toFixed(2),
      ].join(','),
    )
    rows.push(
      [
        '"Indtægter i alt"',
        incomePositive.count + incomeCredit.count,
        (incomeNet / 100).toFixed(2),
        (incomeVat / 100).toFixed(2),
        (incomeGross / 100).toFixed(2),
      ].join(','),
    )
    rows.push('')
    rows.push('"UDGIFTER"')
    rows.push('"Kategori","Antal","Netto","Moms","Brutto"')
    for (const c of expenseByCategory) {
      rows.push(
        [
          `"${c.category.replace(/"/g, '""')}"`,
          c.count,
          (c.net / 100).toFixed(2),
          (c.vat / 100).toFixed(2),
          (c.gross / 100).toFixed(2),
        ].join(','),
      )
    }
    rows.push(
      [
        '"Udgifter i alt"',
        expenseTotal.count,
        (expenseTotal.net / 100).toFixed(2),
        (expenseTotal.vat / 100).toFixed(2),
        (expenseTotal.gross / 100).toFixed(2),
      ].join(','),
    )
    rows.push('')
    rows.push(`"RESULTAT FØR SKAT (netto)",,${(resultatNet / 100).toFixed(2)},,`)
    rows.push(`"Brutto-resultat (incl. moms)",,${(resultatGross / 100).toFixed(2)},,`)

    const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `resultat-${range.from}-${range.to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!currentCompany) return <p className="text-slate-600">Vælg virksomhed.</p>

  const presetOptions: PeriodPreset[] = [
    'this_month',
    'last_month',
    'q1',
    'q2',
    'q3',
    'q4',
    'ytd',
    'last_year',
    'custom',
  ]

  return (
    <AppPageLayout maxWidth="full" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Resultat</h1>
          <p className="text-sm text-slate-600">
            Indtægter minus udgifter — klar at sende til revisor ved årsskifte.
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={loading}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
        >
          Eksportér CSV
        </button>
      </div>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {presetOptions.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPreset(p)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                preset === p
                  ? 'bg-indigo-600 text-white'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {presetLabel(p, year)}
            </button>
          ))}
        </div>
        {preset === 'custom' ? (
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              Fra
              <input
                type="date"
                value={customRange.from}
                onChange={(e) => setCustomRange((p) => ({ ...p, from: e.target.value }))}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              Til
              <input
                type="date"
                value={customRange.to}
                onChange={(e) => setCustomRange((p) => ({ ...p, to: e.target.value }))}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
              />
            </label>
          </div>
        ) : null}
        <p className="text-xs text-slate-500">
          Periode: {formatDateOnly(range.from)} – {formatDateOnly(range.to)}
        </p>
      </section>

      <section
        className={`flex flex-wrap items-start justify-between gap-4 rounded-2xl border p-4 shadow-sm ${
          lockedUntil
            ? 'border-amber-200 bg-amber-50/60'
            : 'border-slate-200 bg-white'
        }`}
      >
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Periodelås
          </p>
          {lockedUntil ? (
            <p className="mt-1 text-sm text-slate-900">
              Regnskabet er låst til og med <strong>{formatDateOnly(lockedUntil)}</strong>. Ingen kan
              ændre fakturaer, bilag eller indtægter på/før denne dato, før der låses op.
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-700">
              Ingen perioder er låst — alle bilag og fakturaer kan ændres. Lås når regnskabet er
              afsluttet for at sikre revisorens arbejde.
            </p>
          )}
          {lockMsg ? (
            <p
              className={`mt-2 text-xs ${
                lockMsg.kind === 'ok' ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {lockMsg.text}
            </p>
          ) : null}
        </div>
        {canManageLock ? (
          <div className="flex flex-wrap gap-2">
            {lockedUntil ? (
              <button
                type="button"
                disabled={lockBusy}
                onClick={() => void unlockPeriod()}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                {lockBusy ? 'Arbejder…' : 'Lås op'}
              </button>
            ) : null}
            <button
              type="button"
              disabled={lockBusy}
              onClick={() => void lockPeriod(range.to)}
              className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 disabled:opacity-60"
            >
              {lockBusy
                ? 'Låser…'
                : lockedUntil
                  ? `Forlæng lås til ${formatDateOnly(range.to)}`
                  : `Lås til og med ${formatDateOnly(range.to)}`}
            </button>
          </div>
        ) : (
          <p className="text-xs text-slate-500">Kun ejer, manager eller revisor kan låse perioder.</p>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Indtægter (netto)</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{formatDkk(incomeNet)}</p>
          <p className="mt-1 text-xs text-slate-600">
            {incomePositive.count} fakturaer{incomeCredit.count > 0 ? ` · ${incomeCredit.count} kreditnotaer` : ''}
          </p>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Udgifter (netto)</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{formatDkk(expenseTotal.net)}</p>
          <p className="mt-1 text-xs text-slate-600">{expenseTotal.count} bilag</p>
        </div>
        <div
          className={`rounded-2xl border p-5 shadow-sm ${
            resultatNet >= 0
              ? 'border-indigo-200 bg-indigo-50/50'
              : 'border-amber-200 bg-amber-50/50'
          }`}
        >
          <p
            className={`text-xs font-semibold uppercase tracking-wide ${
              resultatNet >= 0 ? 'text-indigo-700' : 'text-amber-700'
            }`}
          >
            Resultat før skat
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{formatDkk(resultatNet)}</p>
          <p className="mt-1 text-xs text-slate-600">Indtægter − udgifter (eksl. moms)</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Indtægter</h2>
        </div>
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2 text-right">Antal</th>
              <th className="px-4 py-2 text-right">Netto</th>
              <th className="px-4 py-2 text-right">Moms</th>
              <th className="px-4 py-2 text-right">Brutto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr>
              <td className="px-4 py-2 text-slate-700">Fakturaer</td>
              <td className="px-4 py-2 text-right text-slate-700">{incomePositive.count}</td>
              <td className="px-4 py-2 text-right tabular-nums text-slate-900">{formatDkk(incomePositive.net)}</td>
              <td className="px-4 py-2 text-right tabular-nums text-slate-700">{formatDkk(incomePositive.vat)}</td>
              <td className="px-4 py-2 text-right tabular-nums text-slate-900">{formatDkk(incomePositive.gross)}</td>
            </tr>
            {incomeCredit.count > 0 ? (
              <tr>
                <td className="px-4 py-2 text-slate-700">Kreditnotaer</td>
                <td className="px-4 py-2 text-right text-slate-700">{incomeCredit.count}</td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-900">{formatDkk(incomeCredit.net)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-700">{formatDkk(incomeCredit.vat)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-900">{formatDkk(incomeCredit.gross)}</td>
              </tr>
            ) : null}
          </tbody>
          <tfoot className="bg-slate-50 text-sm font-semibold">
            <tr>
              <td className="px-4 py-2">I alt</td>
              <td className="px-4 py-2 text-right">{incomePositive.count + incomeCredit.count}</td>
              <td className="px-4 py-2 text-right tabular-nums">{formatDkk(incomeNet)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{formatDkk(incomeVat)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{formatDkk(incomeGross)}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Udgifter pr. kategori</h2>
        </div>
        {expenseByCategory.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">Ingen bilag i perioden.</p>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Kategori</th>
                <th className="px-4 py-2 text-right">Antal</th>
                <th className="px-4 py-2 text-right">Netto</th>
                <th className="px-4 py-2 text-right">Moms</th>
                <th className="px-4 py-2 text-right">Brutto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {expenseByCategory.map((c) => (
                <tr key={c.category}>
                  <td className="px-4 py-2 text-slate-700">{c.category}</td>
                  <td className="px-4 py-2 text-right text-slate-700">{c.count}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-900">{formatDkk(c.net)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-700">{formatDkk(c.vat)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-900">{formatDkk(c.gross)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 text-sm font-semibold">
              <tr>
                <td className="px-4 py-2">I alt</td>
                <td className="px-4 py-2 text-right">{expenseTotal.count}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatDkk(expenseTotal.net)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatDkk(expenseTotal.vat)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatDkk(expenseTotal.gross)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </section>
    </AppPageLayout>
  )
}
