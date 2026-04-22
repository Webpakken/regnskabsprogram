import { useEffect } from 'react'
import { subscriptionOk, useApp } from '@/context/AppProvider'
import { registerWebPushSubscription } from '@/lib/pushClient'

const STORAGE_KEY = 'bilago:pushSubscribeAttempted'
const STORAGE_KEY_PLATFORM = 'bilago:pushSubscribeAttemptedPlatform'
const LEGACY_STORAGE_KEY = 'hisab:pushSubscribeAttempted'
const LEGACY_STORAGE_KEY_PLATFORM = 'hisab:pushSubscribeAttemptedPlatform'

/**
 * Tilbyder Web Push én gang pr. session (efter kort pause).
 * `variant="platform"`: platform_staff uden krav om virksomhed/abonnement (til support-push).
 */
export function RegisterPushNotifications({
  variant = 'tenant',
}: {
  variant?: 'tenant' | 'platform'
} = {}) {
  const { user, subscription, currentCompany, platformRole } = useApp()
  const storageKey = variant === 'platform' ? STORAGE_KEY_PLATFORM : STORAGE_KEY

  useEffect(() => {
    if (!user) return
    if (variant === 'tenant') {
      if (!currentCompany || !subscriptionOk(subscription)) return
    } else {
      if (!platformRole) return
    }
    if (typeof Notification === 'undefined' || Notification.permission === 'denied') return

    let cancelled = false
    const t = window.setTimeout(() => {
      if (cancelled) return
      try {
        if (!sessionStorage.getItem(storageKey)) {
          const legacy =
            variant === 'platform' ? LEGACY_STORAGE_KEY_PLATFORM : LEGACY_STORAGE_KEY
          const migrated = sessionStorage.getItem(legacy)
          if (migrated) sessionStorage.setItem(storageKey, migrated)
        }
        if (sessionStorage.getItem(storageKey)) return
      } catch {
        return
      }
      void (async () => {
        try {
          const ok = await registerWebPushSubscription()
          try {
            sessionStorage.setItem(storageKey, ok ? '1' : '0')
          } catch {
            /* ignore */
          }
        } catch {
          try {
            sessionStorage.setItem(storageKey, '0')
          } catch {
            /* ignore */
          }
        }
      })()
    }, variant === 'platform' ? 1500 : 4000)

    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [user, subscription, currentCompany, platformRole, variant, storageKey])

  return null
}
