import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppProvider'
import { activityDisplayTitle, activityLooksLikeCreditNote } from '@/lib/activityDisplay'
import { formatDateTime } from '@/lib/format'
import type { Database } from '@/types/database'

type Activity = Database['public']['Tables']['activity_events']['Row']

const FETCH_LIMIT = 300

export function ActivityLogPage() {
  const { currentCompany } = useApp()
  const [rows, setRows] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)

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

  if (!currentCompany) return null

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          to="/app/dashboard"
          className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
        >
          ← Tilbage til oversigt
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">Aktivitetslog</h1>
        <p className="mt-1 text-sm text-slate-600">
          Seneste {FETCH_LIMIT} hændelser for {currentCompany.name}
        </p>
      </div>

      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <li className="px-4 py-10 text-center text-sm text-slate-500">Indlæser…</li>
        ) : rows.length === 0 ? (
          <li className="px-4 py-10 text-center text-sm text-slate-500">Ingen aktivitet endnu.</li>
        ) : (
          rows.map((a) => {
            const credit = activityLooksLikeCreditNote(a)
            return (
              <li
                key={a.id}
                className={
                  credit
                    ? 'border-l-[3px] border-l-rose-500 bg-rose-50/35 px-4 py-3.5'
                    : 'px-4 py-3.5'
                }
              >
                <div
                  className={`text-sm font-medium ${credit ? 'text-rose-900' : 'text-slate-800'}`}
                >
                  {activityDisplayTitle(a)}
                </div>
                <div className={`mt-0.5 text-xs ${credit ? 'text-rose-800/75' : 'text-slate-500'}`}>
                  {formatDateTime(a.created_at)}
                </div>
              </li>
            )
          })
        )}
      </ul>
    </div>
  )
}
