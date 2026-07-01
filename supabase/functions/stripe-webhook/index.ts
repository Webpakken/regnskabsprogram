import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { issueSubscriptionInvoice } from '../_shared/subscriptionInvoiceIssue.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-11-20.acacia',
  httpClient: Stripe.createFetchHttpClient(),
})

/** Unix-sekunder → 'YYYY-MM-DD' i København. */
function unixToCphYmd(unixSeconds: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Copenhagen',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(unixSeconds * 1000))
}

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

  async function notifyPlatformActiveSubscription(companyId: string) {
    const secret = Deno.env.get('PLATFORM_EVENT_SECRET')?.trim()
    if (!secret) return
    try {
      await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/platform-event-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-bilago-platform-event': secret,
        },
        body: JSON.stringify({ kind: 'subscription', company_id: companyId }),
      })
    } catch (e) {
      console.warn('platform-event-push subscription notify failed', e)
    }
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      const companyId =
        session.metadata?.company_id ?? session.client_reference_id
      const subId = session.subscription as string | undefined
      const customerId = session.customer as string | undefined
      let billingPlanId = session.metadata?.billing_plan_id || null
      if (companyId && customerId) {
        let periodEnd: string | null = null
        let priceId: string | null = null
        let subStatus: 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete' =
          'active'
        if (subId) {
          const full = await stripe.subscriptions.retrieve(subId)
          subStatus = mapStatus(full.status)
          periodEnd = full.current_period_end
            ? new Date(full.current_period_end * 1000).toISOString()
            : null
          priceId = full.items.data[0]?.price?.id ?? null
          billingPlanId = billingPlanId || full.metadata?.billing_plan_id || null
        }
        if (!billingPlanId && priceId) {
          const { data: plan } = await admin
            .from('billing_plans')
            .select('id')
            .eq('stripe_price_id', priceId)
            .maybeSingle()
          billingPlanId = plan?.id ?? null
        }
        await admin.from('subscriptions').upsert(
          {
            company_id: companyId,
            stripe_customer_id: customerId,
            stripe_subscription_id: subId ?? null,
            stripe_price_id: priceId,
            billing_plan_id: billingPlanId || null,
            status: subStatus,
            current_period_end: periodEnd,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'company_id' },
        )
        if (subStatus === 'active') {
          await notifyPlatformActiveSubscription(companyId)
        }
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
      const priceId = sub.items.data[0]?.price?.id ?? null
      let billingPlanId = sub.metadata?.billing_plan_id || null
      if (!billingPlanId && priceId) {
        const { data: plan } = await admin
          .from('billing_plans')
          .select('id')
          .eq('stripe_price_id', priceId)
          .maybeSingle()
        billingPlanId = plan?.id ?? null
      }
      const { data: prevRow } = await admin
        .from('subscriptions')
        .select('status')
        .eq('company_id', companyId)
        .maybeSingle()
      await admin
        .from('subscriptions')
        .update({
          stripe_subscription_id: sub.id,
          stripe_price_id: priceId,
          billing_plan_id: billingPlanId || null,
          status,
          current_period_end: sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        })
        .eq('company_id', companyId)
      if (status === 'active' && prevRow?.status !== 'active') {
        await notifyPlatformActiveSubscription(companyId)
      }
    }

    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object as Stripe.Invoice
      const subscriptionId =
        typeof invoice.subscription === 'string'
          ? invoice.subscription
          : (invoice.subscription?.id ?? null)
      const customerId =
        typeof invoice.customer === 'string'
          ? invoice.customer
          : (invoice.customer?.id ?? null)
      const amountPaid = invoice.amount_paid ?? 0
      // Kun abonnements-hævninger med reelt beløb (springer $0-prøveperioder over).
      if (subscriptionId && customerId && amountPaid > 0 && invoice.id) {
        const { data: subRow } = await admin
          .from('subscriptions')
          .select('company_id')
          .eq('stripe_customer_id', customerId)
          .maybeSingle()
        let companyId = subRow?.company_id ?? null
        // Første hævning kan nå frem før abonnementsrækken er oprettet af
        // checkout.session.completed — fald tilbage til Stripe-metadata.
        if (!companyId) {
          try {
            const fullSub = await stripe.subscriptions.retrieve(subscriptionId)
            companyId = fullSub.metadata?.company_id ?? null
          } catch (e) {
            console.warn('subscription retrieve for company_id failed', e)
          }
        }
        if (companyId) {
          const paidAtUnix = invoice.status_transitions?.paid_at ?? invoice.created
          const linePeriod = invoice.lines?.data?.[0]?.period
          const periodStartUnix = linePeriod?.start ?? invoice.period_start ?? null
          const periodEndUnix = linePeriod?.end ?? invoice.period_end ?? null
          const result = await issueSubscriptionInvoice(admin, {
            stripeInvoiceId: invoice.id,
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            companyId,
            currency: (invoice.currency ?? 'dkk').toUpperCase(),
            grossCents: amountPaid,
            paidDateYmd: unixToCphYmd(paidAtUnix),
            periodStartYmd: periodStartUnix ? unixToCphYmd(periodStartUnix) : null,
            periodEndYmd: periodEndUnix ? unixToCphYmd(periodEndUnix) : null,
            recipientEmail: invoice.customer_email ?? null,
          })
          if (!result.ok) {
            console.error('subscription-invoice issue failed', result.reason)
          }
        }
      }
    }
  } catch (e) {
    console.error(e)
    return new Response('Handler error', { status: 500 })
  }

  return new Response('ok', { status: 200 })
})
