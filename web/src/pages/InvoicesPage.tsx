import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AppPageLayout } from '@/components/AppPageLayout'
import { SortableTh } from '@/components/SortableTh'
import { nextColumnSortState, type ColumnSortDir } from '@/lib/tableSort'
import { DesktopListCardsToggle } from '@/components/DesktopListCardsToggle'
import { useDesktopListViewPreference } from '@/hooks/useDesktopListViewPreference'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppProvider'
import { formatDate, formatDkk } from '@/lib/format'
import type { Database } from '@/types/database'

type Invoice = Database['public']['Tables']['invoices']['Row']

function isCreditNote(inv: Invoice) {
  return inv.credited_invoice_id != null || inv.gross_cents < 0
}

/** Kreditnotaer ligger lige under den faktura de peger på (`credited_invoice_id`). */
function orderInvoicesForDisplay(list: Invoice[]): Invoice[] {
  if (list.length === 0) return list
  const creditsByParent = new Map<string, Invoice[]>()
  for (const inv of list) {
    const pid = inv.credited_invoice_id
    if (!pid) continue
    const arr = creditsByParent.get(pid) ?? []
    arr.push(inv)
    creditsByParent.set(pid, arr)
  }
  const sortDesc = (a: Invoice, b: Invoice) => {
    const d = String(b.issue_date).localeCompare(String(a.issue_date))
    if (d !== 0) return d
    return String(b.invoice_number).localeCompare(String(a.invoice_number), undefined, {
      numeric: true,
    })
  }
  const roots = list.filter((i) => !i.credited_invoice_id)
  roots.sort(sortDesc)
  const out: Invoice[] = []
  const emitted = new Set<string>()
  for (const root of roots) {
    out.push(root)
    const kids = (creditsByParent.get(root.id) ?? []).sort(sortDesc)
    for (const k of kids) {
      out.push(k)
      emitted.add(k.id)
    }
  }
  const orphans = list.filter((i) => i.credited_invoice_id && !emitted.has(i.id))
  orphans.sort(sortDesc)
  out.push(...orphans)
  return out
}

const statusDa: Record<Invoice['status'], string> = {
  draft: 'Kladde',
  sent: 'Sendt',
  paid: 'Betalt',
  cancelled: 'Annulleret',
}

const INVOICES_VIEW_KEY = 'bilago:invoicesDesktopView'

type InvoiceSortKey = 'number' | 'customer' | 'date' | 'status' | 'amount'

function sortInvoicesFlat(list: Invoice[], key: InvoiceSortKey, dir: ColumnSortDir): Invoice[] {
  const mul = dir === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    switch (key) {
      case 'number':
        return (
          mul *
          String(a.invoice_number).localeCompare(String(b.invoice_number), undefined, {
            numeric: true,
          })
        )
      case 'customer':
        return (
          mul *
          String(a.customer_name).localeCompare(String(b.customer_name), 'da', {
            sensitivity: 'base',
          })
        )
      case 'date':
        return mul * String(a.issue_date).localeCompare(String(b.issue_date))
      case 'status':
        return mul * String(a.status).localeCompare(String(b.status))
      case 'amount':
        return mul * (a.gross_cents - b.gross_cents)
      default:
        return 0
    }
  })
}

