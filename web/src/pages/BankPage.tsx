import { useEffect, useState } from 'react'
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

/** Aiia-integration er udskudt — siden viser evt. eksisterende rækker fra senere test. */
export function BankPage() {
  const { currentCompany } = useApp()
  const [rows, setRows] = useState<Conn[]>([])
  const [loading, setLoading] = useState(true)

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
    <div className="space-y-6">
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
              <th className="px-4 py-3">Udbyder</th>
              <th className="px-4 py-3">Institution</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Oprettet</th>
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
              rows.map((r) => (
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
    </div>
  )
}
