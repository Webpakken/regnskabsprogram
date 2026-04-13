import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { supabase } from '@/lib/supabase'
import { useApp, subscriptionOk } from '@/context/AppProvider'
import { formatDate, formatDkk, formatDateTime } from '@/lib/format'
import { startStripeCheckout } from '@/lib/edge'
import type { Database } from '@/types/database'

type Invoice = Database['public']['Tables']['invoices']['Row']
type Activity = Database['public']['Tables']['activity_events']['Row']

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function last30Days() {
  const end = startOfDay(new Date())
  const start = new Date(end)
  start.setDate(start.getDate() - 29)
  return { start, end }
}

export function DashboardPage() {
  const { currentCompany, subscription } = useApp()
  const ok = subscriptionOk(subscription)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [activity, setActivity] = useState<Activity[]>([])
  const [voucherCount, setVoucherCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentCompany) {
      setLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { start } = last30Days()
      const startIso = start.toISOString().slice(0, 10)
      const [inv, act, vc] = await Promise.all([
        supabase
          .from('invoices')
          .select('*')
          .eq('company_id', currentCompany.id)
          .gte('issue_date', startIso)
          .order('issue_date', { ascending: true }),
        supabase
          .from('activity_events')
          .select('*')
          .eq('company_id', currentCompany.id)
          .order('created_at', { ascending: false })
          .limit(12),
        supabase
          .from('vouchers')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', currentCompany.id),
      ])
      if (cancelled) return
      setInvoices(inv.data ?? [])
      setActivity(act.data ?? [])
      setVoucherCount(vc.count ?? 0)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [currentCompany])

  const chartData = useMemo(() => {
    const { start, end } = last30Days()
    const map = new Map<string, number>()
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10)
      map.set(key, 0)
    }
    for (const inv of invoices) {
      if (inv.status === 'cancelled') continue
      const key = inv.issue_date
      if (!map.has(key)) continue
      map.set(key, (map.get(key) ?? 0) + inv.gross_cents)
    }
    return [...map.entries()].map(([date, gross_cents]) => ({
      date,
      label: formatDate(date),
      brutto: gross_cents / 100,
    }))
  }, [invoices])

  const momsMonth = useMemo(() => {
    const now = new Date()
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    return invoices
      .filter(
        (i) =>
          i.issue_date.startsWith(ym) &&
          i.status !== 'cancelled',
      )
      .reduce((s, i) => s + i.vat_cents, 0)
  }, [invoices])

  const openGross = useMemo(
    () =>
      invoices
        .filter((i) => i.status === 'sent')
        .reduce((s, i) => s + i.gross_cents, 0),
    [invoices],
  )

  if (!currentCompany) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-slate-600">Opret først en virksomhed under onboarding.</p>
        <Link
          className="mt-4 inline-block text-sm font-medium text-indigo-600"
          to="/onboarding"
        >
          Gå til onboarding
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Oversigt</h1>
        <p className="mt-1 text-sm text-slate-600">
          Fakturaer, bilag og moms — sidste 30 dage
        </p>
      </div>

      {!ok ? (
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-6">
          <h2 className="text-lg font-medium text-indigo-900">
            Aktivér abonnement
          </h2>
          <p className="mt-1 text-sm text-indigo-800">
            Du kan se oversigten, men fakturaer, bilag og bank kræver aktivt abonnement.
          </p>
          <button
            type="button"
            className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            onClick={() =>
              void startStripeCheckout(currentCompany.id).then((url) => {
                window.location.href = url
              })
            }
          >
            Start abonnement
          </button>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Udestående (sendt)"
          value={formatDkk(openGross)}
          hint="Ikke betalt"
        />
        <Stat
          label="Moms (denne måned)"
          value={formatDkk(momsMonth)}
          hint="Fra fakturalinjer"
        />
        <Stat
          label="Fakturaer (30 d)"
          value={String(invoices.filter((i) => i.status !== 'cancelled').length)}
        />
        <Stat label="Bilag i alt" value={String(voucherCount)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-900">
            Omsætning på fakturaer (30 dage)
          </h2>
          <p className="text-xs text-slate-500">Brutto pr. bogføringsdato</p>
          <div className="mt-4 h-64">
            {loading ? (
              <div className="flex h-full items-center justify-center text-slate-400">
                Indlæser…
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#4f46e5" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <Tooltip
                    formatter={(value) => [
                      formatDkk(
                        Math.round((typeof value === 'number' ? value : 0) * 100),
                      ),
                      'Brutto',
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="brutto"
                    stroke="#4f46e5"
                    fill="url(#g)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Seneste aktivitet</h2>
          <ul className="mt-3 space-y-3 text-sm">
            {activity.length === 0 ? (
              <li className="text-slate-500">Ingen hændelser endnu.</li>
            ) : (
              activity.map((a) => (
                <li key={a.id} className="border-b border-slate-100 pb-3 last:border-0">
                  <div className="font-medium text-slate-800">{a.title}</div>
                  <div className="text-xs text-slate-500">
                    {formatDateTime(a.created_at)}
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-xl font-semibold text-slate-900">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </div>
  )
}
