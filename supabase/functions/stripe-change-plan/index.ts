import { serveWithSentry } from '../_shared/sentry.ts'
import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { fetchAuthV1User } from '../_shared/authV1User.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

function stripeErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: string }).message)
  }
  if (err instanceof Error) return err.message
  return String(err)
}

serveWithSentry('stripe-change-plan', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const stripeSecret = (Deno.env.get('STRIPE_SECRET_KEY') ?? '').trim()
  if (!stripeSecret) {
    return jsonResponse({ error: 'STRIPE_SECRET_KEY mangler.' }, 500)
  }
  const stripe = new Stripe(stripeSecret, {
    apiVersion: '2024-11-20.acacia',
    httpClient: Stripe.createFetchHttpClient(),
  })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401)
    const auth = await fetchAuthV1User(supabaseUrl, anon, authHeader)
    if (!auth.ok) return jsonResponse({ error: 'Unauthorized' }, 401)

    let body: { company_id?: string; billing_plan_id?: string }
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Invalid JSON' }, 400)
    }
    const companyId = body.company_id?.trim()
    const billingPlanId = body.billing_plan_id?.trim()
    if (!companyId || !billingPlanId) {
      return jsonResponse({ error: 'company_id og billing_plan_id er påkrævet' }, 400)
    }

    const admin = createClient(supabaseUrl, serviceKey)
    const { data: member, error: memberErr } = await admin
      .from('company_members')
      .select('role')
      .eq('company_id', companyId)
      .eq('user_id', auth.user.id)
      .maybeSingle()
    if (memberErr || !member) return jsonResponse({ error: 'Forbidden' }, 403)

    const { data: plan, error: planErr } = await admin
      .from('billing_plans')
      .select('id, slug, stripe_price_id, monthly_price_cents, active')
      .eq('id', billingPlanId)
      .eq('active', true)
      .maybeSingle()
    if (planErr || !plan) return jsonResponse({ error: 'Planen findes ikke eller er ikke aktiv.' }, 404)

    const { data: subRow, error: subErr } = await admin
      .from('subscriptions')
      .select('stripe_subscription_id, stripe_price_id, billing_plan_id, status')
      .eq('company_id', companyId)
      .maybeSingle()
    if (subErr || !subRow?.stripe_subscription_id) {
      return jsonResponse({ error: 'Virksomheden har ikke et aktivt Stripe-abonnement at skifte.' }, 400)
    }
    if (subRow.billing_plan_id === plan.id) {
      return jsonResponse({ message: 'Planen er allerede aktiv.' })
    }

    const subscription = await stripe.subscriptions.retrieve(subRow.stripe_subscription_id)
    if (subscription.status === 'canceled' || subscription.status === 'incomplete_expired') {
      return jsonResponse({ error: 'Abonnementet er ikke aktivt og kan ikke skiftes.' }, 400)
    }

    if (!plan.stripe_price_id) {
      await stripe.subscriptions.update(subscription.id, {
        cancel_at_period_end: true,
        metadata: {
          ...subscription.metadata,
          company_id: companyId,
          requested_billing_plan_id: plan.id,
        },
      })
      return jsonResponse({
        message:
          'Nedgradering til gratis er planlagt til periodens slut. Betalte funktioner beholdes indtil da.',
      })
    }

    const item = subscription.items.data[0]
    if (!item) return jsonResponse({ error: 'Abonnementet mangler en Stripe subscription item.' }, 400)

    const updated = await stripe.subscriptions.update(subscription.id, {
      cancel_at_period_end: false,
      proration_behavior: 'create_prorations',
      items: [{ id: item.id, price: plan.stripe_price_id }],
      metadata: {
        ...subscription.metadata,
        company_id: companyId,
        billing_plan_id: plan.id,
      },
    })

    await admin
      .from('subscriptions')
      .update({
        stripe_price_id: plan.stripe_price_id,
        billing_plan_id: plan.id,
        status: updated.status,
        current_period_end: updated.current_period_end
          ? new Date(updated.current_period_end * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      })
      .eq('company_id', companyId)

    return jsonResponse({ message: 'Planen er opdateret.' })
  } catch (e) {
    const msg = stripeErrorMessage(e)
    console.error('stripe-change-plan error', msg, e)
    return jsonResponse({ error: msg }, 500)
  }
})
