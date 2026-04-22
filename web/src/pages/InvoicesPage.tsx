import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DesktopListCardsToggle } from '@/components/DesktopListCardsToggle'
import { useDesktopListViewPreference } from '@/hooks/useDesktopListViewPreference'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppProvider'
import { formatDate, formatDkk } from '@/lib/format'
import type { Database } from '@/types/database'

type Invoice = Database['public']['Tables']['invoices']['Row']

const statusDa: Record<Invoice['status'], string> = {
  draft: 'Kladde',
  sent: 'Sendt',
  paid: 'Betalt',
  cancelled: 'Annulleret',
}

const INVOICES_VIEW_KEY = 'bilago:invoicesDesktopView'

export function InvoicesPage() {
  const navigate = useNavigate()
  const { currentCompany } = useApp()
  const [rows, setRows] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [desktopView, setDesktopView] = useDesktopListViewPreference(INVOICES_VIEW_KEY, 'list')

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

  function openPdf(invId: string) {
    navigate(`/app/invoices/${invId}/pdf`)
  }

  return (
    <div className="space-y-6">
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
        ) : (
          rows.map((inv) => (
            <button
              key={inv.id}
              type="button"
              onClick={() => openPdf(inv.id)}
              className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono text-sm font-semibold text-indigo-700">
                  {inv.invoice_number}
                </span>
                <span className="shrink-0 text-sm font-semibold text-slate-900">
                  {formatDkk(inv.gross_cents, inv.currency)}
                </span>
              </div>
              <p className="line-clamp-2 text-sm font-medium text-slate-800">{inv.customer_name}</p>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="text-xs text-slate-600">{formatDate(inv.issue_date)}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                  {statusDa[inv.status]}
                </span>
              </div>
            </button>
          ))
        )}
      </div>

      <div
        className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${desktopView === 'list' ? 'hidden md:block' : 'hidden'}`}
      >
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Nr.</th>
              <th className="px-4 py-3">Kunde</th>
              <th className="px-4 py-3">Dato</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Beløb</th>
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
            ) : (
              rows.map((inv) => (
                <tr
                  key={inv.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openPdf(inv.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openPdf(inv.id)
                    }
                  }}
                  className="cursor-pointer border-t border-slate-100 transition hover:bg-indigo-50/50 focus-visible:bg-indigo-50/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-indigo-500"
                >
                  <td className="px-4 py-3 font-mono text-indigo-700">
                    {inv.invoice_number}
                  </td>
                  <td className="px-4 py-3 text-slate-800">{inv.customer_name}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatDate(inv.issue_date)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                      {statusDa[inv.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-900">
                    {formatDkk(inv.gross_cents, inv.currency)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
