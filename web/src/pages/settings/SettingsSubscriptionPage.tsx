import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { subscriptionOk, useApp } from '@/context/AppProvider'
import { formatDateTime, formatKrPerMonth } from '@/lib/format'
import { subscriptionStatusLabelDa } from '@/lib/subscriptionLabels'
import type { Database } from '@/types/database'
import { changeStripePlan } from '@/lib/edge'
import {
  ButtonSpinner,
  useStripeCheckoutLauncher,
} from '@/lib/useStripeCheckoutLauncher'
import {
  getHideTrialBannerDuringTrial,
  setHideTrialBannerDuringTrial,
} from '@/lib/trialPaymentUiPreference'

export function SettingsSubscriptionPage() {
  const { currentCompany, currentRole, subscription, billingEntitlements, refresh } = useApp()
  const ok = subscriptionOk(subscription)
  const canManageBilling = currentRole === 'owner'
  const [hideTrialBanner, setHideTrialBanner] = useState(getHideTrialBannerDuringTrial)
  const [priceCents, setPriceCents] = useState<number | null>(null)
  const [plans, setPlans] = useState<Database['public']['Tables']['billing_plans']['Row'][]>([])
  const [planBullets, setPlanBullets] = useState<Database['public']['Tables']['billing_plan_bullets']['Row'][]>([])
  const [planNotice, setPlanNotice] = useState<string | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)
  const [changingPlanId, setChangingPlanId] = useState<string | null>(null)
  const priceLabel = priceCents != null ? formatKrPerMonth(priceCents) : null
  const checkout = useStripeCheckoutLauncher()
  const currentPlanId = billingEntitlements[0]?.plan_id ?? subscription?.billing_plan_id ?? null
  const currentPlan = useMemo(
    () => plans.find((plan) => plan.id === currentPlanId) ?? null,
    [currentPlanId, plans],
  )
  const currentPlanPrice = currentPlan?.monthly_price_cents ?? priceCents ?? 0

  useEffect(() => {
    const sync = () => setHideTrialBanner(getHideTrialBannerDuringTrial())
    window.addEventListener('storage', sync)
    window.addEventListener('bilago:trial-banner-pref', sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener('bilago:trial-banner-pref', sync)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [settingsRes, planRes, bulletRes] = await Promise.all([
        supabase
          .from('platform_public_settings')
          .select('pricing_amount_cents, monthly_price_cents')
          .eq('id', 1)
          .maybeSingle(),
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
          .eq('marketing_hidden', false)
          .order('sort_order', { ascending: true }),
      ])
      if (cancelled) return
      const visiblePlans = planRes.data ?? []
      setPlans(visiblePlans)
      setPlanBullets(bulletRes.data ?? [])
      const selectedPlan =
        visiblePlans.find((plan) => plan.id === currentPlanId) ??
        visiblePlans.find((plan) => plan.slug === 'pro') ??
        null
      setPriceCents(
        selectedPlan?.monthly_price_cents ??
          settingsRes.data?.pricing_amount_cents ??
          settingsRes.data?.monthly_price_cents ??
          9900,
      )
    })()
    return () => {
      cancelled = true
    }
  }, [currentPlanId])

  const bulletsByPlan = useMemo(() => {
    const map = new Map<string, Database['public']['Tables']['billing_plan_bullets']['Row'][]>()
    for (const bullet of planBullets) {
      const list = map.get(bullet.plan_id) ?? []
      list.push(bullet)
      map.set(bullet.plan_id, list)
    }
    return map
  }, [planBullets])

  async function choosePlan(plan: Database['public']['Tables']['billing_plans']['Row']) {
    if (!currentCompany || changingPlanId || checkout.loading) return
    setPlanNotice(null)
    setPlanError(null)

    if (!ok || !subscription?.stripe_subscription_id) {
      if (!plan.stripe_price_id) {
        setPlanError('Gratis-planen er allerede tilgængelig uden betaling.')
        return
      }
      await checkout.launch(currentCompany.id, { billingPlanId: plan.id })
      return
    }

    setChangingPlanId(plan.id)
    try {
      const result = await changeStripePlan(currentCompany.id, plan.id)
      setPlanNotice(result.message ?? 'Planen er opdateret.')
      await refresh()
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : 'Kunne ikke skifte plan.')
    } finally {
      setChangingPlanId(null)
    }
  }

  if (!currentCompany) {
    return <p className="text-slate-600">Opret virksomhed under onboarding først.</p>
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">Abonnement</h2>
        <p className="text-sm text-slate-600">
          Status:{' '}
          <span className="font-medium text-slate-900">
            {subscriptionStatusLabelDa(subscription?.status)}
          </span>
        </p>
        {subscription?.current_period_end ? (
          <p className="text-sm text-slate-600">
            Nuværende periode slutter:{' '}
            {formatDateTime(subscription.current_period_end)}
          </p>
        ) : null}
        {priceLabel ? (
          <p className="text-sm text-slate-600">
            Abonnement:{' '}
            <span className="font-medium text-slate-900">{priceLabel}</span>
          </p>
        ) : null}
        {billingEntitlements[0]?.plan_name ? (
          <p className="text-sm text-slate-600">
            Plan:{' '}
            <span className="font-medium text-slate-900">
              {billingEntitlements[0].plan_name}
            </span>
          </p>
        ) : null}
        {!ok && canManageBilling ? (
          <button
            type="button"
            disabled={checkout.loading}
            className="mt-2 inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-80"
            onClick={() =>
              void checkout.launch(currentCompany.id, {
                billingPlanId:
                  plans.find((plan) => plan.monthly_price_cents > 0 && plan.stripe_price_id)?.id,
              })
            }
          >
            {checkout.loading ? <ButtonSpinner /> : null}
            {checkout.loading ? 'Åbner Stripe…' : 'Aktivér abonnement'}
          </button>
        ) : null}
        {!canManageBilling ? (
          <p className="mt-2 text-sm text-slate-500">
            Kun ejeren af virksomheden kan ændre abonnement og betalingsoplysninger.
          </p>
        ) : null}
      </div>

      {plans.length > 0 && canManageBilling ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium text-slate-900">Vælg plan</h2>
              <p className="mt-1 text-sm text-slate-600">
                Se de planer vi tilbyder. Din nuværende plan er markeret.
              </p>
            </div>
          </div>
          {planNotice ? (
            <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              {planNotice}
            </p>
          ) : null}
          {planError ? (
            <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {planError}
            </p>
          ) : null}
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {plans.map((plan) => {
              const isCurrent = plan.id === currentPlanId
              const isChanging = changingPlanId === plan.id || (checkout.loading && !isCurrent)
              const relation =
                plan.monthly_price_cents > currentPlanPrice
                  ? 'Opgrader'
                  : plan.monthly_price_cents < currentPlanPrice
                    ? 'Nedgrader'
                    : 'Skift'
              const bullets = (bulletsByPlan.get(plan.id) ?? []).slice(0, 5)
              return (
                <article
                  key={plan.id}
                  className={
                    'flex flex-col rounded-2xl border p-5 ' +
                    (isCurrent
                      ? 'border-indigo-300 bg-indigo-50/40 ring-1 ring-indigo-200'
                      : 'border-slate-200 bg-white')
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">{plan.name}</h3>
                      {plan.description ? (
                        <p className="mt-1 text-sm leading-relaxed text-slate-600">
                          {plan.description}
                        </p>
                      ) : null}
                    </div>
                    {isCurrent ? (
                      <span className="rounded-full bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white">
                        Nuværende
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-slate-950">
                      {Math.round(plan.monthly_price_cents / 100)}
                    </span>
                    <span className="text-sm font-medium text-slate-500">kr./md.</span>
                  </div>

                  {bullets.length > 0 ? (
                    <ul className="mb-6 mt-5 space-y-3 text-sm text-slate-700">
                      {bullets.map((bullet) => (
                        <li key={bullet.id} className="flex gap-2">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                          <span>{bullet.title}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <button
                    type="button"
                    disabled={isCurrent || isChanging}
                    onClick={() => void choosePlan(plan)}
                    className={
                      'mt-auto inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-70 ' +
                      (isCurrent
                        ? 'bg-slate-100 text-slate-500'
                        : 'bg-indigo-600 text-white hover:bg-indigo-700')
                    }
                  >
                    {isChanging ? <ButtonSpinner /> : null}
                    {isCurrent ? 'Din nuværende plan' : `${relation} til ${plan.name}`}
                  </button>
                </article>
              )
            })}
          </div>
        </div>
      ) : null}

      {billingEntitlements.length > 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-slate-900">Funktioner i din plan</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {billingEntitlements.map((feature) => (
              <div
                key={feature.feature_key}
                className={
                  'rounded-xl border px-3 py-2.5 text-sm ' +
                  (feature.enabled
                    ? 'border-emerald-100 bg-emerald-50 text-emerald-950'
                    : 'border-slate-200 bg-slate-50 text-slate-500')
                }
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">{feature.feature_name}</span>
                  <span className="shrink-0 text-xs">
                    {feature.enabled ? 'Aktiv' : 'Låst'}
                  </span>
                </div>
                {feature.enabled && feature.limit_value !== null ? (
                  <p className="mt-1 text-xs opacity-80">Limit: {feature.limit_value}</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {subscription?.status === 'trialing' ? (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-slate-900">Prøveperiode</h2>
          <p className="text-sm text-slate-600">
            Det lilla banner øverst kan skjules (også via «Skjul banner» i banneret). Den sidste dag før
            udløb vises det igen automatisk. Abonnement kan altid tilføjes herunder.
          </p>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600"
              checked={hideTrialBanner}
              onChange={(e) => {
                const v = e.target.checked
                setHideTrialBannerDuringTrial(v)
                setHideTrialBanner(v)
              }}
            />
            <span className="text-sm text-slate-800">
              Skjul prøvebanner øverst, mens der er mindst én dag tilbage af prøveperioden
            </span>
          </label>
        </div>
      ) : null}
    </div>
  )
}
