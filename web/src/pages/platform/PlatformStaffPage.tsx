import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useApp } from '@/context/AppProvider'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import { formatDateTime } from '@/lib/format'

type StaffRow = Database['public']['Tables']['platform_staff']['Row']

export function PlatformStaffPage() {
  const { platformRole } = useApp()
  const [rows, setRows] = useState<StaffRow[]>([])
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: qErr } = await supabase
      .from('platform_staff')
      .select('*')
      .order('created_at', { ascending: true })
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

  if (platformRole !== 'superadmin') {
    return <Navigate to="/platform/dashboard" replace />
  }

  async function addAdmin(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setBusy(true)
    setError(null)
    setInfo(null)
    const { error: rpcErr } = await supabase.rpc('add_support_admin_by_email', {
      p_email: email.trim(),
    })
    setBusy(false)
    if (rpcErr) {
      setError(rpcErr.message)
      return
    }
    setEmail('')
    setInfo('Support-admin tilføjet.')
    void load()
  }

  async function remove(userId: string) {
    if (!confirm('Fjerne denne platform-bruger?')) return
    setBusy(true)
    setError(null)
    const { error: dErr } = await supabase
      .from('platform_staff')
      .delete()
      .eq('user_id', userId)
    setBusy(false)
    if (dErr) {
      setError(dErr.message)
      return
    }
    void load()
  }

  return (
    <div className="w-full space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Platform-team</h1>
        <p className="mt-1 text-sm text-slate-600">
          Kun superadmin kan tilføje support-admins. Brugeren skal have en konto i forvejen.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}
      {info ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {info}
        </div>
      ) : null}

      <form
        onSubmit={(e) => void addAdmin(e)}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="min-w-[200px] flex-1">
          <label className="text-xs font-medium text-slate-600">E-mail</label>
          <input
            type="email"
            required
            autoComplete="email"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="kollega@firma.dk"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          Tilføj support-admin
        </button>
      </form>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-6 text-sm text-slate-500">Indlæser…</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Bruger-ID</th>
                <th className="px-4 py-3">Rolle</th>
                <th className="hidden px-4 py-3 sm:table-cell">Oprettet</th>
                <th className="px-4 py-3 text-right">Handling</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.user_id}>
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">
                    {r.user_id}
                  </td>
                  <td className="px-4 py-3">
                    {r.role === 'superadmin' ? 'Superadmin' : 'Support'}
                  </td>
                  <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">
                    {formatDateTime(r.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.role !== 'superadmin' ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void remove(r.user_id)}
                        className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50"
                      >
                        Fjern
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
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
