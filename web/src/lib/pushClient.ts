import { supabase } from '@/lib/supabase'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

const VAPID_PUBLIC = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY as string | undefined

export function isStandaloneIosPwa() {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent
  const isiOS =
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  return isiOS && isStandalone
}

export function canUseWebPush() {
  return Boolean(
    VAPID_PUBLIC?.trim() &&
      typeof window !== 'undefined' &&
      'Notification' in window &&
      'serviceWorker' in navigator &&
      'PushManager' in window,
  )
}

export async function registerWebPushSubscriptionDetailed(): Promise<{
  ok: boolean
  stage:
    | 'unsupported'
    | 'permission'
    | 'service_worker'
    | 'subscribe'
    | 'session'
    | 'function'
    | 'done'
  detail?: string
}> {
  if (!canUseWebPush()) {
    return { ok: false, stage: 'unsupported', detail: 'Web Push er ikke understøttet i denne kontekst.' }
  }

  let perm: NotificationPermission
  try {
    perm =
      Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission()
  } catch (err) {
    return {
      ok: false,
      stage: 'permission',
      detail: err instanceof Error ? err.message : 'Kunne ikke anmode om notifikationstilladelse.',
    }
  }
  if (perm !== 'granted') {
    return { ok: false, stage: 'permission', detail: 'Notifikationstilladelse blev ikke givet.' }
  }

  let reg: ServiceWorkerRegistration
  try {
    reg = await navigator.serviceWorker.ready
  } catch (err) {
    return {
      ok: false,
      stage: 'service_worker',
      detail: err instanceof Error ? err.message : 'Service worker er ikke klar.',
    }
  }

  let sub: PushSubscription
  try {
    const existing = await reg.pushManager.getSubscription()
    sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC!.trim()),
      }))
  } catch (err) {
    return {
      ok: false,
      stage: 'subscribe',
      detail: err instanceof Error ? err.message : 'Kunne ikke oprette push-subscription.',
    }
  }

  const json = sub.toJSON()
  if (!json.keys?.auth || !json.keys?.p256dh || !json.endpoint) {
    return {
      ok: false,
      stage: 'subscribe',
      detail: 'Push-subscription mangler endpoint eller nøgler.',
    }
  }

  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) {
    return { ok: false, stage: 'session', detail: 'Ingen aktiv session/access token.' }
  }

  const base = (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, '')
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  let res: Response
  try {
    res = await fetch(`${base}/functions/v1/push-subscribe`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anon,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ subscription: json }),
    })
  } catch (err) {
    return {
      ok: false,
      stage: 'function',
      detail: err instanceof Error ? err.message : 'Netværksfejl ved kald til push-subscribe.',
    }
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const payload = (await res.json()) as { error?: string }
      if (payload?.error) detail = `${detail}: ${payload.error}`
    } catch {
      /* ignore */
    }
    return { ok: false, stage: 'function', detail }
  }

  return { ok: true, stage: 'done' }
}

export async function hasWebPushSubscription(): Promise<boolean> {
  if (!canUseWebPush()) return false
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  return Boolean(sub?.endpoint)
}

/**
 * Registrerer Web Push og gemmer abonnement i Supabase (kræver deploy af «push-subscribe» + VAPID-secrets).
 */
export async function registerWebPushSubscription(): Promise<boolean> {
  const result = await registerWebPushSubscriptionDetailed()
  return result.ok
}
