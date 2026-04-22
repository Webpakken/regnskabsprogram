import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
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
import {
  copenhagenLastNDaysInclusive,
  copenhagenYearMonth,
  eachCopenhagenYmdInRange,
  formatDate,
  formatDkk,
  formatDateTime,
} from '@/lib/format'
import { redirectToStripeCheckout } from '@/lib/edge'
import type { Database } from '@/types/database'

type Invoice = Database['public']['Tables']['invoices']['Row']
type Activity = Database['public']['Tables']['activity_events']['Row']

export function DashboardPage() {
  const { currentCompany, subscription, refresh } = useApp()
  const [searchParams] = useSearchParams()
  const ok = subscriptionOk(subscription)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [activity, setActivity] = useState<Activity[]>([])
  const [voucherCount, setVoucherCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (searchParams.get('checkout') === 'success') {
      void refresh()
    }
  }, [searchParams, refresh])

  useEffect(() => {
    if (!currentCompany) {
      setLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { from, to } = copenhagenLastNDaysInclusive(30)
      const [inv, act, vc] = await Promise.all([
        supabase
          .from('invoices')
          .select('*')
          .eq('company_id', currentCompany.id)
          .gte('issue_date', from)
          .lte('issue_date', to)
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
    const { from, to } = copenhagenLastNDaysInclusive(30)
    const map = new Map<string, number>()
    for (const key of eachCopenhagenYmdInRange(from, to)) {
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
    const ym = copenhagenYearMonth()
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
            onClick={() => redirectToStripeCheckout(currentCompany.id)}
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

      <div className="grid grid-cols-2 gap-3 lg:hidden">
        <Tile to="/app/bank" title="Bank" hint="Se konto og match" />
        <Tile to="/app/vat" title="Moms" hint="Rapport til TastSelv" accent />
        <Tile to="/app/invoices" title="Til gode" hint={formatDkk(openGross)} />
        <Tile to="/app/vouchers" title="Bilag" hint={`${voucherCount} i alt`} />
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

function Tile({
  to,
  title,
  hint,
  accent,
}: {
  to: string
  title: string
  hint: string
  accent?: boolean
}) {
  return (
    <Link
      to={to}
      className="group flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition active:scale-[0.99]"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-900">{title}</span>
        <span className="text-slate-300 group-hover:text-indigo-500">›</span>
      </div>
      <div className={accent ? 'mt-4 text-lg font-semibold text-indigo-600' : 'mt-4 text-lg font-semibold text-slate-900'}>
        {hint}
      </div>
    </Link>
  )
}
