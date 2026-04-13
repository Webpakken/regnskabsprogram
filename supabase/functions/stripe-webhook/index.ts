import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-11-20.acacia',
  httpClient: Stripe.createFetchHttpClient(),
})

function mapStatus(
  s: Stripe.Subscription.Status,
): 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete' {
  switch (s) {
    case 'trialing':
      return 'trialing'
    case 'active':
      return 'active'
    case 'past_due':
      return 'past_due'
    case 'canceled':
    case 'unpaid':
      return s
    default:
      return 'incomplete'
  }
}

serve(async (req) => {
  const sig = req.headers.get('stripe-signature')
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  const body = await req.text()

  if (!sig || !secret) {
    return new Response('Missing signature config', { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, secret)
  } catch (e) {
    console.error(e)
    return new Response('Invalid signature', { status: 400 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      const companyId =
        session.metadata?.company_id ?? session.client_reference_id
      const subId = session.subscription as string | undefined
      const customerId = session.customer as string | undefined
      if (companyId && customerId) {
        let periodEnd: string | null = null
        let subStatus: 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete' =
          'active'
        if (subId) {
          const full = await stripe.subscriptions.retrieve(subId)
          subStatus = mapStatus(full.status)
          periodEnd = full.current_period_end
            ? new Date(full.current_period_end * 1000).toISOString()
            : null
        }
        await admin.from('subscriptions').upsert(
          {
            company_id: companyId,
            stripe_customer_id: customerId,
            stripe_subscription_id: subId ?? null,
            status: subStatus,
            current_period_end: periodEnd,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'company_id' },
        )
      }
    }

    if (
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      const sub = event.data.object as Stripe.Subscription
      const companyId = sub.metadata?.company_id
      if (!companyId) {
        return new Response('ok', { status: 200 })
      }
      const status =
        event.type === 'customer.subscription.deleted'
          ? 'canceled'
          : mapStatus(sub.status)
      await admin
        .from('subscriptions')
        .update({
          stripe_subscription_id: sub.id,
          status,
          current_period_end: sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        })
        .eq('company_id', companyId)
    }
  } catch (e) {
    console.error(e)
    return new Response('Handler error', { status: 500 })
  }

  return new Response('ok', { status: 200 })
})
