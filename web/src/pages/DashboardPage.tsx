import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { supabase } from '@/lib/supabase'
import { useApp, accessOk } from '@/context/AppProvider'
import {
  APP_TIMEZONE,
  copenhagenLastNDaysInclusive,
  copenhagenYearMonth,
  eachCopenhagenYmdInRange,
  formatDate,
  formatDateOnly,
  formatDkk,
  formatDateTime,
} from '@/lib/format'
import {
  ButtonSpinner,
  useStripeCheckoutLauncher,
} from '@/lib/useStripeCheckoutLauncher'
import { activityDisplayTitle, activityLooksLikeCreditNote } from '@/lib/activityDisplay'
import { activityEventHref } from '@/lib/activityNavigation'
import { AppPageLayout } from '@/components/AppPageLayout'
import { CheckoutResultNotice } from '@/components/CheckoutResultNotice'
import type { Database, IncomeKind } from '@/types/database'

const DASHBOARD_ACTIVITY_PREVIEW = 7
const INVOICE_FETCH_DAYS = 1825

type Invoice = Database['public']['Tables']['invoices']['Row']
type Activity = Database['public']['Tables']['activity_events']['Row']
type VoucherLite = { gross_cents: number; expense_date: string }
type IncomeLite = { amount_cents: number; entry_date: string; kind: IncomeKind }

const INCOME_KIND_LABEL: Record<IncomeKind, string> = {
  kommunalt_tilskud: 'Kommunalt tilskud',
  fondsbevilling: 'Fondsbevilling',
  medlemskontingent: 'Kontingent',
  donation: 'Donation',
  event: 'Eventindtægt',
  andet: 'Andet',
}

const INCOME_KIND_COLOR: Record<IncomeKind, string> = {
  kommunalt_tilskud: '#4338ca', // indigo-700
  fondsbevilling: '#7c3aed', // violet-600
  medlemskontingent: '#059669', // emerald-600
  donation: '#0891b2', // cyan-600
  event: '#d97706', // amber-600
  andet: '#64748b', // slate-500
}

