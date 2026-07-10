// Platform-staff: hent en virksomheds betalinger direkte fra Stripe, så staff
// kan se HVORNÅR kunden har betalt (og fornyelsesdato), selv når den lokale
// historik-tabel er tom. To handlinger:
//   action 'read'     → læs abonnement + betalinger fra Stripe (ingen bivirkninger),
//                       opdaterer samtidig subscriptions.current_period_end lokalt.
//   action 'backfill' → udsteder desuden rigtige Bilago-fakturaer for hver betaling
//                       (opretter bilag + MAILER kvittering til kunden). Idempotent.
import { serveWithSentry } from '../_shared/sentry.ts'
import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { fetchAuthV1User } from '../_shared/authV1User.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { issueSubscriptionInvoice } from '../_shared/subscriptionInvoiceIssue.ts'

function unixToCphYmd(unixSeconds: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Copenhagen',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(unixSeconds * 1000))
}

serveWithSentry('platform-stripe-billing', async (req) => {
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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401)
  const auth = await fetchAuthV1User(supabaseUrl, anon, authHeader)
  if (!auth.ok) return jsonResponse({ error: 'Unauthorized' }, 401)

  const admin = createClient(supabaseUrl, serviceKey)

  let body: { company_id?: string; action?: 'read' | 'backfill' }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }
  const companyId = body.company_id?.trim()
  const action = body.action === 'backfill' ? 'backfill' : 'read'
  if (!companyId) return jsonResponse({ error: 'company_id er påkrævet' }, 400)

  // Autorisation: platform-staff må se alt; et virksomhedsmedlem må kun læse
  // sin egen virksomheds betalinger. Backfill (mailer kunden) er staff-only.
  const { data: staff } = await admin
    .from('platform_staff')
    .select('user_id')
    .eq('user_id', auth.user.id)
    .maybeSingle()
  const isStaff = Boolean(staff)
  if (!isStaff) {
    if (action === 'backfill') return jsonResponse({ error: 'Forbidden' }, 403)
    const { data: member } = await admin
      .from('company_members')
      .select('user_id')
      .eq('company_id', companyId)
      .eq('user_id', auth.user.id)
      .maybeSingle()
    if (!member) return jsonResponse({ error: 'Forbidden' }, 403)
  }

  const { data: subRow } = await admin
    .from('subscriptions')
    .select('stripe_customer_id, stripe_subscription_id')
    .eq('company_id', companyId)
    .maybeSingle()
  const customerId = subRow?.stripe_customer_id ?? null
  if (!customerId) {
    return jsonResponse({ subscription: null, payments: [], issued: 0, skipped: 0 })
  }

  // 1. Frisk abonnements-status + fornyelsesdato fra Stripe.
  let currentPeriodEnd: string | null = null
  let status: string | null = null
  if (subRow?.stripe_subscription_id) {
    try {
      const full = await stripe.subscriptions.retrieve(subRow.stripe_subscription_id)
      status = full.status
      currentPeriodEnd = full.current_period_end
        ? new Date(full.current_period_end * 1000).toISOString()
        : null
      if (currentPeriodEnd) {
        await admin
          .from('subscriptions')
          .update({ current_period_end: currentPeriodEnd, updated_at: new Date().toISOString() })
          .eq('company_id', companyId)
      }
    } catch (e) {
      console.warn('subscription retrieve failed', e)
    }
  }

  // 2. Betalte fakturaer fra Stripe (nyeste først).
  const list = await stripe.invoices.list({ customer: customerId, status: 'paid', limit: 100 })
  const payments = list.data
    .filter((inv) => (inv.amount_paid ?? 0) > 0)
    .map((inv) => {
      const paidUnix = inv.status_transitions?.paid_at ?? inv.created
      const period = inv.lines?.data?.[0]?.period
      return {
        id: inv.id,
        invoice_number: inv.number ?? inv.id,
        gross_cents: inv.amount_paid ?? 0,
        currency: (inv.currency ?? 'dkk').toUpperCase(),
        paid_at: new Date(paidUnix * 1000).toISOString(),
        period_start: (period?.start ?? inv.period_start)
          ? new Date((period?.start ?? inv.period_start) * 1000).toISOString()
          : null,
        period_end: (period?.end ?? inv.period_end)
          ? new Date((period?.end ?? inv.period_end) * 1000).toISOString()
          : null,
        hosted_invoice_url: inv.hosted_invoice_url ?? null,
        invoice_pdf: inv.invoice_pdf ?? null,
      }
    })

  // 3. Backfill: udsted rigtige Bilago-fakturaer (opretter bilag + mailer kunden).
  let issued = 0
  let skipped = 0
  if (action === 'backfill') {
    for (const inv of list.data) {
      const amountPaid = inv.amount_paid ?? 0
      if (amountPaid <= 0 || !inv.id) continue
      const subId =
        typeof inv.subscription === 'string' ? inv.subscription : (inv.subscription?.id ?? null)
      const paidUnix = inv.status_transitions?.paid_at ?? inv.created
      const period = inv.lines?.data?.[0]?.period
      const startUnix = period?.start ?? inv.period_start ?? null
      const endUnix = period?.end ?? inv.period_end ?? null
      const result = await issueSubscriptionInvoice(admin, {
        stripeInvoiceId: inv.id,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subId,
        companyId,
        currency: (inv.currency ?? 'dkk').toUpperCase(),
        grossCents: amountPaid,
        paidDateYmd: unixToCphYmd(paidUnix),
        periodStartYmd: startUnix ? unixToCphYmd(startUnix) : null,
        periodEndYmd: endUnix ? unixToCphYmd(endUnix) : null,
        recipientEmail: inv.customer_email ?? null,
      })
      if (result.ok && result.skipped) skipped++
      else if (result.ok) issued++
    }
  }

  return jsonResponse({
    subscription: { status, current_period_end: currentPeriodEnd },
    payments,
    issued,
    skipped,
  })
})
