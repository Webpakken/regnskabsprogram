import { Link } from 'react-router-dom'
import { formatKrPerMonth } from '@/lib/format'
import type { Database } from '@/types/database'

type BillingPlan = Database['public']['Tables']['billing_plans']['Row']

export type PricingCardBullet = {
  id: string
  kind: 'feature' | 'text' | 'heading'
  featureId: string | null
  title: string
  subtitle: string | null
}

export type PricingCardPlan = Pick<
  BillingPlan,
  'id' | 'name' | 'slug' | 'description' | 'monthly_price_cents' | 'compare_price_cents' | 'is_default_free'
>

export type PricingCardProps = {
  plan: PricingCardPlan
  bullets: PricingCardBullet[]
  previousPlan?: { name: string; bullets: PricingCardBullet[] } | null
  badge: string
  unit: string
  lockLabel: string
  cta: string
  cornerLabel?: string | null
  hrefBase?: string
  asLink?: boolean
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

export function PricingCard({
  plan,
  bullets,
  previousPlan,
  badge,
  unit,
  lockLabel,
  cta,
  cornerLabel,
  hrefBase = '/signup',
  asLink = true,
}: PricingCardProps) {
  const isPaid = plan.monthly_price_cents > 0
  const previousFeatureIds = new Set(
    previousPlan?.bullets.filter((b) => b.kind === 'feature' && b.featureId).map((b) => b.featureId as string) ?? [],
  )
  const visibleBullets = previousPlan
    ? bullets.filter((b) => !(b.kind === 'feature' && b.featureId && previousFeatureIds.has(b.featureId)))
    : bullets

  const ctaClass =
    'mt-auto flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold shadow-sm transition ' +
    (isPaid
      ? 'bg-indigo-600 text-white hover:bg-indigo-700'
      : 'border border-slate-200 bg-white text-slate-900 hover:bg-slate-50')

  const ctaContent = (
    <>
      {isPaid ? cta : 'Start gratis'} <span aria-hidden>→</span>
    </>
  )

  return (
    <div
      className={
        'relative flex h-full flex-col rounded-2xl border bg-white p-5 text-left shadow-lg sm:p-6 ' +
        (isPaid ? 'border-indigo-200 shadow-indigo-100/50' : 'border-slate-200 shadow-slate-100/70')
      }
    >
      {cornerLabel ? (
        <span className="mb-3 block w-fit rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-200 sm:absolute sm:right-4 sm:top-4 sm:mb-0">
          {cornerLabel}
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

      <h3 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">{plan.name}</h3>
      {plan.description ? (
        <p className="mt-2 min-h-10 text-sm leading-relaxed text-slate-600">{plan.description}</p>
      ) : null}

      {plan.compare_price_cents != null && plan.compare_price_cents > plan.monthly_price_cents ? (
        <div className="mt-4 text-sm text-slate-400">
          <span className="line-through">{formatKrPerMonth(plan.compare_price_cents)}</span>
        </div>
      ) : null}
      <div
        className={
          'flex items-baseline gap-2 ' +
          (plan.compare_price_cents != null && plan.compare_price_cents > plan.monthly_price_cents ? 'mt-1' : 'mt-5')
        }
      >
        <span
          className={
            isPaid
              ? 'text-5xl font-bold tracking-tight text-indigo-600'
              : 'text-4xl font-bold tracking-tight text-slate-900'
          }
        >
          {Math.round(plan.monthly_price_cents / 100)}
        </span>
        <span
          className={
            isPaid ? 'text-sm font-medium text-indigo-500' : 'text-sm font-medium text-slate-500'
          }
        >
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
        {visibleBullets.map((b) =>
          b.kind === 'heading' ? (
            <li key={b.id} className="py-2.5">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {b.title}
              </div>
            </li>
          ) : (
            <li key={b.id} className="flex items-start gap-3 py-2.5">
              <CheckCircle className="h-5 w-5" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900">{b.title}</div>
                {b.subtitle ? (
                  <div className="mt-0.5 text-xs text-slate-500">{b.subtitle}</div>
                ) : null}
              </div>
            </li>
          ),
        )}
      </ul>

      {asLink ? (
        <Link to={`${hrefBase}?plan=${encodeURIComponent(plan.slug)}`} className={ctaClass}>
          {ctaContent}
        </Link>
      ) : (
        <div className={ctaClass + ' pointer-events-none'} aria-hidden>
          {ctaContent}
        </div>
      )}
    </div>
  )
}
