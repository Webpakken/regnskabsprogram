import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { subscriptionOk, useApp } from '@/context/AppProvider'
import { formatDateTime, formatKrPerMonth } from '@/lib/format'
import { subscriptionStatusLabelDa } from '@/lib/subscriptionLabels'
import type { Database } from '@/types/database'
import {
  ButtonSpinner,
  useStripeCheckoutLauncher,
} from '@/lib/useStripeCheckoutLauncher'
import {
  getHideTrialBannerDuringTrial,
  setHideTrialBannerDuringTrial,
} from '@/lib/trialPaymentUiPreference'

export function SettingsSubscriptionPage() {
  const { currentCompany, subscription, billingEntitlements } = useApp()
  const ok = subscriptionOk(subscription)
  const [hideTrialBanner, setHideTrialBanner] = useState(getHideTrialBannerDuringTrial)
  const [priceCents, setPriceCents] = useState<number | null>(null)
  const [proPlan, setProPlan] = useState<Database['public']['Tables']['billing_plans']['Row'] | null>(null)
  const priceLabel = priceCents != null ? formatKrPerMonth(priceCents) : null
  const checkout = useStripeCheckoutLauncher()

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
      const { data } = await supabase
        .from('platform_public_settings')
        .select('pricing_amount_cents, monthly_price_cents')
        .eq('id', 1)
        .maybeSingle()
      const { data: plan } = await supabase
        .from('billing_plans')
        .select('*')
        .eq('slug', 'pro')
        .eq('active', true)
        .maybeSingle()
      if (cancelled) return
      setProPlan(plan ?? null)
      setPriceCents(plan?.monthly_price_cents ?? data?.pricing_amount_cents ?? data?.monthly_price_cents ?? 9900)
    })()
    return () => {
      cancelled = true
    }
  }, [])

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
        {!ok ? (
          <button
            type="button"
            disabled={checkout.loading}
            className="mt-2 inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-80"
            onClick={() =>
              void checkout.launch(currentCompany.id, {
                billingPlanId: proPlan?.id,
              })
            }
          >
            {checkout.loading ? <ButtonSpinner /> : null}
            {checkout.loading ? 'Åbner Stripe…' : 'Aktivér abonnement'}
          </button>
        ) : null}
      </div>

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
