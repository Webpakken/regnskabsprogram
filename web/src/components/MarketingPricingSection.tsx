import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatKrPerMonth } from '@/lib/format'
import {
  PRICING_DEFAULTS,
  resolveFeatureItems,
} from '@/lib/pricingPublicDefaults'
import { resolvePricingCornerBadge } from '@/lib/pricingCornerBadge'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type PublicSettings = Database['public']['Tables']['platform_public_settings']['Row']
type BillingPlan = Database['public']['Tables']['billing_plans']['Row']
type BillingFeature = Database['public']['Tables']['billing_features']['Row']
type BillingPlanFeature = Database['public']['Tables']['billing_plan_features']['Row']

type MarketingPlan = BillingPlan & {
  features: Array<{
    key: string
    name: string
    description: string | null
    limitValue: number | null
    sortOrder: number
    firstTierIndex: number
  }>
}

function CheckCircle({ className }: { className?: string }) {
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ${className ?? ''}`}
    >
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="m5 12 5 5 9-11" />
      </svg>
    </span>
  )
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="4" y="10" width="16" height="11" rx="2.5" />
      <path d="M8 10V7a4 4 0 1 1 8 0v3" />
    </svg>
  )
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3 4 6v6c0 4.5 3.3 8.5 8 9 4.7-.5 8-4.5 8-9V6z" />
      <path d="m9.5 12 2 2 3.5-4" />
    </svg>
  )
}

function PitchParagraph({
  template,
  beløb,
}: {
  template: string | null | undefined
  beløb: string
}) {
  const raw = template?.trim() || PRICING_DEFAULTS.pitch
  const parts = raw.split('{beløb}')
  return (
    <p className="mt-4 text-sm text-slate-600 sm:text-base">
      {parts.map((part, i) => (
        <Fragment key={i}>
          {part}
          {i < parts.length - 1 ? (
            <strong className="font-semibold text-slate-900">{beløb}</strong>
          ) : null}
        </Fragment>
      ))}
    </p>
  )
}

export function MarketingPricingSection({ pub }: { pub: PublicSettings | null }) {
  const [plans, setPlans] = useState<MarketingPlan[]>([])
  const amountCents =
    pub?.pricing_amount_cents ?? pub?.monthly_price_cents ?? 9900
  const compareCents = pub?.pricing_compare_cents ?? null
  const title = pub?.pricing_title?.trim() || PRICING_DEFAULTS.title
  const subtitle = pub?.pricing_subtitle?.trim() || PRICING_DEFAULTS.subtitle
  const badge = pub?.pricing_badge?.trim() || PRICING_DEFAULTS.badge
  const planName = pub?.pricing_plan_name?.trim() || PRICING_DEFAULTS.planName
  const unit = pub?.pricing_unit_label?.trim() || PRICING_DEFAULTS.unitLabel
  const lockLabel =
    pub?.pricing_lock_label?.trim() || PRICING_DEFAULTS.lockLabel
  const footerLeft =
    pub?.pricing_footer_left?.trim() || PRICING_DEFAULTS.footerLeft
  const footerRight =
    pub?.pricing_footer_right?.trim() || PRICING_DEFAULTS.footerRight
  const cta = pub?.pricing_cta_label?.trim() || PRICING_DEFAULTS.cta
  const features = resolveFeatureItems(pub?.pricing_feature_items)
  const beløb = formatKrPerMonth(amountCents)
  const krWhole = Math.round(amountCents / 100)
  const cornerLabel = resolvePricingCornerBadge({
    customCorner: pub?.pricing_corner_badge,
    compareCents,
    amountCents,
  })

  useEffect(() => {
    if (!isSupabaseConfigured) return
    let cancelled = false
    void (async () => {
      const [planRes, featureRes, planFeatureRes] = await Promise.all([
        supabase
          .from('billing_plans')
          .select('*')
          .eq('active', true)
          .order('sort_order', { ascending: true })
          .order('monthly_price_cents', { ascending: true }),
        supabase
          .from('billing_features')
          .select('*')
          .eq('active', true)
          .order('sort_order', { ascending: true }),
        supabase
          .from('billing_plan_features')
          .select('*')
          .eq('enabled', true),
      ])
      if (cancelled || planRes.error || featureRes.error || planFeatureRes.error) return
      const featureById = new Map((featureRes.data ?? []).map((f: BillingFeature) => [f.id, f]))
      const featuresByPlan = new Map<string, MarketingPlan['features']>()
      for (const row of (planFeatureRes.data ?? []) as BillingPlanFeature[]) {
        const feature = featureById.get(row.feature_id)
        if (!feature) continue
        const list = featuresByPlan.get(row.plan_id) ?? []
        list.push({
          key: feature.key,
          name: feature.name,
          description: feature.description,
          limitValue: row.limit_value,
          sortOrder: feature.sort_order,
        })
        featuresByPlan.set(row.plan_id, list)
      }
      const rawPlans = ((planRes.data ?? []) as BillingPlan[]).map((plan) => ({
        ...plan,
        features: featuresByPlan.get(plan.id) ?? [],
      }))
      const firstTierByKey = new Map<string, number>()
      rawPlans.forEach((plan, index) => {
        for (const f of plan.features) {
          if (!firstTierByKey.has(f.key)) firstTierByKey.set(f.key, index)
        }
      })
      setPlans(
        rawPlans.map((plan, planIndex) => ({
          ...plan,
          features: [...plan.features]
            .map((f) => ({
              ...f,
              firstTierIndex: firstTierByKey.get(f.key) ?? planIndex,
            }))
            .sort((a, b) => {
              if (a.firstTierIndex !== b.firstTierIndex) return a.firstTierIndex - b.firstTierIndex
              return a.sortOrder - b.sortOrder
            }),
        })),
      )
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const visiblePlans = useMemo(() => {
    if (plans.length > 0) return plans
    return []
  }, [plans])

  if (visiblePlans.length > 0) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-16 text-center sm:py-20">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
        <p className="mx-auto mt-3 max-w-2xl text-base text-slate-600 sm:text-lg">{subtitle}</p>

        <div
          className={
            'mx-auto mt-8 grid gap-5 ' +
            (visiblePlans.length === 3
              ? 'lg:grid-cols-3'
              : visiblePlans.length === 2
                ? 'max-w-4xl lg:grid-cols-2'
                : 'max-w-4xl lg:grid-cols-2')
          }
        >
          {visiblePlans.map((plan, index) => {
            const isPaid = plan.monthly_price_cents > 0
            const planCornerLabel =
              plan.slug === 'pro'
                ? cornerLabel || 'Mest værdi'
                : plan.is_default_free
                  ? 'Start her'
                  : null
            const previousPlan = index > 0 ? visiblePlans[index - 1] : null
            const previousKeys = new Set(previousPlan?.features.map((f) => f.key) ?? [])
            const newFeatures = previousPlan
              ? plan.features.filter((f) => !previousKeys.has(f.key))
              : plan.features
            return (
              <div
                key={plan.id}
                className={
                  'relative flex h-full flex-col rounded-2xl border bg-white p-5 text-left shadow-lg sm:p-6 ' +
                  (isPaid
                    ? 'border-indigo-200 shadow-indigo-100/50'
                    : 'border-slate-200 shadow-slate-100/70')
                }
              >
                {planCornerLabel ? (
                  <span className="mb-3 block w-fit rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-200 sm:absolute sm:right-4 sm:top-4 sm:mb-0">
                    {planCornerLabel}
                  </span>
                ) : null}

                <div className="flex items-center">
                  <span
                    className={
                      'inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ring-1 ' +
                      (isPaid
                        ? 'bg-amber-50 text-amber-800 ring-amber-200'
                        : 'bg-slate-50 text-slate-700 ring-slate-200')
                    }
                  >
                    {isPaid ? badge : 'Gratis'}
                  </span>
                </div>

                <h3 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">
                  {plan.name}
                </h3>
                {plan.description ? (
                  <p className="mt-2 min-h-10 text-sm leading-relaxed text-slate-600">
                    {plan.description}
                  </p>
                ) : null}

                {plan.compare_price_cents != null &&
                plan.compare_price_cents > plan.monthly_price_cents ? (
                  <div className="mt-4 text-sm text-slate-400">
                    <span className="line-through">
                      {formatKrPerMonth(plan.compare_price_cents)}
                    </span>
                  </div>
                ) : null}
                <div className={'flex items-baseline gap-2 ' + (plan.compare_price_cents != null && plan.compare_price_cents > plan.monthly_price_cents ? 'mt-1' : 'mt-5')}>
                  <span className={isPaid ? 'text-5xl font-bold tracking-tight text-indigo-600' : 'text-4xl font-bold tracking-tight text-slate-900'}>
                    {Math.round(plan.monthly_price_cents / 100)}
                  </span>
                  <span className={isPaid ? 'text-sm font-medium text-indigo-500' : 'text-sm font-medium text-slate-500'}>
                    {plan.monthly_price_cents === 0 ? 'kr./md.' : unit}
                  </span>
                </div>

                {isPaid ? (
                  <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
                    <LockIcon className="h-3.5 w-3.5" />
                    {lockLabel}
                  </div>
                ) : null}

                <ul className="mb-5 mt-5 divide-y divide-slate-100 border-t border-slate-100">
                  {previousPlan ? (
                    <li className="flex items-start gap-3 py-2.5">
                      <CheckCircle className="h-5 w-5" />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">
                          Alt fra {previousPlan.name} og…
                        </div>
                      </div>
                    </li>
                  ) : null}
                  {newFeatures.map((f) => (
                    <li key={f.key} className="flex items-start gap-3 py-2.5">
                      <CheckCircle className="h-5 w-5" />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">
                          {f.name}
                        </div>
                        {f.description ? (
                          <div className="mt-0.5 text-xs text-slate-500">
                            {f.description}
                          </div>
                        ) : null}
                        {f.limitValue !== null ? (
                          <div className="mt-0.5 text-xs text-slate-500">
                            {f.limitValue} pr. måned
                          </div>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>

                <Link
                  to={`/signup?plan=${encodeURIComponent(plan.slug)}`}
                  className={
                    'mt-auto flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold shadow-sm transition ' +
                    (isPaid
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                      : 'border border-slate-200 bg-white text-slate-900 hover:bg-slate-50')
                  }
                >
                  {isPaid ? cta : 'Start gratis'} <span aria-hidden>→</span>
                </Link>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-24 text-center">
      <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      <p className="mt-4 text-lg text-slate-600">{subtitle}</p>

      <div className="relative mx-auto mt-10 max-w-lg rounded-3xl border-2 border-indigo-200 bg-white p-6 shadow-xl shadow-indigo-100/60 sm:p-10">
        {cornerLabel ? (
          <span className="ml-auto mb-3 block w-fit rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200 sm:absolute sm:right-4 sm:top-4 sm:mb-0">
            {cornerLabel}
          </span>
        ) : null}

        <div className="flex items-center justify-center">
          <span className="inline-flex items-center rounded-full bg-amber-50 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-amber-800 ring-1 ring-amber-200">
            {badge}
          </span>
        </div>

        <div className="mt-6 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          {planName}
        </div>

        {compareCents != null && compareCents > 0 ? (
          <div className="mt-4 text-base text-slate-400 sm:text-lg">
            <span className="line-through">{formatKrPerMonth(compareCents)}</span>
          </div>
        ) : null}

        <div className="mt-2 flex items-baseline justify-center gap-2">
          <span className="text-6xl font-bold tracking-tight text-indigo-600 sm:text-7xl">
            {krWhole}
          </span>
          <span className="text-base font-medium text-indigo-500 sm:text-lg">{unit}</span>
        </div>

        <div className="mt-6 flex justify-center">
          <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">
            <LockIcon className="h-4 w-4" />
            {lockLabel}
          </span>
        </div>

        <PitchParagraph template={pub?.pricing_pitch} beløb={beløb} />

        <ul className="mt-8 divide-y divide-slate-100 border-t border-slate-100">
          {features.map((f, i) => (
            <li key={`${i}-${f.title}`} className="flex items-start gap-4 py-4 text-left">
              <CheckCircle />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 sm:text-base">
                  {f.title}
                </div>
                {f.subtitle ? (
                  <div className="mt-0.5 text-xs text-slate-500 sm:text-sm">{f.subtitle}</div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>

        <Link
          to="/signup"
          className="mt-8 flex items-center justify-center gap-2 rounded-xl bg-indigo-600 py-4 text-base font-semibold text-white shadow-sm transition hover:bg-indigo-700"
        >
          {cta} <span aria-hidden>→</span>
        </Link>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <ShieldIcon className="h-3.5 w-3.5 text-indigo-500" />
            {footerLeft}
          </span>
          <span>{footerRight}</span>
        </div>
      </div>
    </div>
  )
}
