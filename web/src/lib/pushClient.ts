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

  try {
    const { data, error } = await supabase.functions.invoke('web-push-subscribe', {
      body: { subscription: json },
    })
    if (error) {
      const err = error as Error & {
        context?: {
          status?: number
          json?: () => Promise<unknown>
          text?: () => Promise<string>
        }
      }
      let detail = error.message
      const status = err.context?.status
      if (status) detail = `HTTP ${status}: ${detail}`
      if (err.context?.json) {
        try {
          const body = (await err.context.json()) as { error?: string }
          if (body?.error) detail = status ? `HTTP ${status}: ${body.error}` : body.error
        } catch {
          /* ignore */
        }
      } else if (err.context?.text) {
        try {
          const text = await err.context.text()
          if (text) detail = status ? `HTTP ${status}: ${text}` : text
        } catch {
          /* ignore */
        }
      }
      return {
        ok: false,
        stage: 'function',
        detail,
      }
    }
    const payload = data as { ok?: boolean; error?: string } | null
    if (payload?.ok !== true) {
      return {
        ok: false,
        stage: 'function',
        detail: payload?.error ?? 'Funktionen returnerede ikke ok=true.',
      }
    }
  } catch (err) {
    return {
      ok: false,
      stage: 'function',
      detail: err instanceof Error ? err.message : 'Netværksfejl ved kald til web-push-subscribe.',
    }
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
 * Registrerer Web Push og gemmer abonnement i Supabase (kræver deploy af «web-push-subscribe» + VAPID-secrets).
 */
export async function registerWebPushSubscription(): Promise<boolean> {
  const result = await registerWebPushSubscriptionDetailed()
  return result.ok
}
