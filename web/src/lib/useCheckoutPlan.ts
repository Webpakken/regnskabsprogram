import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppProvider'
import { formatKrPerMonth } from '@/lib/format'
import type { Database } from '@/types/database'

type Plan = Database['public']['Tables']['billing_plans']['Row']

/**
 * Hvilken plan rammer kunden hvis de trykker «Aktivér abonnement» uden selv at
 * vælge? Spejler prioriteringen i Edge Function `stripe-checkout`, så UI'et
 * annoncerer den pris der faktisk bliver trukket — tidligere stod der en
 * hårdkodet listepris i modalen mens backend valgte den billigste plan.
 *
 * RLS eksponerer kun aktive planer, så en låst pris på en deaktiveret plan
 * falder tilbage til default-planen her. Backend har det fulde billede.
 */
export function useCheckoutPlan() {
  const { subscription } = useApp()
  const [plans, setPlans] = useState<Plan[] | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data } = await supabase
        .from('billing_plans')
        .select('*')
        .eq('active', true)
        .order('sort_order', { ascending: true })
        .order('monthly_price_cents', { ascending: true })
      if (!cancelled) setPlans(data ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const lockedPlanId = subscription?.billing_plan_id ?? null
  const lockedPriceId = subscription?.stripe_price_id ?? null

  const plan = useMemo(() => {
    if (!plans?.length) return null
    const paid = plans.filter((p) => p.monthly_price_cents > 0 && p.stripe_price_id)

    // 1) Planen abonnementet allerede er koblet til.
    const byPlanId = lockedPlanId ? plans.find((p) => p.id === lockedPlanId) : undefined
    if (byPlanId) return byPlanId

    // 2) Kundens låste pris fra en tidligere tilmelding.
    const byPrice = lockedPriceId
      ? plans.find((p) => p.stripe_price_id && p.stripe_price_id === lockedPriceId)
      : undefined
    if (byPrice) return byPrice

    // 3) Den plan der er markeret som default for nye tilmeldinger.
    return paid.find((p) => p.is_default_signup) ?? paid[0] ?? null
  }, [plans, lockedPlanId, lockedPriceId])

  return {
    plan,
    loading: plans === null,
    priceLabel: plan ? formatKrPerMonth(plan.monthly_price_cents) : null,
  }
}

/**
 * Har kunden et eksisterende Stripe-abonnement hvor betalingen fejler? Så skal
 * de opdatere kortet i Billing Portal i stedet for at køre checkout igen —
 * ellers står de med to abonnementer hos Stripe.
 */
export function useHasFailingPayment() {
  const { subscription } = useApp()
  return (
    !!subscription?.stripe_subscription_id &&
    (subscription.status === 'past_due' ||
      subscription.status === 'unpaid' ||
      subscription.status === 'incomplete')
  )
}
