import webpush from 'npm:web-push@3.6.6'
import { normalizeVapidSubject } from './push.ts'

/** Push til en liste af bruger-ids. Best effort — kaster aldrig. */
// deno-lint-ignore no-explicit-any
export async function pushUsers(
  admin: any,
  userIds: string[],
  payload: { title: string; body: string; url: string },
): Promise<{ sent: number; subscriptionCount: number }> {
  try {
    const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
    const vapidSubject = normalizeVapidSubject(Deno.env.get('VAPID_SUBJECT'))
    if (!vapidPublic || !vapidPrivate) return { sent: 0, subscriptionCount: 0 }

    const ids = [...new Set(userIds.filter(Boolean))]
    if (ids.length === 0) return { sent: 0, subscriptionCount: 0 }

    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('id, subscription')
      .in('user_id', ids)

    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)
    const body = JSON.stringify(payload)

    let sent = 0
    for (const row of subs ?? []) {
      try {
        await webpush.sendNotification(row.subscription as webpush.PushSubscription, body, { TTL: 86_400 })
        sent++
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          await admin.from('push_subscriptions').delete().eq('id', row.id)
        }
      }
    }
    return { sent, subscriptionCount: (subs ?? []).length }
  } catch {
    return { sent: 0, subscriptionCount: 0 }
  }
}

/**
 * Push til alle platform_staff (Bilago-team). Bruges når en Maria-chat eskalerer
 * eller kunden beder om et menneske.
 */
// deno-lint-ignore no-explicit-any
export async function pushPlatformStaff(
  admin: any,
  payload: { title: string; body: string; url: string },
): Promise<{ sent: number; subscriptionCount: number }> {
  const { data: staffRows } = await admin.from('platform_staff').select('user_id')
  const staffIds = (staffRows ?? []).map((r: { user_id: string }) => r.user_id)
  return pushUsers(admin, staffIds, payload)
}
