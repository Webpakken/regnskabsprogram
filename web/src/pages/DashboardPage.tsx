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
  APP_TIMEZONE,
  copenhagenLastNDaysInclusive,
  copenhagenYearMonth,
  eachCopenhagenYmdInRange,
  formatDate,
  formatDkk,
  formatDateTime,
} from '@/lib/format'
import { redirectToStripeCheckout } from '@/lib/edge'
import { activityDisplayTitle, activityLooksLikeCreditNote } from '@/lib/activityDisplay'
import type { Database } from '@/types/database'

const DASHBOARD_ACTIVITY_PREVIEW = 7
const INVOICE_FETCH_DAYS = 400

type Invoice = Database['public']['Tables']['invoices']['Row']
type Activity = Database['public']['Tables']['activity_events']['Row']

type PeriodMode = 'month' | '30d'

function monthRangeYm(ym: string): { from: string; to: string } {
  const from = `${ym}-01`
  const y = parseInt(ym.slice(0, 4), 10)
  const m = parseInt(ym.slice(5, 7), 10)
  const last = new Date(Date.UTC(y, m, 0, 12, 0, 0)).getUTCDate()
  const to = `${ym}-${String(last).padStart(2, '0')}`
  return { from, to }
}

function monthNameShort(ym: string): string {
  const [y, mo] = ym.split('-').map(Number)
  return new Intl.DateTimeFormat('da-DK', {
    timeZone: APP_TIMEZONE,
    month: 'short',
  }).format(new Date(Date.UTC(y, mo - 1, 15, 12, 0, 0)))
}

function signedAmountClass(cents: number): string {
  if (cents > 0) return 'text-emerald-600'
  if (cents < 0) return 'text-rose-600'
  return 'text-slate-700'
}

function invoiceMetrics(rows: Invoice[]) {
  const active = rows.filter((i) => i.status !== 'cancelled')
  let invoicedPos = 0
  let creditAbs = 0
  let net = 0
  for (const i of active) {
    const g = i.gross_cents
    net += g
    if (g > 0) invoicedPos += g
    if (g < 0) creditAbs += -g
  }
  return { invoicedPos, creditAbs, net }
}

/** Fire søjler: beløb pr. tidschunk i perioden (brutto, opdelt efter fortegn til spark). */
function sparkFourParts(
  rows: Invoice[],
  from: string,
  to: string,
  mode: 'positive' | 'negative_abs',
): number[] {
  const dates = eachCopenhagenYmdInRange(from, to)
  if (dates.length === 0) return [0, 0, 0, 0]
  const chunk = Math.ceil(dates.length / 4)
  const buckets = [0, 0, 0, 0]
  const active = rows.filter((i) => i.status !== 'cancelled')
  for (const inv of active) {
    const idx = dates.indexOf(inv.issue_date)
    if (idx < 0) continue
    const b = Math.min(3, Math.floor(idx / chunk))
    const g = inv.gross_cents
    if (mode === 'positive' && g > 0) buckets[b] += g
    if (mode === 'negative_abs' && g < 0) buckets[b] += -g
  }
  return buckets
}

function MiniBars({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1)
  return (
    <div className="flex h-11 w-14 shrink-0 items-end justify-end gap-1">
      {values.map((v, i) => (
        <div
          key={i}
          className="w-2 rounded-sm transition-all"
          style={{
            height: `${Math.max(10, (v / max) * 100)}%`,
            backgroundColor: color,
            opacity: 0.75 + (i / values.length) * 0.25,
          }}
        />
      ))}
    </div>
  )
}

