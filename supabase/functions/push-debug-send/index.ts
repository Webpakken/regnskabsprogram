import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import webpush from 'npm:web-push@3.6.6'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { normalizeVapidSubject } from '../_shared/push.ts'

serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders })
    }
    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405)
    }

    const expected = Deno.env.get('PUSH_DEBUG_SECRET')?.trim()
    const got = req.headers.get('x-push-debug-secret')?.trim()
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

    let body: { email?: string; user_id?: string; title?: string; message?: string; url?: string }
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Invalid JSON' }, 400)
    }

    const email = (body.email ?? '').trim().toLowerCase()
    const userId = (body.user_id ?? '').trim()
    if (!email && !userId) {
      return jsonResponse({ error: 'Missing email or user_id' }, 400)
    }

    const admin = createClient(supabaseUrl, serviceKey)
    let resolvedUserId = userId

    if (!resolvedUserId) {
      try {
        const { data: users, error: uErr } = await admin.auth.admin.listUsers()
        if (uErr) {
          return jsonResponse({ error: `listUsers failed: ${uErr.message}` }, 500)
        }
        const user = users.users.find((u) => (u.email ?? '').trim().toLowerCase() === email)
        if (!user?.id) {
          return jsonResponse({ error: 'User not found' }, 404)
        }
        resolvedUserId = user.id
      } catch (e) {
        return jsonResponse(
          { error: 'Failed to resolve user', details: e instanceof Error ? e.message : String(e) },
          500,
        )
      }
    }

    let subs:
      | Array<{ id: string; endpoint: string; subscription: webpush.PushSubscription }>
      | null = null
    try {
      const { data, error: sErr } = await admin
        .from('push_subscriptions')
        .select('id, endpoint, subscription')
        .eq('user_id', resolvedUserId)
      if (sErr) return jsonResponse({ error: `Subscription lookup failed: ${sErr.message}` }, 500)
      subs = data as Array<{ id: string; endpoint: string; subscription: webpush.PushSubscription }> | null
    } catch (e) {
      return jsonResponse(
        { error: 'Subscription query crashed', details: e instanceof Error ? e.message : String(e) },
        500,
      )
    }

    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)

    const payload = JSON.stringify({
      title: body.title?.trim() || 'Bilago test-push',
      body: body.message?.trim() || 'Dette er en testnotifikation til din enhed.',
      url: body.url?.trim() || '/app/support',
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
      user_id: resolvedUserId,
      subscriptionCount: (subs ?? []).length,
      sent,
      failed,
      firstError,
    })
  } catch (e) {
    return jsonResponse(
      { error: 'Unhandled crash', details: e instanceof Error ? e.message : String(e) },
      500,
    )
  }
})
