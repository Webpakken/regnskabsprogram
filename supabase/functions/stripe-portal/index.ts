import { serveWithSentry } from '../_shared/sentry.ts'
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

/**
 * Stripe Billing Portal — den rigtige vej for en kunde med udløbet/afvist kort.
 * Checkout ville oprette et NYT abonnement ved siden af det gamle past_due;
 * portalen opdaterer betalingsmetoden på det eksisterende, så Stripe kan
 * genforsøge den fejlede faktura uden at kunden får dobbelt abonnement.
 */
serveWithSentry('stripe-portal', async (req) => {
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
    const appUrl = resolveAppPublicUrl()

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401)
    const auth = await fetchAuthV1User(supabaseUrl, anon, authHeader)
    if (!auth.ok) return jsonResponse({ error: 'Unauthorized' }, 401)

    let body: { company_id?: string; return_path?: 'dashboard' | 'settings' }
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Invalid JSON' }, 400)
    }
    const companyId = body.company_id?.trim()
    if (!companyId) return jsonResponse({ error: 'company_id required' }, 400)

    const admin = createClient(supabaseUrl, serviceKey)

    // Portalen kan opsige abonnementet og se alle fakturaer — kun ejeren.
    const { data: member, error: memberErr } = await admin
      .from('company_members')
      .select('role')
      .eq('company_id', companyId)
      .eq('user_id', auth.user.id)
      .maybeSingle()
    if (memberErr || !member) return jsonResponse({ error: 'Forbidden' }, 403)
    if (member.role !== 'owner') {
      return jsonResponse(
        { error: 'Kun virksomhedens ejer kan ændre betalingsoplysninger.' },
        403,
      )
    }

    const { data: subRow } = await admin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('company_id', companyId)
      .maybeSingle()

    const customerId = subRow?.stripe_customer_id as string | undefined
    if (!customerId) {
      return jsonResponse(
        {
          error:
            'Virksomheden har ingen betalingsprofil hos Stripe endnu. Aktivér abonnementet først.',
        },
        400,
      )
    }

    try {
      await stripe.customers.retrieve(customerId)
    } catch (e) {
      const msg = stripeErrorMessage(e).toLowerCase()
      if (msg.includes('no such customer') || msg.includes('resource_missing')) {
        return jsonResponse(
          { error: 'Betalingsprofilen findes ikke længere hos Stripe. Aktivér abonnementet på ny.' },
          400,
        )
      }
      throw e
    }

    const returnUrl =
      body.return_path === 'dashboard'
        ? `${appUrl}/app/dashboard?portal=done`
        : `${appUrl}/app/settings/subscription?portal=done`

    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      })
      return jsonResponse({ url: session.url })
    } catch (e) {
      const msg = stripeErrorMessage(e)
      // Portalen kræver at der er gemt en konfiguration i Stripe Dashboard
      // (Settings → Billing → Customer portal). Uden den fejler create().
      if (msg.toLowerCase().includes('configuration')) {
        return jsonResponse(
          {
            error:
              'Stripe Customer Portal er ikke konfigureret. Gem en konfiguration under Stripe Dashboard → Settings → Billing → Customer portal.',
          },
          400,
        )
      }
      throw e
    }
  } catch (e) {
    const msg = stripeErrorMessage(e)
    console.error('stripe-portal error', msg, e)
    return jsonResponse({ error: msg }, 500)
  }
})
