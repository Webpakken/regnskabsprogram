/**
 * Push-notifikation til alle platform_staff når der sker en relevant event:
 *  - kind='company'      : ny virksomhed oprettet (trigget af DB-trigger via pg_net)
 *  - kind='subscription' : virksomhed har lige aktiveret abonnement (trigget af stripe-webhook)
 *
 * Auth: shared secret i header `x-bilago-platform-event` (matches env PLATFORM_EVENT_SECRET).
 * Server-to-server only — ingen brugere kalder denne funktion direkte.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import webpush from 'npm:web-push@3.6.6'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { normalizeVapidSubject } from '../_shared/push.ts'

type Kind = 'company' | 'subscription'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const expected = Deno.env.get('PLATFORM_EVENT_SECRET')?.trim()
  const got = req.headers.get('x-bilago-platform-event')?.trim()
  if (!expected || !got || expected !== got) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
  const vapidSubject = normalizeVapidSubject(Deno.env.get('VAPID_SUBJECT'))

  if (!vapidPublic || !vapidPrivate) {
    return jsonResponse({ error: 'Push not configured (VAPID keys)' }, 503)
  }

  let body: { kind?: Kind; company_id?: string }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }
  const kind = body.kind
  const companyId = (body.company_id ?? '').trim()
  if (kind !== 'company' && kind !== 'subscription') {
    return jsonResponse({ error: 'Invalid kind' }, 400)
  }
  if (!companyId) {
    return jsonResponse({ error: 'Missing company_id' }, 400)
  }

  const admin = createClient(supabaseUrl, serviceKey)

  const { data: coRow } = await admin
    .from('companies')
    .select('name, cvr')
    .eq('id', companyId)
    .maybeSingle()
  const companyName = coRow?.name?.trim() || 'Virksomhed'

  const { data: staffRows, error: stErr } = await admin
    .from('platform_staff')
    .select('user_id')
  if (stErr) return jsonResponse({ error: stErr.message }, 500)
  const staffIds = [...new Set((staffRows ?? []).map((r) => r.user_id).filter(Boolean))]
  if (staffIds.length === 0) {
    return jsonResponse({ ok: true, sent: 0, skipped: 'no platform staff' })
  }

  const { data: subs, error: sErr } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, subscription')
    .in('user_id', staffIds)
  if (sErr) return jsonResponse({ error: sErr.message }, 500)

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)

  const payload = JSON.stringify(
    kind === 'company'
      ? {
          title: 'Ny virksomhed oprettet',
          body: coRow?.cvr ? `${companyName} (CVR ${coRow.cvr})` : companyName,
          url: '/platform/companies',
        }
      : {
          title: 'Ny betaling',
          body: `${companyName} har aktiveret abonnement.`,
          url: '/platform/companies',
        },
  )

  let sent = 0
  let failed = 0
  let firstError: string | undefined
  for (const row of subs ?? []) {
    const sub = row.subscription as unknown as webpush.PushSubscription
    try {
      await webpush.sendNotification(sub, payload, { TTL: 86_400 })
      sent++
    } catch (e) {
      failed++
      if (!firstError) firstError = e instanceof Error ? e.message : String(e)
      const status = (e as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) {
        await admin.from('push_subscriptions').delete().eq('id', row.id)
      }
    }
  }

  return jsonResponse({
    ok: true,
    kind,
    sent,
    failed,
    subscriptionCount: (subs ?? []).length,
    firstError,
  })
})