type PeriodMode = 'month' | 'ytd' | 'all'

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
    <div className="flex h-8 w-10 shrink-0 items-end justify-end gap-0.5 md:h-12 md:w-14 md:gap-1">
      {values.map((v, i) => (
        <div
          key={i}
          className="w-1.5 rounded-sm transition-all md:w-2"
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
  const checkout = useStripeCheckoutLauncher()
  const [searchParams] = useSearchParams()
  const checkoutResult = searchParams.get('checkout')
  const hasAccess = accessOk(currentCompany, subscription)
  const isForening = currentCompany?.entity_type === 'forening'
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [openSentCents, setOpenSentCents] = useState(0)
  const [activity, setActivity] = useState<Activity[]>([])
  const [voucherCount, setVoucherCount] = useState(0)
  const [vouchers, setVouchers] = useState<VoucherLite[]>([])
  const [incomeEntries, setIncomeEntries] = useState<IncomeLite[]>([])
  const [loading, setLoading] = useState(true)
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month')

  useEffect(() => {
    if (checkoutResult === 'success') {
      void refresh()
    }
  }, [checkoutResult, refresh])

  useEffect(() => {
    if (!currentCompany) return
    let cancelled = false
    void (async () => {
      setLoading(true)
      const { from, to } = copenhagenLastNDaysInclusive(INVOICE_FETCH_DAYS)
      const [inv, openSent, act, vc, vouchAmt, incomes] = await Promise.all([
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
        supabase
          .from('vouchers')
          .select('gross_cents, expense_date')
          .eq('company_id', currentCompany.id)
          .gte('expense_date', from)
          .lte('expense_date', to),
        supabase
          .from('income_entries')
          .select('amount_cents, entry_date, kind')
          .eq('company_id', currentCompany.id)
          .gte('entry_date', from)
          .lte('entry_date', to),
      ])
      if (cancelled) return
      setInvoices(inv.data ?? [])
      const openSum =
        openSent.data?.reduce((s, r) => s + Number((r as { gross_cents: number }).gross_cents ?? 0), 0) ??
        0
      setOpenSentCents(openSum)
      setActivity(act.data ?? [])
      setVoucherCount(vc.count ?? 0)
      setVouchers((vouchAmt.data ?? []) as VoucherLite[])
      setIncomeEntries((incomes.data ?? []) as IncomeLite[])
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [currentCompany])

  const ym = copenhagenYearMonth()
  const today = useMemo(() => copenhagenLastNDaysInclusive(1).to, [])
  const periodRange = useMemo(() => {
    if (periodMode === 'ytd') {
      const year = ym.slice(0, 4)
      return { from: `${year}-01-01`, to: today }
    }
    if (periodMode === 'all') {
      return { from: '2000-01-01', to: today }
    }
    return monthRangeYm(ym)
  }, [periodMode, ym, today])

  const periodLabel = useMemo(() => {
    if (periodMode === 'ytd') {
      return `År til dato (${ym.slice(0, 4)})`
    }
    if (periodMode === 'all') {
      return 'Hele tiden'
    }
    const monthLong = new Intl.DateTimeFormat('da-DK', {
      timeZone: APP_TIMEZONE,
      month: 'long',
      year: 'numeric',
    }).format(new Date(Date.UTC(parseInt(ym.slice(0, 4), 10), parseInt(ym.slice(5, 7), 10) - 1, 15, 12, 0, 0)))
    return monthLong.charAt(0).toUpperCase() + monthLong.slice(1)
  }, [periodMode, ym])

  const periodSubLabel = useMemo(() => {
    const { from, to } = periodRange
    if (periodMode === 'all') {
      return `Til og med ${formatDateOnly(to)}`
    }
    return `${formatDateOnly(from)} – ${formatDateOnly(to)}`
  }, [periodMode, periodRange])

  const periodInvoices = useMemo(() => {
    const { from, to } = periodRange
    return invoices.filter((i) => i.issue_date >= from && i.issue_date <= to)
  }, [invoices, periodRange])

  const { invoicedPos, creditAbs, net } = useMemo(
    () => invoiceMetrics(periodInvoices),
    [periodInvoices],
  )

  const { positiveInvoiceCount, negativeInvoiceCount } = useMemo(() => {
    let pos = 0
    let neg = 0
    for (const i of periodInvoices) {
      if (i.status === 'cancelled') continue
      if (i.gross_cents > 0) pos += 1
      else if (i.gross_cents < 0) neg += 1
    }
    return { positiveInvoiceCount: pos, negativeInvoiceCount: neg }
  }, [periodInvoices])

  const periodVouchers = useMemo(() => {
    const { from, to } = periodRange
    return vouchers.filter((v) => v.expense_date >= from && v.expense_date <= to)
  }, [vouchers, periodRange])

  const periodIncome = useMemo(() => {
    const { from, to } = periodRange
    return incomeEntries.filter((i) => i.entry_date >= from && i.entry_date <= to)
  }, [incomeEntries, periodRange])

  const incomeCents = useMemo(
    () => periodIncome.reduce((s, i) => s + i.amount_cents, 0),
    [periodIncome],
  )
  const expenseCents = useMemo(
    () => periodVouchers.reduce((s, v) => s + v.gross_cents, 0),
    [periodVouchers],
  )
  const resultCents = incomeCents - expenseCents

  const incomeByKind = useMemo(() => {
    const map = new Map<IncomeKind, number>()
    for (const e of periodIncome) {
      map.set(e.kind, (map.get(e.kind) ?? 0) + e.amount_cents)
    }
    return [...map.entries()]
      .map(([kind, value]) => ({ kind, value, label: INCOME_KIND_LABEL[kind] }))
      .sort((a, b) => b.value - a.value)
  }, [periodIncome])

  /** Sparks for Indtægter / Udgifter / Resultat (4 chunks for periode). */
  const foreningSparks = useMemo(() => {
    const { from, to } = periodRange
    const dates = eachCopenhagenYmdInRange(from, to)
    const chunk = Math.max(1, Math.ceil(dates.length / 4))
    const inc = [0, 0, 0, 0]
    const exp = [0, 0, 0, 0]
    const res = [0, 0, 0, 0]
    for (const e of periodIncome) {
      const idx = dates.indexOf(e.entry_date)
      if (idx < 0) continue
      const b = Math.min(3, Math.floor(idx / chunk))
      inc[b] += e.amount_cents
      res[b] += e.amount_cents
    }
    for (const v of periodVouchers) {
      const idx = dates.indexOf(v.expense_date)
      if (idx < 0) continue
      const b = Math.min(3, Math.floor(idx / chunk))
      exp[b] += v.gross_cents
      res[b] -= v.gross_cents
    }
    return { inc, exp, res: res.map((v) => Math.abs(v)) }
  }, [periodIncome, periodVouchers, periodRange])

  /** Linje-data til "Indtægter vs udgifter pr. dag" for foreninger. */
  const foreningChartData = useMemo(() => {
    const { from, to } = periodRange
    const incomeMap = new Map<string, number>()
    const expenseMap = new Map<string, number>()
    for (const key of eachCopenhagenYmdInRange(from, to)) {
      incomeMap.set(key, 0)
      expenseMap.set(key, 0)
    }
    for (const e of periodIncome) {
      if (incomeMap.has(e.entry_date)) {
        incomeMap.set(e.entry_date, (incomeMap.get(e.entry_date) ?? 0) + e.amount_cents)
      }
    }
    for (const v of periodVouchers) {
      if (expenseMap.has(v.expense_date)) {
        expenseMap.set(v.expense_date, (expenseMap.get(v.expense_date) ?? 0) + v.gross_cents)
      }
    }
    return [...incomeMap.keys()].map((date) => ({
      date,
      label: formatDate(date),
      indtaegter: (incomeMap.get(date) ?? 0) / 100,
      udgifter: (expenseMap.get(date) ?? 0) / 100,
    }))
  }, [periodIncome, periodVouchers, periodRange])

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
    <AppPageLayout maxWidth="full" className="space-y-6 md:space-y-8">
      <CheckoutResultNotice result={checkoutResult} />
      <section className="space-y-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-lg font-semibold tracking-tight text-slate-900 md:text-xl">
              {currentCompany.name}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              <span className="text-slate-500">Viser data for: </span>
              <span className="font-semibold text-slate-900">{periodLabel}</span>
              <span className="text-slate-500"> · {periodSubLabel}</span>
            </p>
          </div>
          <div className="flex w-full shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-1 sm:w-auto">
            <button
              type="button"
              onClick={() => setPeriodMode('month')}
              className={clsx(
                'min-h-[40px] flex-1 rounded-md px-3 py-2 text-center text-xs font-semibold transition sm:flex-none sm:px-4',
                periodMode === 'month'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-white/90 hover:text-slate-900',
              )}
            >
              {monthTabLabel}
            </button>
            <button
              type="button"
              onClick={() => setPeriodMode('ytd')}
              className={clsx(
                'min-h-[40px] flex-1 rounded-md px-3 py-2 text-center text-xs font-semibold transition sm:flex-none sm:px-4',
                periodMode === 'ytd'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-white/90 hover:text-slate-900',
              )}
            >
              År til dato
            </button>
            <button
              type="button"
              onClick={() => setPeriodMode('all')}
              className={clsx(
                'min-h-[40px] flex-1 rounded-md px-3 py-2 text-center text-xs font-semibold transition sm:flex-none sm:px-4',
                periodMode === 'all'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-white/90 hover:text-slate-900',
              )}
            >
              Hele tiden
            </button>
          </div>
        </div>

        <div className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div
            className="h-1 bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-500"
            aria-hidden
          />
          <div className="border-b border-slate-100 px-4 py-2 md:px-8 md:py-3.5">
            <p
              className="text-[11px] font-semibold uppercase leading-snug tracking-wide text-slate-500 md:text-xs"
              title="Annullerede fakturaer indgår ikke i beregningen"
            >
              Nøgletal
            </p>
          </div>
          <div className="grid divide-y divide-slate-100 md:grid-cols-3 md:divide-x md:divide-y-0">
            {isForening ? (
              <>
                <div className="flex flex-col gap-1 px-4 py-2.5 md:gap-3 md:p-8">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500 md:text-xs">
                      Indtægter
                    </span>
                    <MiniBars values={foreningSparks.inc} color={emerald} />
                  </div>
                  <div
                    className={`text-lg font-bold tabular-nums leading-tight tracking-tight sm:text-xl md:text-3xl ${signedAmountClass(incomeCents)}`}
                  >
                    {formatDkk(incomeCents)}
                  </div>
                  <p className="text-[11px] text-slate-500 md:text-xs">
                    Baseret på {periodIncome.length} {periodIncome.length === 1 ? 'indtægt' : 'indtægter'}
                  </p>
                </div>
                <div className="flex flex-col gap-1 px-4 py-2.5 md:gap-3 md:p-8">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500 md:text-xs">
                      Udgifter
                    </span>
                    <MiniBars values={foreningSparks.exp} color={rose} />
                  </div>
                  <div
                    className={`text-lg font-bold tabular-nums leading-tight tracking-tight sm:text-xl md:text-3xl ${
                      expenseCents > 0 ? 'text-rose-600' : 'text-slate-400'
                    }`}
                  >
                    {formatDkk(expenseCents)}
                  </div>
                  <p className="text-[11px] text-slate-500 md:text-xs">
                    Baseret på {periodVouchers.length} {periodVouchers.length === 1 ? 'bilag' : 'bilag'}
                  </p>
                </div>
                <div className="flex flex-col gap-1 px-4 py-2.5 md:gap-3 md:p-8">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500 md:text-xs">
                      Resultat
                    </span>
                    <MiniBars values={foreningSparks.res} color={slateBar} />
                  </div>
                  <div
                    className={`text-lg font-bold tabular-nums leading-tight tracking-tight sm:text-xl md:text-3xl ${signedAmountClass(resultCents)}`}
                  >
                    {formatDkk(resultCents)}
                  </div>
                  <p className="text-[11px] text-slate-500 md:text-xs">
                    Indtægter − udgifter
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-1 px-4 py-2.5 md:gap-3 md:p-8">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500 md:text-xs">
                      Faktureret
                    </span>
                    <MiniBars values={sparks.inc} color={emerald} />
                  </div>
                  <div
                    className={`text-lg font-bold tabular-nums leading-tight tracking-tight sm:text-xl md:text-3xl ${signedAmountClass(invoicedPos)}`}
                  >
                    {formatDkk(invoicedPos)}
                  </div>
                  <p className="text-[11px] text-slate-500 md:text-xs">
                    {positiveInvoiceCount} {positiveInvoiceCount === 1 ? 'faktura' : 'fakturaer'}
                  </p>
                </div>
                <div className="flex flex-col gap-1 px-4 py-2.5 md:gap-3 md:p-8">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500 md:text-xs">
                      Kreditnotaer
                    </span>
                    <MiniBars values={sparks.cred} color={rose} />
                  </div>
                  <div
                    className={`text-lg font-bold tabular-nums leading-tight tracking-tight sm:text-xl md:text-3xl ${
                      creditAbs > 0 ? 'text-rose-600' : 'text-slate-400'
                    }`}
                  >
                    {formatDkk(creditAbs)}
                  </div>
                  <p className="text-[11px] text-slate-500 md:text-xs">
                    {negativeInvoiceCount} {negativeInvoiceCount === 1 ? 'kreditnota' : 'kreditnotaer'}
                  </p>
                </div>
                <div className="flex flex-col gap-1 px-4 py-2.5 md:gap-3 md:p-8">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500 md:text-xs">
                      Netto
                    </span>
                    <MiniBars values={netSpark} color={slateBar} />
                  </div>
                  <div
                    className={`text-lg font-bold tabular-nums leading-tight tracking-tight sm:text-xl md:text-3xl ${signedAmountClass(net)}`}
                  >
                    {formatDkk(net)}
                  </div>
                  <p className="text-[11px] text-slate-500 md:text-xs">
                    Faktureret − kreditnotaer
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {!hasAccess ? (
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-6 md:p-7">
          <h2 className="text-base font-semibold text-indigo-900">
            Din prøveperiode er slut
          </h2>
          <p className="mt-1 text-sm text-indigo-800">
            Du kan se oversigten, men fakturaer, bilag og bank kræver aktivt abonnement.
          </p>
          <button
            type="button"
            disabled={checkout.loading}
            className="mt-3 inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-80"
            onClick={() => void checkout.launch(currentCompany.id)}
          >
            {checkout.loading ? <ButtonSpinner /> : null}
            {checkout.loading ? 'Åbner Stripe…' : 'Start abonnement'}
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {isForening ? (
          <>
            <DashTile
              to="/app/income"
              title="Indtægter"
              subtitle="Poster i valgt periode"
              value={String(periodIncome.length)}
              valueClass="text-slate-900"
              scope="periode"
            />
            <DashTile
              to="/app/vouchers"
              title="Udgifter"
              subtitle="Bilag i valgt periode"
              value={String(periodVouchers.length)}
              valueClass="text-slate-900"
              scope="periode"
            />
            <DashTile
              to="/app/income"
              title="Indtægter"
              subtitle="Sum i valgt periode"
              value={formatDkk(incomeCents)}
              valueClass={signedAmountClass(incomeCents)}
              scope="periode"
            />
            <DashTile
              to="/app/vouchers"
              title="Bilag"
              subtitle="Uploadet i alt"
              value={String(voucherCount)}
              valueClass="text-slate-900"
              scope="total"
            />
          </>
        ) : (
          <>
            <DashTile
              to="/app/invoices"
              title="Til gode"
              subtitle="Sendt, ikke betalt"
              value={formatDkk(openSentCents)}
              valueClass={signedAmountClass(openSentCents)}
              scope="total"
            />
            <DashTile
              to="/app/vat"
              title="Moms"
              subtitle="Fakturaer i indeværende måned"
              value={formatDkk(momsCalendarMonth)}
              valueClass={momsCalendarMonth > 0 ? 'text-rose-600' : momsCalendarMonth < 0 ? 'text-emerald-600' : 'text-slate-700'}
              scope="måned"
            />
            <DashTile
              to="/app/invoices"
              title="Fakturaer"
              subtitle="I valgt periode"
              value={String(periodInvoices.filter((i) => i.status !== 'cancelled').length)}
              valueClass="text-slate-900"
              scope="periode"
            />
            <DashTile
              to="/app/vouchers"
              title="Bilag"
              subtitle="Uploadet i alt"
              value={String(voucherCount)}
              valueClass="text-slate-900"
              scope="total"
            />
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8 lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-900">
            {isForening
              ? `Indtægter vs udgifter pr. dag (${periodLabel})`
              : `Brutto pr. dag (${periodLabel})`}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {isForening
              ? 'Grøn = indtægter, rosa = udgifter.'
              : 'Inkl. kreditnotaer (negative dage trækker fra)'}
          </p>
          <div className="mt-6 h-56 sm:h-64">
            {loading ? (
              <div className="flex h-full items-center justify-center text-slate-400">
                Indlæser…
              </div>
            ) : isForening ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={foreningChartData}>
                  <defs>
                    <linearGradient id="foreningIncome" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#059669" stopOpacity={0.32} />
                      <stop offset="100%" stopColor="#059669" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="foreningExpense" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#e11d48" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#e11d48" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <Tooltip
                    formatter={(value, name) => [
                      formatDkk(Math.round((typeof value === 'number' ? value : 0) * 100)),
                      name === 'indtaegter' ? 'Indtægter' : 'Udgifter',
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="indtaegter"
                    stroke="#059669"
                    fill="url(#foreningIncome)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="udgifter"
                    stroke="#e11d48"
                    fill="url(#foreningExpense)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="bilagoDashArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.28} />
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
                    stroke="#4338ca"
                    fill="url(#bilagoDashArea)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {isForening ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
              <h2 className="text-sm font-semibold text-slate-900">Indtægter pr. type</h2>
              <p className="mt-1 text-xs text-slate-500">Fordeling i valgt periode</p>
              {incomeByKind.length === 0 ? (
                <p className="mt-6 py-8 text-center text-sm text-slate-500">
                  Ingen indtægter i perioden.
                </p>
              ) : (
                <>
                  <div className="mt-4 h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={incomeByKind}
                          dataKey="value"
                          nameKey="label"
                          innerRadius={42}
                          outerRadius={72}
                          stroke="none"
                        >
                          {incomeByKind.map((entry) => (
                            <Cell key={entry.kind} fill={INCOME_KIND_COLOR[entry.kind]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value) => [
                            formatDkk(typeof value === 'number' ? value : 0),
                            'Beløb',
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="mt-4 space-y-1.5 text-xs">
                    {incomeByKind.map((entry) => {
                      const pct = incomeCents > 0 ? (entry.value / incomeCents) * 100 : 0
                      return (
                        <li
                          key={entry.kind}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className="flex items-center gap-2">
                            <span
                              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: INCOME_KIND_COLOR[entry.kind] }}
                            />
                            <span className="font-medium text-slate-700">{entry.label}</span>
                          </span>
                          <span className="tabular-nums text-slate-600">
                            {formatDkk(entry.value)} ({pct.toFixed(0)}%)
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}
            </div>
          ) : null}

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <h2 className="text-sm font-semibold text-slate-900">Seneste aktivitet</h2>
          <ul className="mt-4 divide-y divide-slate-100 text-sm">
            {activity.length === 0 ? (
              <li className="py-6 text-slate-500">Ingen hændelser endnu.</li>
            ) : (
              activity.slice(0, 4).map((a) => {
                const credit = activityLooksLikeCreditNote(a)
                const href = activityEventHref(a)

                const inner = (
                  <div className="flex items-start gap-3">
                    {credit ? (
                      <span
                        className="mt-0.5 shrink-0 rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                        title="Kreditnota"
                      >
                        Kredit
                      </span>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className={`font-semibold ${credit ? 'text-rose-950' : 'text-slate-800'}`}>
                        {activityDisplayTitle(a)}
                      </div>
                      <div className={`mt-1 text-xs ${credit ? 'text-rose-800/90' : 'text-slate-500'}`}>
                        {formatDateTime(a.created_at)}
                      </div>
                    </div>
                    {href ? (
                      <span
                        className="mt-0.5 shrink-0 text-xs font-semibold text-indigo-600"
                        aria-hidden
                      >
                        →
                      </span>
                    ) : null}
                  </div>
                )

                const rowShell = href ? (
                  <Link
                    to={href}
                    aria-label={`${activityDisplayTitle(a)} — åbn`}
                    className={clsx(
                      'block rounded-xl px-3 py-3.5 transition md:px-4',
                      credit
                        ? 'border border-rose-200/80 bg-rose-50/80 shadow-sm hover:border-rose-300 hover:bg-rose-50'
                        : 'hover:bg-indigo-50/60',
                    )}
                  >
                    {inner}
                  </Link>
                ) : (
                  <div
                    className={clsx(
                      'rounded-xl px-3 py-3.5 md:px-4',
                      credit ? 'border border-rose-200/80 bg-rose-50/80 shadow-sm' : '',
                    )}
                  >
                    {inner}
                  </div>
                )

                return (
                  <li key={a.id} className="py-1 first:pt-0">
                    {rowShell}
                  </li>
                )
              })
            )}
          </ul>
          {activity.length > 0 ? (
            <div className="mt-5 border-t border-slate-100 pt-5">
              <Link
                to="/app/activity"
                className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
              >
                Se hele aktivitetsloggen
              </Link>
            </div>
          ) : null}
        </div>
        </div>
      </div>
    </AppPageLayout>
  )
}

function DashTile({
  to,
  title,
  subtitle,
  value,
  valueClass,
  scope,
}: {
  to: string
  title: string
  subtitle: string
  value: string
  valueClass: string
  scope: 'periode' | 'total' | 'måned'
}) {
  const scopeStyle =
    scope === 'periode'
      ? 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-100'
      : scope === 'måned'
        ? 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-100'
        : 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200'
  const scopeLabel =
    scope === 'periode' ? 'Periode' : scope === 'måned' ? 'Denne måned' : 'Total'
  return (
    <Link
      to={to}
      className="group flex min-h-[8.5rem] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition active:scale-[0.99] hover:border-indigo-200 hover:shadow-md md:min-h-[9rem] md:p-6"
    >
      <div className="flex items-start justify-between gap-1">
        <span className="text-sm font-semibold text-slate-900">{title}</span>
        <span className="text-slate-300 group-hover:text-indigo-600">›</span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${scopeStyle}`}>
          {scopeLabel}
        </span>
        <span className="text-xs leading-relaxed text-slate-500">{subtitle}</span>
      </div>
      <div className={`mt-4 text-lg font-bold tabular-nums leading-tight md:text-xl ${valueClass}`}>
        {value}
      </div>
    </Link>
  )
}
