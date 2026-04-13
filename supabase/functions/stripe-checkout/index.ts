import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-11-20.acacia',
  httpClient: Stripe.createFetchHttpClient(),
})

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const priceId = Deno.env.get('STRIPE_PRICE_ID')!
  const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:5173'

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const userClient = createClient(supabaseUrl, anon, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData.user) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  let body: { company_id?: string }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }
  const companyId = body.company_id
  if (!companyId) {
    return jsonResponse({ error: 'company_id required' }, 400)
  }

  const { data: member, error: memErr } = await userClient
    .from('company_members')
    .select('role')
    .eq('company_id', companyId)
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (memErr || !member) {
    return jsonResponse({ error: 'Forbidden' }, 403)
  }

  const admin = createClient(supabaseUrl, serviceKey)

  const { data: company } = await admin
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .single()

  const { data: subRow } = await admin
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('company_id', companyId)
    .maybeSingle()

  let customerId = subRow?.stripe_customer_id as string | undefined
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: userData.user.email ?? undefined,
      name: company?.name,
      metadata: { company_id: companyId, user_id: userData.user.id },
    })
    customerId = customer.id
    await admin.from('subscriptions').upsert(
      {
        company_id: companyId,
        stripe_customer_id: customerId,
        status: 'incomplete',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'company_id' },
    )
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/onboarding?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/onboarding?checkout=cancel`,
    client_reference_id: companyId,
    subscription_data: {
      metadata: { company_id: companyId },
    },
    metadata: { company_id: companyId },
  })

  return jsonResponse({ url: session.url })
})
