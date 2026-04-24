import { useCallback, useEffect, useMemo, useState } from 'react'
import { SortableTh } from '@/components/SortableTh'
import { nextColumnSortState, type ColumnSortDir } from '@/lib/tableSort'
import { useNavigate } from 'react-router-dom'
import { useApp } from '@/context/AppProvider'
import type { Database } from '@/types/database'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/format'
import { usePlatformAdminNotifications } from '@/hooks/usePlatformAdminNotifications'

type Company = Database['public']['Tables']['companies']['Row']

type CompanySortKey = 'name' | 'cvr' | 'created'

function sortCompanies(list: Company[], key: CompanySortKey, dir: ColumnSortDir): Company[] {
  const mul = dir === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    switch (key) {
      case 'name':
        return mul * String(a.name).localeCompare(String(b.name), 'da', { sensitivity: 'base' })
      case 'cvr':
        return mul * String(a.cvr ?? '').localeCompare(String(b.cvr ?? ''), undefined, { numeric: true })
      case 'created':
        return mul * String(a.created_at).localeCompare(String(b.created_at))
      default:
        return 0
    }
  })
}

export function PlatformCompaniesPage() {
  const navigate = useNavigate()
  const { refresh } = useApp()
  const { markSeen } = usePlatformAdminNotifications()
  const [rows, setRows] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<CompanySortKey | null>(null)
  const [sortDir, setSortDir] = useState<ColumnSortDir>('desc')

  const displayRows = useMemo(() => {
    if (sortKey === null) return rows
    return sortCompanies(rows, sortKey, sortDir)
  }, [rows, sortKey, sortDir])

  function onSortColumn(col: CompanySortKey) {
    const next = nextColumnSortState(col, sortKey, sortDir, true)
    setSortKey(next.key as CompanySortKey | null)
    setSortDir(next.dir)
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: qErr } = await supabase
      .from('companies')
      .select('*')
      .order('created_at', { ascending: false })
    setLoading(false)
    if (qErr) {
      setError(qErr.message)
      return
    }
    setRows(data ?? [])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void markSeen('companies')
    void markSeen('subscriptions')
  }, [markSeen])

  async function openAsCompany(companyId: string) {
    setBusyId(companyId)
    setError(null)
    const { error: rpcErr } = await supabase.rpc('begin_platform_impersonation', {
      p_company_id: companyId,
    })
    setBusyId(null)
    if (rpcErr) {
      setError(rpcErr.message)
      return
    }
    await refresh()
    navigate('/app/dashboard')
  }

  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Virksomheder</h1>
        <p className="mt-1 text-sm text-slate-600">
          Alle registrerede virksomheder. Åbn som virksomhed for support-adgang (impersonation).
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Indlæser…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">Ingen virksomheder endnu.</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <SortableTh
                  label="Navn"
                  isActive={sortKey === 'name'}
                  direction={sortKey === 'name' ? sortDir : null}
                  onClick={() => onSortColumn('name')}
                />
                <SortableTh
                  label="CVR"
                  isActive={sortKey === 'cvr'}
                  direction={sortKey === 'cvr' ? sortDir : null}
                  onClick={() => onSortColumn('cvr')}
                  className="hidden sm:table-cell"
                />
                <SortableTh
                  label="Oprettet"
                  isActive={sortKey === 'created'}
                  direction={sortKey === 'created' ? sortDir : null}
                  onClick={() => onSortColumn('created')}
                  className="hidden md:table-cell"
                />
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Handling
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayRows.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                  <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">
                    {c.cvr ?? '—'}
                  </td>
                  <td className="hidden px-4 py-3 text-slate-600 md:table-cell">
                    {formatDate(c.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      disabled={busyId === c.id}
                      onClick={() => void openAsCompany(c.id)}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {busyId === c.id ? 'Åbner…' : 'Åbn som virksomhed'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
