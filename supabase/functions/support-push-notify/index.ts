import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import webpush from 'npm:web-push@3.6.6'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { normalizeVapidSubject } from '../_shared/push.ts'

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
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
  const vapidSubject = normalizeVapidSubject(Deno.env.get('VAPID_SUBJECT'))

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const base = supabaseUrl.replace(/\/$/, '')
  const authRes = await fetch(`${base}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: anon },
  })
  if (!authRes.ok) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }
  const authUser = (await authRes.json()) as { id?: string }
  if (!authUser.id) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const admin = createClient(supabaseUrl, serviceKey)
  const { data: staffRow, error: staffErr } = await admin
    .from('platform_staff')
    .select('user_id')
    .eq('user_id', authUser.id)
    .maybeSingle()
  if (staffErr || !staffRow) {
    return jsonResponse({ error: 'Forbidden' }, 403)
  }

  if (!vapidPublic || !vapidPrivate) {
    return jsonResponse({ error: 'Push not configured (VAPID keys)' }, 503)
  }

  let ticketId: string
  try {
    const j = (await req.json()) as { ticket_id?: string }
    ticketId = (j.ticket_id ?? '').trim()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }
  if (!ticketId) {
    return jsonResponse({ error: 'Missing ticket_id' }, 400)
  }

  const { data: ticket, error: tErr } = await admin
    .from('support_tickets')
    .select('id, company_id')
    .eq('id', ticketId)
    .maybeSingle()
  if (tErr || !ticket) {
    return jsonResponse({ error: 'Ticket not found' }, 404)
  }

  const { data: coRow } = await admin
    .from('companies')
    .select('name')
    .eq('id', ticket.company_id)
    .maybeSingle()
  const companyName = coRow?.name?.trim() || 'Din virksomhed'

  const { data: members, error: mErr } = await admin
    .from('company_members')
    .select('user_id')
    .eq('company_id', ticket.company_id)
  if (mErr) {
    return jsonResponse({ error: mErr.message }, 500)
  }
  const userIds = [...new Set((members ?? []).map((m) => m.user_id).filter(Boolean))]
  if (userIds.length === 0) {
    return jsonResponse({ ok: true, sent: 0, skipped: 'no members' })
  }

  const { data: subs, error: sErr } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, subscription')
    .in('user_id', userIds)
  if (sErr) {
    return jsonResponse({ error: sErr.message }, 500)
  }

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)

  const payload = JSON.stringify({
    title: 'Ny besked fra Bilago',
    body: `Support har skrevet i tråden for ${companyName}.`,
    url: '/app/support',
  })

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
    sent,
    failed,
    subscriptionCount: (subs ?? []).length,
    firstError,
  })
})
