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
  if (!canUseWebPush()) return false

  const perm =
    Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission()
  if (perm !== 'granted') return false

  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC!.trim()),
    }))

  const json = sub.toJSON()
  if (!json.keys?.auth || !json.keys?.p256dh || !json.endpoint) return false

  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) return false

  const base = (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, '')
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  const res = await fetch(`${base}/functions/v1/push-subscribe`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anon,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ subscription: json }),
  })
  return res.ok
}
