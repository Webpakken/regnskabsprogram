import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '@/context/AppProvider'
import type { Database } from '@/types/database'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/format'

type Company = Database['public']['Tables']['companies']['Row']

export function PlatformCompaniesPage() {
  const navigate = useNavigate()
  const { refresh } = useApp()
  const [rows, setRows] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

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
                <th className="px-4 py-3">Navn</th>
                <th className="hidden px-4 py-3 sm:table-cell">CVR</th>
                <th className="hidden px-4 py-3 md:table-cell">Oprettet</th>
                <th className="px-4 py-3 text-right">Handling</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((c) => (
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
