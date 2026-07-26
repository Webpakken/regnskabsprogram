import { useCallback, useEffect, useMemo, useState } from 'react'
import { SortableTh } from '@/components/SortableTh'
import { nextColumnSortState, type ColumnSortDir } from '@/lib/tableSort'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '@/context/AppProvider'
import type { Database } from '@/types/database'
import { supabase } from '@/lib/supabase'
import { formatDate, formatDkk } from '@/lib/format'
import { usePlatformAdminNotifications } from '@/hooks/usePlatformAdminNotifications'

type Company = Database['public']['Tables']['companies']['Row']

type CompanySortKey = 'name' | 'cvr' | 'created' | 'plan' | 'charge'

const DAY_MS = 86_400_000
const TRIAL_DAYS = 30

const SUBSCRIPTION_LABELS: Record<string, { label: string; cls: string }> = {
  active: { label: 'Aktiv', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  trialing: { label: 'Prøveperiode', cls: 'bg-indigo-50 text-indigo-700 ring-indigo-100' },
  past_due: { label: 'Forfalden', cls: 'bg-amber-50 text-amber-700 ring-amber-100' },
  unpaid: { label: 'Ubetalt', cls: 'bg-rose-50 text-rose-700 ring-rose-100' },
  canceled: { label: 'Opsagt', cls: 'bg-slate-100 text-slate-600 ring-slate-200' },
  incomplete: { label: 'Ufuldstændig', cls: 'bg-slate-100 text-slate-600 ring-slate-200' },
}

/** Statusser hvor Stripe rent faktisk trækker penge på næste periodeskift. */
const CHARGING_STATUSES = new Set(['active', 'trialing', 'past_due'])

/** Statusser hvor en manglende plan er en datafejl frem for normal tilstand. */
const PLAN_EXPECTED_STATUSES = new Set(['active', 'past_due', 'unpaid'])

type SubscriptionRow = {
  company_id: string
  status: string
  current_period_end: string | null
  billing_plan_id: string | null
  stripe_price_id: string | null
}

type BillingPlanRow = {
  id: string
  name: string
  stripe_price_id: string | null
  monthly_price_cents: number | null
}

/** Abonnementsbilledet for én virksomhed, som det vises i tabellen. */
type CompanyBilling = {
  status: string | null
  planName: string | null
  monthlyPriceCents: number | null
  /** Dato for næste træk. Null når der ikke opkræves. */
  nextChargeIso: string | null
  /** Sat når virksomheden endnu ikke betaler — så viser vi prøveperioden i stedet. */
  trialEndIso: string | null
}

/** Effektiv prøveperiode-slutdato: override hvis sat, ellers created_at + 30 dage. */
function effectiveTrialEnd(company: Company): string {
  if (company.trial_ends_at) return company.trial_ends_at
  return new Date(new Date(company.created_at).getTime() + TRIAL_DAYS * DAY_MS).toISOString()
}

/**
 * Samme opslag som `get_platform_company_detail`: normalt via billing_plan_id,
 * men falder tilbage til stripe_price_id på gamle abonnementer hvor planen
 * aldrig blev koblet på. Uden fallbacken stod de uden plan og pris.
 */
function resolveBilling(
  company: Company,
  sub: SubscriptionRow | undefined,
  plans: BillingPlanRow[],
): CompanyBilling {
  if (!sub) {
    return {
      status: null,
      planName: null,
      monthlyPriceCents: null,
      nextChargeIso: null,
      trialEndIso: effectiveTrialEnd(company),
    }
  }
  const plan =
    plans.find((p) => p.id === sub.billing_plan_id) ??
    (sub.billing_plan_id === null
      ? plans.find((p) => p.stripe_price_id !== null && p.stripe_price_id === sub.stripe_price_id)
      : undefined)
  const charging = CHARGING_STATUSES.has(sub.status)
  return {
    status: sub.status,
    planName: plan?.name ?? null,
    monthlyPriceCents: plan?.monthly_price_cents ?? null,
    nextChargeIso: charging ? sub.current_period_end : null,
    // Opsagte og ufuldstændige abonnementer opkræves ikke — der er
    // prøveperioden stadig den relevante dato at holde øje med.
    trialEndIso: charging ? null : effectiveTrialEnd(company),
  }
}

/** «om 3 dage» / «i dag» / «for 2 dage siden» — relativt til nu. */
function relativeDays(iso: string): string {
  const days = Math.round((new Date(iso).getTime() - Date.now()) / DAY_MS)
  if (days === 0) return 'i dag'
  if (days === 1) return 'i morgen'
  if (days === -1) return 'i går'
  if (days > 0) return `om ${days} dage`
  return `for ${Math.abs(days)} dage siden`
}

function sortCompanies(
  list: Company[],
  billing: Record<string, CompanyBilling>,
  key: CompanySortKey,
  dir: ColumnSortDir,
): Company[] {
  const mul = dir === 'asc' ? 1 : -1
  // Virksomheder uden abonnement/hævning lægges altid nederst, uanset retning —
  // ellers fylder de toppen når man sorterer for at finde de betalende kunder.
  const missingLast = (a: unknown, b: unknown) => (a == null ? 1 : b == null ? -1 : 0)
  return [...list].sort((a, b) => {
    switch (key) {
      case 'name':
        return mul * String(a.name).localeCompare(String(b.name), 'da', { sensitivity: 'base' })
      case 'cvr':
        return mul * String(a.cvr ?? '').localeCompare(String(b.cvr ?? ''), undefined, { numeric: true })
      case 'created':
        return mul * String(a.created_at).localeCompare(String(b.created_at))
      case 'plan': {
        const pa = billing[a.id]?.monthlyPriceCents ?? null
        const pb = billing[b.id]?.monthlyPriceCents ?? null
        if (pa == null || pb == null) return missingLast(pa, pb)
        return mul * (pa - pb)
      }
      case 'charge': {
        const da = billing[a.id]?.nextChargeIso ?? null
        const db = billing[b.id]?.nextChargeIso ?? null
        if (da == null || db == null) return missingLast(da, db)
        return mul * da.localeCompare(db)
      }
      default:
        return 0
    }
  })
}

function SubscriptionCell({
  billing,
  currency,
}: {
  billing: CompanyBilling | undefined
  currency: string | null
}) {
  if (!billing || billing.status === null) {
    return <span className="text-sm text-slate-400">Intet abonnement</span>
  }
  const meta = SUBSCRIPTION_LABELS[billing.status]
  return (
    <div className="flex flex-col gap-1">
      <span
        className={
          'w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ' +
          (meta?.cls ?? 'bg-slate-100 text-slate-600 ring-slate-200')
        }
      >
        {meta?.label ?? billing.status}
      </span>
      {billing.planName ? (
        <span className="text-sm text-slate-900">
          {billing.planName}
          {billing.monthlyPriceCents != null ? (
            <span className="text-slate-500">
              {' · '}
              {formatDkk(billing.monthlyPriceCents, currency ?? 'DKK')}/md.
            </span>
          ) : null}
        </span>
      ) : PLAN_EXPECTED_STATUSES.has(billing.status) ? (
        // Et abonnement der opkræves, men hvor planen ikke kan slås op, er en
        // datafejl — den skal ses. På prøveperiode/ufuldstændig er en manglende
        // plan derimod normalt, og så er badgen nok.
        <span className="text-sm text-amber-700">Ukendt plan</span>
      ) : null}
    </div>
  )
}

function NextChargeCell({ billing }: { billing: CompanyBilling | undefined }) {
  if (!billing) return <span className="text-sm text-slate-400">—</span>

  if (billing.nextChargeIso) {
    // Ligger datoen mere end et døgn bagud, er trækket ikke gennemført og
    // webhooken har ikke rykket perioden frem — det skal falde i øjnene.
    // Et døgns nåde, fordi Stripe opdaterer perioden nogle timer efter
    // periodeskiftet; uden den ville hver kunde blinke rødt på fornyelsesdagen.
    const daysPast = (Date.now() - new Date(billing.nextChargeIso).getTime()) / DAY_MS
    const overdue = daysPast > 1
    return (
      <div className="flex flex-col gap-0.5">
        <span className={`text-sm font-medium ${overdue ? 'text-rose-700' : 'text-slate-900'}`}>
          {formatDate(billing.nextChargeIso)}
        </span>
        <span className={`text-xs ${overdue ? 'text-rose-600' : 'text-slate-500'}`}>
          {billing.status === 'trialing' ? 'første hævning ' : ''}
          {relativeDays(billing.nextChargeIso)}
        </span>
      </div>
    )
  }

  if (billing.trialEndIso) {
    const expired = new Date(billing.trialEndIso).getTime() <= Date.now()
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-sm text-slate-500">Ingen opkrævning</span>
        <span className={`text-xs ${expired ? 'text-rose-600' : 'text-slate-500'}`}>
          prøveperiode {expired ? 'udløb' : 'til'} {formatDate(billing.trialEndIso)}
        </span>
      </div>
    )
  }

  return <span className="text-sm text-slate-400">—</span>
}

