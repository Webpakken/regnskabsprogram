import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { resolveAppPublicUrl } from '../_shared/appUrl.ts'
import { fetchAuthV1User } from '../_shared/authV1User.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

function stripeErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: string }).message)
  }
  if (err instanceof Error) return err.message
  return String(err)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const stripeSecret = (Deno.env.get('STRIPE_SECRET_KEY') ?? '').trim()
  const priceId = (Deno.env.get('STRIPE_PRICE_ID') ?? '').trim()
  if (!stripeSecret) {
    return jsonResponse(
      {
        error:
          'STRIPE_SECRET_KEY mangler. Sæt secret under Supabase → Project Settings → Edge Functions, deploy stripe-checkout igen.',
      },
      500,
    )
  }
  if (!priceId) {
    return jsonResponse(
      {
        error:
          'STRIPE_PRICE_ID mangler. Sæt Price ID (price_…) fra Stripe Dashboard under Edge Function secrets.',
      },
      500,
    )
  }

  const stripe = new Stripe(stripeSecret, {
    apiVersion: '2024-11-20.acacia',
    httpClient: Stripe.createFetchHttpClient(),
  })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const appUrl = resolveAppPublicUrl()

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const auth = await fetchAuthV1User(supabaseUrl, anon, authHeader)
    if (!auth.ok) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }
    const user = auth.user

    let body: { company_id?: string; return_path?: 'dashboard' | 'onboarding'; billing_plan_id?: string }
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Invalid JSON' }, 400)
    }
    const companyId = body.company_id
    if (!companyId) {
      return jsonResponse({ error: 'company_id required' }, 400)
    }
    const returnPath = body.return_path === 'onboarding' ? 'onboarding' : 'dashboard'
    const billingPlanId = typeof body.billing_plan_id === 'string' ? body.billing_plan_id.trim() : ''

    const admin = createClient(supabaseUrl, serviceKey)

    const { data: member, error: memErr } = await admin
      .from('company_members')
      .select('role')
      .eq('company_id', companyId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (memErr || !member) {
      return jsonResponse({ error: 'Forbidden' }, 403)
    }

    const { data: company } = await admin
      .from('companies')
      .select('name')
      .eq('id', companyId)
      .single()

    const { data: subRow } = await admin
      .from('subscriptions')
      .select('stripe_customer_id, stripe_price_id')
      .eq('company_id', companyId)
      .maybeSingle()

    let customerId = subRow?.stripe_customer_id as string | undefined
    // Verificer at en gemt customer faktisk findes i Stripe — typisk fejl efter
    // test→live-skift hvor DB-rækken peger på en customer der kun findes i test mode.
    if (customerId) {
      try {
        const existing = await stripe.customers.retrieve(customerId)
        if ((existing as { deleted?: boolean }).deleted) {
          customerId = undefined
        }
      } catch (e) {
        const msg = stripeErrorMessage(e).toLowerCase()
        if (msg.includes('no such customer') || msg.includes('resource_missing')) {
          customerId = undefined
        } else {
          throw e
        }
      }
    }
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        name: company?.name,
        metadata: { company_id: companyId, user_id: user.id },
      })
      customerId = customer.id
      await admin.from('subscriptions').upsert(
        {
          company_id: companyId,
          stripe_customer_id: customerId,
          stripe_subscription_id: null,
          stripe_price_id: null,
          billing_plan_id: null,
          status: 'incomplete',
          current_period_end: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'company_id' },
      )
    }

    // Prislås: hvis virksomheden tidligere har haft en subscription, brug det
    // oprindelige stripe_price_id — så de bevarer den pris de tilmeldte sig med,
    // også efter kort-lapse eller kortere opsigelse. Nye kunder får env-var prisen.
    let checkoutPriceId = priceId
    let checkoutBillingPlanId: string | null = null
    if (billingPlanId) {
      const { data: plan, error: planErr } = await admin
        .from('billing_plans')
        .select('id, stripe_price_id, active')
        .eq('id', billingPlanId)
        .eq('active', true)
        .maybeSingle()
      if (planErr || !plan?.stripe_price_id) {
        return jsonResponse({ error: 'Den valgte plan mangler et aktivt Stripe Price ID.' }, 400)
      }
      checkoutPriceId = plan.stripe_price_id
      checkoutBillingPlanId = plan.id
    }
    const lockedPriceId = subRow?.stripe_price_id as string | undefined
    if (!checkoutBillingPlanId && lockedPriceId) {
      try {
        const lockedPrice = await stripe.prices.retrieve(lockedPriceId)
        if (lockedPrice.active) {
          checkoutPriceId = lockedPriceId
        }
      } catch (e) {
        console.warn('stripe-checkout locked price retrieve failed', stripeErrorMessage(e))
      }
    }

    const afterStripeBase =
      returnPath === 'onboarding'
        ? `${appUrl}/onboarding`
        : `${appUrl}/app/dashboard`

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: checkoutPriceId, quantity: 1 }],
      success_url: `${afterStripeBase}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${afterStripeBase}?checkout=cancel`,
      client_reference_id: companyId,
      subscription_data: {
        metadata: {
          company_id: companyId,
          billing_plan_id: checkoutBillingPlanId ?? '',
        },
      },
      metadata: {
        company_id: companyId,
        billing_plan_id: checkoutBillingPlanId ?? '',
      },
    })

    return jsonResponse({ url: session.url })
  } catch (e) {
    const msg = stripeErrorMessage(e)
    console.error('stripe-checkout error', msg, e)
    return jsonResponse({ error: msg }, 500)
  }
})
