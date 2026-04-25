import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatKrPerMonth } from '@/lib/format'
import {
  PRICING_DEFAULTS,
  resolveFeatureItems,
} from '@/lib/pricingPublicDefaults'
import { resolvePricingCornerBadge } from '@/lib/pricingCornerBadge'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { PricingCard } from '@/components/PricingCard'
import type { Database } from '@/types/database'

type PublicSettings = Database['public']['Tables']['platform_public_settings']['Row']
type BillingPlan = Database['public']['Tables']['billing_plans']['Row']
type BillingPlanBullet = Database['public']['Tables']['billing_plan_bullets']['Row']

type MarketingBullet = {
  id: string
  kind: 'feature' | 'text' | 'heading'
  featureId: string | null
  title: string
  subtitle: string | null
  sortOrder: number
}

type MarketingPlan = BillingPlan & {
  bullets: MarketingBullet[]
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
      const [planRes, bulletRes] = await Promise.all([
        supabase
          .from('billing_plans')
          .select('*')
          .eq('active', true)
          .eq('marketing_hidden', false)
          .order('sort_order', { ascending: true })
          .order('monthly_price_cents', { ascending: true }),
        supabase
          .from('billing_plan_bullets')
          .select('*')
          .order('sort_order', { ascending: true }),
      ])
      if (cancelled || planRes.error || bulletRes.error) return
      const bulletsByPlan = new Map<string, MarketingBullet[]>()
      for (const row of (bulletRes.data ?? []) as BillingPlanBullet[]) {
        const list = bulletsByPlan.get(row.plan_id) ?? []
        list.push({
          id: row.id,
          kind: row.kind,
          featureId: row.feature_id,
          title: row.title,
          subtitle: row.subtitle,
          sortOrder: row.sort_order,
        })
        bulletsByPlan.set(row.plan_id, list)
      }
      setPlans(
        ((planRes.data ?? []) as BillingPlan[]).map((plan) => ({
          ...plan,
          bullets: bulletsByPlan.get(plan.id) ?? [],
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
            const planCornerLabel =
              plan.slug === 'pro'
                ? cornerLabel || 'Mest værdi'
                : plan.is_default_free
                  ? 'Start her'
                  : null
            const previousPlan = index > 0 ? visiblePlans[index - 1] : null
            return (
              <PricingCard
                key={plan.id}
                plan={plan}
                bullets={plan.bullets.map((b) => ({
                  id: b.id,
                  kind: b.kind,
                  featureId: b.featureId,
                  title: b.title,
                  subtitle: b.subtitle,
                }))}
                previousPlan={
                  previousPlan
                    ? {
                        name: previousPlan.name,
                        bullets: previousPlan.bullets.map((b) => ({
                          id: b.id,
                          kind: b.kind,
                          featureId: b.featureId,
                          title: b.title,
                          subtitle: b.subtitle,
                        })),
                      }
                    : null
                }
                badge={badge}
                unit={unit}
                lockLabel={lockLabel}
                cta={cta}
                cornerLabel={planCornerLabel}
              />
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