export function PlatformCompaniesPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { refresh } = useApp()
  const { markSeen } = usePlatformAdminNotifications()
  const [rows, setRows] = useState<Company[]>([])
  const [billing, setBilling] = useState<Record<string, CompanyBilling>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<CompanySortKey | null>(null)
  const [sortDir, setSortDir] = useState<ColumnSortDir>('desc')
  const requestedCompanyId = searchParams.get('company')

  const displayRows = useMemo(() => {
    if (sortKey === null) return rows
    return sortCompanies(rows, billing, sortKey, sortDir)
  }, [rows, billing, sortKey, sortDir])

  function onSortColumn(col: CompanySortKey) {
    const next = nextColumnSortState(col, sortKey, sortDir, true)
    setSortKey(next.key as CompanySortKey | null)
    setSortDir(next.dir)
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    // Planerne hentes som hel tabel frem for via en join: PostgREST kan ikke
    // udtrykke stripe_price_id-fallbacken, og tabellen er en håndfuld rækker.
    const [companyRes, subRes, planRes] = await Promise.all([
      supabase.from('companies').select('*').order('created_at', { ascending: false }),
      supabase
        .from('subscriptions')
        .select('company_id, status, current_period_end, billing_plan_id, stripe_price_id'),
      supabase.from('billing_plans').select('id, name, stripe_price_id, monthly_price_cents'),
    ])
    setLoading(false)
    if (companyRes.error) {
      setError(companyRes.error.message)
      return
    }
    const companies = companyRes.data ?? []
    setRows(companies)
    const billingErr = subRes.error ?? planRes.error
    if (billingErr) {
      // Abonnementskolonnerne er sekundære — vis listen alligevel med tom
      // billing frem for at fejle hele siden.
      setError(billingErr.message)
      setBilling({})
      return
    }
    const subByCompany = new Map((subRes.data ?? []).map((s) => [s.company_id, s]))
    const plans = planRes.data ?? []
    setBilling(
      Object.fromEntries(
        companies.map((c) => [c.id, resolveBilling(c, subByCompany.get(c.id), plans)]),
      ),
    )
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void markSeen('companies')
    void markSeen('subscriptions')
  }, [markSeen])

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
                <SortableTh
                  label="Navn"
                  isActive={sortKey === 'name'}
                  direction={sortKey === 'name' ? sortDir : null}
                  onClick={() => onSortColumn('name')}
                />
                <SortableTh
                  label="CVR"
                  isActive={sortKey === 'cvr'}
                  direction={sortKey === 'cvr' ? sortDir : null}
                  onClick={() => onSortColumn('cvr')}
                  className="hidden sm:table-cell"
                />
                <SortableTh
                  label="Abonnement"
                  isActive={sortKey === 'plan'}
                  direction={sortKey === 'plan' ? sortDir : null}
                  onClick={() => onSortColumn('plan')}
                />
                <SortableTh
                  label="Næste hævning"
                  isActive={sortKey === 'charge'}
                  direction={sortKey === 'charge' ? sortDir : null}
                  onClick={() => onSortColumn('charge')}
                />
                <SortableTh
                  label="Oprettet"
                  isActive={sortKey === 'created'}
                  direction={sortKey === 'created' ? sortDir : null}
                  onClick={() => onSortColumn('created')}
                  className="hidden md:table-cell"
                />
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Handling
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayRows.map((c) => (
                <tr
                  key={c.id}
                  className={
                    requestedCompanyId === c.id
                      ? 'bg-indigo-50/70 ring-1 ring-inset ring-indigo-200'
                      : 'hover:bg-slate-50/80'
                  }
                >
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => navigate(`/platform/companies/${c.id}`)}
                        className="text-left font-medium text-slate-900 hover:text-indigo-700 hover:underline"
                      >
                        {c.name}
                      </button>
                      <span
                        className={
                          'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ' +
                          (c.entity_type === 'forening'
                            ? 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-100'
                            : 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200')
                        }
                      >
                        {c.entity_type === 'forening' ? 'Forening' : 'Virksomhed'}
                      </span>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">
                    {c.cvr ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <SubscriptionCell billing={billing[c.id]} currency={c.base_currency} />
                  </td>
                  <td className="px-4 py-3">
                    <NextChargeCell billing={billing[c.id]} />
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
