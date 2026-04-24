import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { canUseWebPush, hasWebPushSubscription, isStandaloneIosPwa, registerWebPushSubscriptionDetailed } from '@/lib/pushClient'
import { useApp } from '@/context/AppProvider'

const SESSION_KEY = 'bilago:pwaPushPromptShown'
const DISMISS_UNTIL_KEY = 'bilago:pwaPushPromptDismissUntil'
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000

export function PwaPushPrompt() {
  const navigate = useNavigate()
  const { user } = useApp()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function check() {
      if (!user) return
      if (!canUseWebPush()) return
      if (typeof window === 'undefined') return
      const isStandalone =
        window.matchMedia?.('(display-mode: standalone)').matches ||
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true
      if (!isStandalone) return
      if (Notification.permission === 'denied') return
      try {
        if (sessionStorage.getItem(SESSION_KEY)) return
        const dismissUntil = Number(localStorage.getItem(DISMISS_UNTIL_KEY) ?? '0')
        if (dismissUntil > Date.now()) return
      } catch {
        return
      }
      const enabled = await hasWebPushSubscription()
      if (cancelled || enabled) return
      setOpen(true)
      try {
        sessionStorage.setItem(SESSION_KEY, '1')
      } catch {
        /* ignore */
      }
    }

    const timeout = window.setTimeout(() => {
      void check()
    }, 1200)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [user])

  function closeForNow() {
    setOpen(false)
    setError(null)
    try {
      localStorage.setItem(DISMISS_UNTIL_KEY, String(Date.now() + DISMISS_MS))
    } catch {
      /* ignore */
    }
  }

  async function enablePush() {
    setBusy(true)
    setError(null)
    try {
      const result = await registerWebPushSubscriptionDetailed()
      if (!result.ok) {
        setError(
          result.detail
            ? `Push-fejl (${result.stage}): ${result.detail}`
            : `Push-fejl (${result.stage}).`,
        )
        return
      }
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Push kunne ikke aktiveres.')
    } finally {
      setBusy(false)
    }
  }

  function openSettings() {
    setOpen(false)
    navigate('/app/settings/notifications')
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/45 px-4 pb-4 pt-20 sm:items-center sm:p-6">
      <div className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl ring-1 ring-slate-900/8">
        <div className="inline-flex rounded-2xl bg-indigo-50 p-3 text-indigo-600">
          <svg
            viewBox="0 0 24 24"
            className="h-7 w-7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
            <path d="M10 20a2 2 0 0 0 4 0" />
          </svg>
        </div>
        <h2 className="mt-4 text-xl font-semibold text-slate-950">Aktivér push i appen</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Få besked om nye support-svar og andre vigtige hændelser, også når Bilago ikke er åben.
          {isStandaloneIosPwa()
            ? ' På iPhone kræver det et direkte tryk her i PWA-appen.'
            : ''}
        </p>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => void enablePush()}
            disabled={busy}
            className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
          >
            {busy ? 'Aktiverer push…' : 'Slå push til'}
          </button>
          <button
            type="button"
            onClick={openSettings}
            className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Åbn notifikationer
          </button>
          <button
            type="button"
            onClick={closeForNow}
            className="inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm text-slate-500 transition hover:bg-slate-50"
          >
            Ikke nu
          </button>
        </div>
      </div>
    </div>
  )
}
