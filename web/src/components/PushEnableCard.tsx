import { useEffect, useState } from 'react'
import {
  canUseWebPush,
  hasWebPushSubscription,
  isStandaloneIosPwa,
  registerWebPushSubscriptionDetailed,
} from '@/lib/pushClient'

/**
 * Selvstændigt "Slå push til"-kort til den aktuelle enhed. Genbruges både i
 * kundens notifikations-indstillinger og i platform/ejer-dashboardet. Registrerer
 * enhedens push-abonnement pr. bruger (push_subscriptions), så både kunde- og
 * staff-push (pushToStaff) rammer den samme enhed.
 */
export function PushEnableCard() {
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!canUseWebPush()) {
        if (!cancelled) setPushEnabled(false)
        return
      }
      const ok = await hasWebPushSubscription()
      if (!cancelled) setPushEnabled(ok)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function enablePush() {
    setPushBusy(true)
    setMessage(null)
    setError(null)
    try {
      const result = await registerWebPushSubscriptionDetailed()
      setPushEnabled(result.ok)
      if (!result.ok) {
        setError(
          result.detail
            ? `Push-fejl (${result.stage}): ${result.detail}`
            : `Push-fejl (${result.stage}).`,
        )
      } else {
        setMessage('Push-notifikationer er aktiveret på denne enhed.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Push kunne ikke aktiveres.')
    } finally {
      setPushBusy(false)
    }
  }

  if (!canUseWebPush()) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <h3 className="text-sm font-semibold text-amber-950">Push ikke klar</h3>
        <p className="mt-1 text-sm text-amber-900/90">
          Denne build mangler Web Push-konfiguration eller en understøttet browser/PWA-kontekst.
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Push på denne enhed</h3>
          <p className="mt-1 text-sm text-slate-600">
            {pushEnabled
              ? 'Push er aktiv på denne enhed.'
              : isStandaloneIosPwa()
                ? 'På iPhone PWA skal push aktiveres ved et direkte tryk på knappen herunder.'
                : 'Aktivér push, så du kan få besked uden at have appen åben.'}
          </p>
        </div>
        <button
          type="button"
          disabled={pushBusy || pushEnabled}
          onClick={() => void enablePush()}
          className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {pushEnabled ? 'Push aktiv' : pushBusy ? 'Aktiverer…' : 'Slå push til'}
        </button>
      </div>
      {message ? <p className="mt-2 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
    </section>
  )
}
