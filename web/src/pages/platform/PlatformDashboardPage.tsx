import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

type Stats = {
  companies: number
  subscriptionsActive: number
  subscriptionsTrialing: number
  ticketsOpen: number
}

export function PlatformDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setError(null)
      const [cRes, sRes, tRes] = await Promise.all([
        supabase.from('companies').select('*', { count: 'exact', head: true }),
        supabase.from('subscriptions').select('status'),
        supabase.from('support_tickets').select('status').in('status', ['open', 'waiting_customer']),
      ])
      if (cancelled) return
      if (cRes.error) {
        setError(cRes.error.message)
        return
      }
      const rows = sRes.data ?? []
      let active = 0
      let trialing = 0
      for (const r of rows) {
        if (r.status === 'active') active += 1
        if (r.status === 'trialing') trialing += 1
      }
      const openTickets = tRes.error ? 0 : (tRes.data?.length ?? 0)
      setStats({
        companies: cRes.count ?? 0,
        subscriptionsActive: active,
        subscriptionsTrialing: trialing,
        ticketsOpen: openTickets,
      })
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="w-full space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Platformoverblik</h1>
        <p className="mt-1 text-sm text-slate-600">
          Samlet status for Bilago-kunder og support.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Virksomheder" value={stats?.companies ?? '—'} />
        <StatCard label="Aktive abonnementer" value={stats?.subscriptionsActive ?? '—'} />
        <StatCard label="Prøveperiode" value={stats?.subscriptionsTrialing ?? '—'} />
        <StatCard label="Åbne support-sager" value={stats?.ticketsOpen ?? '—'} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Hurtige links</h2>
        <ul className="mt-3 flex flex-wrap gap-3 text-sm">
          <li>
            <Link to="/platform/companies" className="text-indigo-600 hover:underline">
              Virksomhedsliste
            </Link>
          </li>
          <li>
            <Link to="/platform/support" className="text-indigo-600 hover:underline">
              Support-indbakke
            </Link>
          </li>
          <li>
            <Link to="/platform/settings/public/kontakt" className="text-indigo-600 hover:underline">
              Offentlige oplysninger og SMTP
            </Link>
          </li>
        </ul>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold tabular-nums text-slate-900">{value}</div>
    </div>
  )
}
