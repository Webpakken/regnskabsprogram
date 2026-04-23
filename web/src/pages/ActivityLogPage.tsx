import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { SortableTh } from '@/components/SortableTh'
import { nextColumnSortState, type ColumnSortDir } from '@/lib/tableSort'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppProvider'
import { activityDisplayTitle, activityLooksLikeCreditNote } from '@/lib/activityDisplay'
import { LoadingSpinner } from '@/components/LoadingIndicator'
import { activityEventHref } from '@/lib/activityNavigation'
import { AppCard, AppPageLayout } from '@/components/AppPageLayout'
import { formatDateTime } from '@/lib/format'
import type { Database } from '@/types/database'

type Activity = Database['public']['Tables']['activity_events']['Row']

const FETCH_LIMIT = 300

type ActivitySortKey = 'time' | 'title'

function sortActivities(list: Activity[], key: ActivitySortKey, dir: ColumnSortDir): Activity[] {
  const mul = dir === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    if (key === 'time') return mul * String(a.created_at).localeCompare(String(b.created_at))
    return (
      mul *
      activityDisplayTitle(a).localeCompare(activityDisplayTitle(b), 'da', { sensitivity: 'base' })
    )
  })
}

export function ActivityLogPage() {
  const { currentCompany } = useApp()
  const [rows, setRows] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<ActivitySortKey | null>(null)
  const [sortDir, setSortDir] = useState<ColumnSortDir>('desc')

  useEffect(() => {
    if (!currentCompany) {
      setLoading(false)
      return
    }
    let c = false
    void (async () => {
      const { data, error } = await supabase
        .from('activity_events')
        .select('*')
        .eq('company_id', currentCompany.id)
        .order('created_at', { ascending: false })
        .limit(FETCH_LIMIT)
      if (c) return
      if (error) {
        setRows([])
        setLoading(false)
        return
      }
      setRows(data ?? [])
      setLoading(false)
    })()
    return () => {
      c = true
    }
  }, [currentCompany])

  const sortedRows = useMemo(() => {
    if (sortKey === null) return rows
    return sortActivities(rows, sortKey, sortDir)
  }, [rows, sortKey, sortDir])

  function onSortColumn(col: ActivitySortKey) {
    const next = nextColumnSortState(col, sortKey, sortDir, true)
    setSortKey(next.key as ActivitySortKey | null)
    setSortDir(next.dir)
  }

  if (!currentCompany) return null

  return (
    <AppPageLayout maxWidth="3xl" className="space-y-6 pb-6">
      <div className="space-y-1">
        <Link
          to="/app/dashboard"
          className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
        >
          ← Tilbage til oversigt
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Aktivitetslog</h1>
        <p className="text-sm text-slate-600">
          Seneste {FETCH_LIMIT} hændelser for {currentCompany.name}
        </p>
      </div>

      <AppCard noPadding>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
            <tr>
              <SortableTh
                label="Tidspunkt"
                isActive={sortKey === 'time'}
                direction={sortKey === 'time' ? sortDir : null}
                onClick={() => onSortColumn('time')}
              />
              <SortableTh
                label="Hændelse"
                isActive={sortKey === 'title'}
                direction={sortKey === 'title' ? sortDir : null}
                onClick={() => onSortColumn('title')}
              />
              <th className="px-4 py-3 pr-5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 md:px-6">
                Åbn
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={3} className="px-4 py-12 text-center md:px-6">
                  <span className="sr-only">Indlæser</span>
                  <div className="flex justify-center">
                    <LoadingSpinner size="md" />
                  </div>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-slate-500 md:px-6">
                  Ingen aktivitet endnu.
                </td>
              </tr>
            ) : (
              sortedRows.map((a) => {
                const credit = activityLooksLikeCreditNote(a)
                const href = activityEventHref(a)
                const titleCls = credit ? 'text-rose-950' : 'text-slate-800'
                const rowBg = credit ? 'bg-rose-50/90' : ''
                const borderL = credit ? 'border-l-4 border-l-rose-600' : ''

                const titleBlock = (
                  <div className="flex min-w-0 items-start gap-2">
                    {credit ? (
                      <span
                        className="mt-0.5 shrink-0 rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                        title="Kreditnota"
                      >
                        Kredit
                      </span>
                    ) : null}
                    <span className={`min-w-0 text-sm font-semibold ${titleCls}`}>
                      {activityDisplayTitle(a)}
                    </span>
                  </div>
                )

                if (href) {
                  return (
                    <tr key={a.id} className={clsx('border-t border-slate-100', rowBg, borderL)}>
                      <td colSpan={3} className="p-0">
                        <Link
                          to={href}
                          aria-label={`${activityDisplayTitle(a)} — åbn`}
                          className={clsx(
                            'grid gap-2 px-4 py-3.5 transition md:grid-cols-[minmax(0,11rem)_1fr_auto] md:items-center md:gap-4 md:px-6',
                            credit
                              ? 'hover:bg-rose-100/70 active:bg-rose-100'
                              : 'hover:bg-indigo-50/50 active:bg-indigo-50',
                          )}
                        >
                          <span className={credit ? 'text-xs text-rose-800/90' : 'text-xs text-slate-500'}>
                            {formatDateTime(a.created_at)}
                          </span>
                          {titleBlock}
                          <span className="shrink-0 text-xs font-semibold text-indigo-600 md:text-right">
                            Vis →
                          </span>
                        </Link>
                      </td>
                    </tr>
                  )
                }

                return (
                  <tr key={a.id} className={clsx('border-t border-slate-100', rowBg, borderL)}>
                    <td className={clsx('whitespace-nowrap px-4 py-3 text-xs md:px-6', credit ? 'text-rose-800/90' : 'text-slate-500')}>
                      {formatDateTime(a.created_at)}
                    </td>
                    <td className="px-4 py-3 md:px-6">{titleBlock}</td>
                    <td className="px-4 py-3 md:px-6" />
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
        </div>
      </AppCard>
    </AppPageLayout>
  )
}