export function InvoicesPage() {
  const navigate = useNavigate()
  const { currentCompany } = useApp()
  const [rows, setRows] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [desktopView, setDesktopView] = useDesktopListViewPreference(INVOICES_VIEW_KEY, 'list')
  const [sortKey, setSortKey] = useState<InvoiceSortKey | null>(null)
  const [sortDir, setSortDir] = useState<ColumnSortDir>('desc')

  const searchMatched = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const tokens = q.split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return rows
    return rows.filter((inv) => {
      const hay = [
        inv.invoice_number,
        inv.customer_name,
        inv.customer_email ?? '',
        statusDa[inv.status],
        inv.issue_date,
        inv.notes ?? '',
        formatDkk(inv.gross_cents, inv.currency),
      ]
        .join(' ')
        .toLowerCase()
      return tokens.every((t) => hay.includes(t))
    })
  }, [rows, searchQuery])

  const filteredRows = useMemo(() => {
    if (sortKey === null) return orderInvoicesForDisplay(searchMatched)
    return sortInvoicesFlat(searchMatched, sortKey, sortDir)
  }, [searchMatched, sortKey, sortDir])

  function onSortColumn(col: InvoiceSortKey) {
    const next = nextColumnSortState(col, sortKey, sortDir, true)
    setSortKey(next.key as InvoiceSortKey | null)
    setSortDir(next.dir)
  }

  useEffect(() => {
    if (!currentCompany) return
    let c = false
    ;(async () => {
      const { data } = await supabase
        .from('invoices')
        .select('*')
        .eq('company_id', currentCompany.id)
        .order('issue_date', { ascending: false })
      if (!c) {
        setRows(data ?? [])
        setLoading(false)
      }
    })()
    return () => {
      c = true
    }
  }, [currentCompany])

  if (!currentCompany) return null

  function openInvoice(invId: string) {
    navigate(`/app/invoices/${invId}`)
  }

  return (
    <AppPageLayout maxWidth="6xl" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Fakturaer</h1>
          <p className="text-sm text-slate-600">Opret, send og følg betaling</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
          <DesktopListCardsToggle mode={desktopView} onChange={setDesktopView} />
          <Link
            to="/app/invoices/new"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Ny faktura
          </Link>
        </div>
      </div>

      <label className="block">
        <span className="sr-only">Søg i fakturaer</span>
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Søg efter nr., kunde, e-mail, status, beløb …"
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          autoComplete="off"
        />
      </label>

      <div
        className={`grid grid-cols-1 gap-3 ${desktopView === 'list' ? 'md:hidden' : 'md:grid-cols-2 lg:grid-cols-3'}`}
      >
        {loading ? (
          <p className="col-span-full rounded-2xl border border-slate-200 bg-white py-10 text-center text-sm text-slate-500 shadow-sm">
            Indlæser…
          </p>
        ) : rows.length === 0 ? (
          <p className="col-span-full rounded-2xl border border-slate-200 bg-white py-10 text-center text-sm text-slate-500 shadow-sm">
            Ingen fakturaer endnu.
          </p>
        ) : filteredRows.length === 0 ? (
          <p className="col-span-full rounded-2xl border border-slate-200 bg-white py-10 text-center text-sm text-slate-500 shadow-sm">
            Ingen fakturaer matcher søgningen.
          </p>
        ) : (
          filteredRows.map((inv) => {
            const credit = isCreditNote(inv)
            return (
              <button
                key={inv.id}
                type="button"
                onClick={() => openInvoice(inv.id)}
                className={
                  credit
                    ? 'flex flex-col gap-2 rounded-2xl border border-rose-200 border-l-[3px] border-l-rose-500 bg-rose-50/50 p-4 pl-3.5 text-left shadow-sm transition hover:border-rose-300 hover:bg-rose-50/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500'
                    : 'flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500'
                }
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={`font-mono text-sm font-semibold ${credit ? 'text-rose-800' : 'text-indigo-700'}`}
                  >
                    {inv.invoice_number}
                  </span>
                  <span
                    className={`shrink-0 text-sm font-semibold ${credit ? 'text-rose-800' : 'text-slate-900'}`}
                  >
                    {formatDkk(inv.gross_cents, inv.currency)}
                  </span>
                </div>
                <p
                  className={`line-clamp-2 text-sm font-medium ${credit ? 'text-rose-900/90' : 'text-slate-800'}`}
                >
                  {inv.customer_name}
                </p>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
                  <span className={`text-xs ${credit ? 'text-rose-700/80' : 'text-slate-600'}`}>
                    {formatDate(inv.issue_date)}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      credit ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {statusDa[inv.status]}
                  </span>
                </div>
              </button>
            )
          })
        )}
      </div>

      <div
        className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${desktopView === 'list' ? 'hidden md:block' : 'hidden'}`}
      >
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
            <tr>
              <SortableTh
                label="Nr."
                isActive={sortKey === 'number'}
                direction={sortKey === 'number' ? sortDir : null}
                onClick={() => onSortColumn('number')}
              />
              <SortableTh
                label="Kunde"
                isActive={sortKey === 'customer'}
                direction={sortKey === 'customer' ? sortDir : null}
                onClick={() => onSortColumn('customer')}
              />
              <SortableTh
                label="Dato"
                isActive={sortKey === 'date'}
                direction={sortKey === 'date' ? sortDir : null}
                onClick={() => onSortColumn('date')}
              />
              <SortableTh
                label="Status"
                isActive={sortKey === 'status'}
                direction={sortKey === 'status' ? sortDir : null}
                onClick={() => onSortColumn('status')}
              />
              <SortableTh
                label="Beløb"
                isActive={sortKey === 'amount'}
                direction={sortKey === 'amount' ? sortDir : null}
                onClick={() => onSortColumn('amount')}
                align="right"
              />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  Indlæser…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  Ingen fakturaer endnu.
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  Ingen fakturaer matcher søgningen.
                </td>
              </tr>
            ) : (
              filteredRows.map((inv) => {
                const credit = isCreditNote(inv)
                return (
                  <tr
                    key={inv.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openInvoice(inv.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        openInvoice(inv.id)
                      }
                    }}
                    className={
                      credit
                        ? 'cursor-pointer border-t border-rose-100 bg-rose-50/40 transition hover:bg-rose-50/70 focus-visible:bg-rose-50/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-rose-500'
                        : 'cursor-pointer border-t border-slate-100 transition hover:bg-indigo-50/50 focus-visible:bg-indigo-50/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-indigo-500'
                    }
                  >
                    <td
                      className={`border-l-[3px] border-l-rose-500 py-3 pl-3 pr-4 font-mono ${credit ? 'text-rose-800' : 'border-l-transparent text-indigo-700'}`}
                    >
                      {inv.invoice_number}
                    </td>
                    <td className={`px-4 py-3 ${credit ? 'text-rose-900/90' : 'text-slate-800'}`}>
                      {inv.customer_name}
                    </td>
                    <td className={`px-4 py-3 ${credit ? 'text-rose-800/80' : 'text-slate-600'}`}>
                      {formatDate(inv.issue_date)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          credit ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {statusDa[inv.status]}
                      </span>
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-medium ${credit ? 'text-rose-800' : 'text-slate-900'}`}
                    >
                      {formatDkk(inv.gross_cents, inv.currency)}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </AppPageLayout>
  )
}