export function DashboardPage() {
  const { currentCompany, subscription, refresh } = useApp()
  const [searchParams] = useSearchParams()
  const ok = subscriptionOk(subscription)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [openSentCents, setOpenSentCents] = useState(0)
  const [activity, setActivity] = useState<Activity[]>([])
  const [voucherCount, setVoucherCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month')

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
    void (async () => {
      setLoading(true)
      const { from, to } = copenhagenLastNDaysInclusive(INVOICE_FETCH_DAYS)
      const [inv, openSent, act, vc] = await Promise.all([
        supabase
          .from('invoices')
          .select('*')
          .eq('company_id', currentCompany.id)
          .gte('issue_date', from)
          .lte('issue_date', to)
          .order('issue_date', { ascending: true }),
        supabase
          .from('invoices')
          .select('gross_cents')
          .eq('company_id', currentCompany.id)
          .eq('status', 'sent'),
        supabase
          .from('activity_events')
          .select('*')
          .eq('company_id', currentCompany.id)
          .order('created_at', { ascending: false })
          .limit(DASHBOARD_ACTIVITY_PREVIEW),
        supabase
          .from('vouchers')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', currentCompany.id),
      ])
      if (cancelled) return
      setInvoices(inv.data ?? [])
      const openSum =
        openSent.data?.reduce((s, r) => s + Number((r as { gross_cents: number }).gross_cents ?? 0), 0) ??
        0
      setOpenSentCents(openSum)
      setActivity(act.data ?? [])
      setVoucherCount(vc.count ?? 0)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [currentCompany])

  const ym = copenhagenYearMonth()
  const periodRange = useMemo(() => {
    if (periodMode === '30d') return copenhagenLastNDaysInclusive(30)
    return monthRangeYm(ym)
  }, [periodMode, ym])

  const periodInvoices = useMemo(() => {
    const { from, to } = periodRange
    return invoices.filter((i) => i.issue_date >= from && i.issue_date <= to)
  }, [invoices, periodRange])

  const { invoicedPos, creditAbs, net } = useMemo(
    () => invoiceMetrics(periodInvoices),
    [periodInvoices],
  )

  const momsCalendarMonth = useMemo(() => {
    return invoices
      .filter((i) => i.issue_date.startsWith(ym) && i.status !== 'cancelled')
      .reduce((s, i) => s + i.vat_cents, 0)
  }, [invoices, ym])

  const chartData = useMemo(() => {
    const { from, to } = periodRange
    const map = new Map<string, number>()
    for (const key of eachCopenhagenYmdInRange(from, to)) {
      map.set(key, 0)
    }
    for (const inv of periodInvoices) {
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
  }, [periodInvoices, periodRange])

  const sparks = useMemo(() => {
    const { from, to } = periodRange
    return {
      inc: sparkFourParts(periodInvoices, from, to, 'positive'),
      cred: sparkFourParts(periodInvoices, from, to, 'negative_abs'),
    }
  }, [periodInvoices, periodRange])

  const netSpark = useMemo(() => {
    const { from, to } = periodRange
    const dates = eachCopenhagenYmdInRange(from, to)
    if (dates.length === 0) return [0, 0, 0, 0]
    const chunk = Math.ceil(dates.length / 4)
    const buckets = [0, 0, 0, 0]
    for (const inv of periodInvoices.filter((i) => i.status !== 'cancelled')) {
      const idx = dates.indexOf(inv.issue_date)
      if (idx < 0) continue
      const b = Math.min(3, Math.floor(idx / chunk))
      buckets[b] += inv.gross_cents
    }
    return buckets.map((v) => Math.abs(v))
  }, [periodInvoices, periodRange])

  const monthTabLabel = monthNameShort(ym)
  const yearLabel = useMemo(() => {
    const y = parseInt(ym.slice(0, 4), 10)
    return `${y}`
  }, [ym])

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

  const emerald = '#059669'
  const rose = '#e11d48'
  const slateBar = '#64748b'

  return (
    <div className="space-y-5">
      <div className="-mx-4 -mt-2 overflow-hidden rounded-b-3xl bg-gradient-to-b from-sky-600 to-blue-800 px-4 pb-6 pt-3 shadow-lg md:-mx-8 md:rounded-2xl md:shadow-md">
        <p className="text-center text-sm font-semibold tracking-wide text-white/95">
          {currentCompany.name}
        </p>
        <p className="mt-0.5 text-center text-xs text-sky-100/90">Oversigt</p>

        <div className="mx-auto mt-4 max-w-lg rounded-2xl bg-white p-4 shadow-md">
          <div className="flex rounded-full bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setPeriodMode('month')}
              className={`flex-1 rounded-full py-2 text-center text-xs font-semibold transition ${
                periodMode === 'month'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              {monthTabLabel}
            </button>
            <button
              type="button"
              onClick={() => setPeriodMode('30d')}
              className={`flex-1 rounded-full py-2 text-center text-xs font-semibold transition ${
                periodMode === '30d'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              30 dage
            </button>
          </div>

          <div className="mt-4 space-y-0 divide-y divide-slate-100">
            <div className="flex items-center justify-between gap-3 pb-3">
              <div className="min-w-0">
                <div className="text-xs font-medium text-slate-500">Faktureret</div>
                <div className={`mt-1 truncate text-2xl font-bold tabular-nums ${signedAmountClass(invoicedPos)}`}>
                  {formatDkk(invoicedPos)}
                </div>
              </div>
              <MiniBars values={sparks.inc} color={emerald} />
            </div>
            <div className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="text-xs font-medium text-slate-500">Kreditnotaer</div>
                <div
                  className={`mt-1 text-2xl font-bold tabular-nums ${
                    creditAbs > 0 ? 'text-rose-600' : 'text-slate-400'
                  }`}
                >
                  {formatDkk(creditAbs)}
                </div>
              </div>
              <MiniBars values={sparks.cred} color={rose} />
            </div>
            <div className="flex items-center justify-between gap-3 pt-3">
              <div className="min-w-0">
                <div className="text-xs font-medium text-slate-500">Netto</div>
                <div className={`mt-1 truncate text-2xl font-bold tabular-nums ${signedAmountClass(net)}`}>
                  {formatDkk(net)}
                </div>
              </div>
              <MiniBars values={netSpark} color={slateBar} />
            </div>
          </div>
        </div>
      </div>

      {!ok ? (
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5">
          <h2 className="text-base font-semibold text-indigo-900">Aktivér abonnement</h2>
          <p className="mt-1 text-sm text-indigo-800">
            Du kan se oversigten, men fakturaer, bilag og bank kræver aktivt abonnement.
          </p>
          <button
            type="button"
            className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            onClick={() => redirectToStripeCheckout(currentCompany.id)}
          >
            Start abonnement
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <DashTile
          to="/app/invoices"
          title="Til gode"
          subtitle="Sendt, ikke betalt"
          value={formatDkk(openSentCents)}
          valueClass={signedAmountClass(openSentCents)}
        />
        <DashTile
          to="/app/vat"
          title="Moms"
          subtitle="Fakturaer i måned"
          value={formatDkk(momsCalendarMonth)}
          valueClass={momsCalendarMonth > 0 ? 'text-rose-600' : momsCalendarMonth < 0 ? 'text-emerald-600' : 'text-slate-700'}
        />
        <DashTile
          to="/app/invoices"
          title="Fakturaer"
          subtitle={periodMode === 'month' ? 'I valgt måned' : 'Seneste 30 dage'}
          value={String(periodInvoices.filter((i) => i.status !== 'cancelled').length)}
          valueClass="text-slate-900"
        />
        <DashTile
          to="/app/vouchers"
          title="Bilag"
          subtitle="Uploadet i alt"
          value={String(voucherCount)}
          valueClass="text-slate-900"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-900">
            Brutto pr. dag ({periodMode === 'month' ? `${monthTabLabel} ${yearLabel}` : '30 dage'})
          </h2>
          <p className="text-xs text-slate-500">Inkl. kreditnotaer (negative dage trækker fra)</p>
          <div className="mt-4 h-56 sm:h-64">
            {loading ? (
              <div className="flex h-full items-center justify-center text-slate-400">
                Indlæser…
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="dashG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
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
                    stroke="#0284c7"
                    fill="url(#dashG)"
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
              activity.map((a) => {
                const credit = activityLooksLikeCreditNote(a)
                return (
                  <li
                    key={a.id}
                    className={`border-b border-slate-100 pb-3 last:border-0 ${
                      credit ? 'border-l-2 border-l-rose-500 pl-2' : ''
                    }`}
                  >
                    <div
                      className={`font-medium ${credit ? 'text-rose-900' : 'text-slate-800'}`}
                    >
                      {activityDisplayTitle(a)}
                    </div>
                    <div className={`text-xs ${credit ? 'text-rose-800/80' : 'text-slate-500'}`}>
                      {formatDateTime(a.created_at)}
                    </div>
                  </li>
                )
              })
            )}
          </ul>
          {activity.length > 0 ? (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <Link
                to="/app/activity"
                className="text-sm font-medium text-sky-700 hover:text-sky-900"
              >
                Se hele aktivitetsloggen
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function DashTile({
  to,
  title,
  subtitle,
  value,
  valueClass,
}: {
  to: string
  title: string
  subtitle: string
  value: string
  valueClass: string
}) {
  return (
    <Link
      to={to}
      className="group flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition active:scale-[0.99] hover:border-sky-200 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-1">
        <span className="text-sm font-semibold text-slate-900">{title}</span>
        <span className="text-slate-300 group-hover:text-sky-600">›</span>
      </div>
      <div className="mt-1 text-xs text-slate-500">{subtitle}</div>
      <div className={`mt-3 text-lg font-bold tabular-nums leading-tight ${valueClass}`}>{value}</div>
    </Link>
  )
}
