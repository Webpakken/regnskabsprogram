import { useEffect, useMemo, useState } from 'react'
import { AppPageLayout } from '@/components/AppPageLayout'
import { SortableTh } from '@/components/SortableTh'
import { nextColumnSortState, type ColumnSortDir } from '@/lib/tableSort'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppProvider'
import { formatDateTime } from '@/lib/format'
import type { Database } from '@/types/database'

type Conn = Database['public']['Tables']['bank_connections']['Row']

const statusDa: Record<Conn['status'], string> = {
  pending: 'Afventer',
  connected: 'Forbundet',
  error: 'Fejl',
  disconnected: 'Afbrudt',
}

type BankSortKey = 'provider' | 'institution' | 'status' | 'created'

function sortConnections(list: Conn[], key: BankSortKey, dir: ColumnSortDir): Conn[] {
  const mul = dir === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    switch (key) {
      case 'provider':
        return mul * String(a.provider).localeCompare(String(b.provider), 'da', { sensitivity: 'base' })
      case 'institution':
        return mul * String(a.institution_name ?? '').localeCompare(String(b.institution_name ?? ''), 'da', {
          sensitivity: 'base',
        })
      case 'status':
        return mul * String(a.status).localeCompare(String(b.status))
      case 'created':
        return mul * String(a.created_at).localeCompare(String(b.created_at))
      default:
        return 0
    }
  })
}

/** Aiia-integration er udskudt — siden viser evt. eksisterende rækker fra senere test. */
export function BankPage() {
  const { currentCompany } = useApp()
  const [rows, setRows] = useState<Conn[]>([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<BankSortKey | null>(null)
  const [sortDir, setSortDir] = useState<ColumnSortDir>('desc')

  const displayRows = useMemo(() => {
    if (sortKey === null) return rows
    return sortConnections(rows, sortKey, sortDir)
  }, [rows, sortKey, sortDir])

  function onSortColumn(col: BankSortKey) {
    const next = nextColumnSortState(col, sortKey, sortDir, true)
    setSortKey(next.key as BankSortKey | null)
    setSortDir(next.dir)
  }

  useEffect(() => {
    if (!currentCompany) return
    let c = false
    ;(async () => {
      const { data } = await supabase
        .from('bank_connections')
        .select('*')
        .eq('company_id', currentCompany.id)
        .order('created_at', { ascending: false })
      if (!c) {
        setRows(data ?? [])
        setLoading(false)
      }
    })()
    return () => {
      c = true
    }
  }, [currentCompany])

  if (!currentCompany) {
    return <p className="text-slate-600">Vælg virksomhed.</p>
  }

  return (
    <AppPageLayout maxWidth="6xl" className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Bank</h1>
        <p className="text-sm text-slate-600">
          Bankforbindelse (open banking) tilføjes senere — ikke en del af første release.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-700">
        <p className="font-medium text-slate-900">Kommer senere</p>
        <p className="mt-1">
          Vi fokuserer nu på abonnement, fakturaer og bilag. Når I er klar til Aiia (eller
          anden udbyder), tilsluttes den via Edge Functions uden at ændre jeres
          multi-tenant datamodel.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
            <tr>
              <SortableTh
                label="Udbyder"
                isActive={sortKey === 'provider'}
                direction={sortKey === 'provider' ? sortDir : null}
                onClick={() => onSortColumn('provider')}
              />
              <SortableTh
                label="Institution"
                isActive={sortKey === 'institution'}
                direction={sortKey === 'institution' ? sortDir : null}
                onClick={() => onSortColumn('institution')}
              />
              <SortableTh
                label="Status"
                isActive={sortKey === 'status'}
                direction={sortKey === 'status' ? sortDir : null}
                onClick={() => onSortColumn('status')}
              />
              <SortableTh
                label="Oprettet"
                isActive={sortKey === 'created'}
                direction={sortKey === 'created' ? sortDir : null}
                onClick={() => onSortColumn('created')}
              />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  Indlæser…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  Ingen bankforbindelser endnu.
                </td>
              </tr>
            ) : (
              displayRows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 capitalize text-slate-800">{r.provider}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {r.institution_name ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                      {statusDa[r.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatDateTime(r.created_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AppPageLayout>
  )
}
