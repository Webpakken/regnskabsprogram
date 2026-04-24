import { useEffect, useState } from 'react'
import {
  ButtonSpinner,
  useStripeCheckoutLauncher,
} from '@/lib/useStripeCheckoutLauncher'

/**
 * Blød paywall-modal der vises når den 30-dages prøveperiode er slut og brugeren
 * ikke har aktivt abonnement. Kan lukkes — underliggende RequireSubscription
 * blokerer stadig de centrale sider (fakturaer, bilag, bank), så brugeren ikke
 * kan arbejde videre uden at betale.
 *
 * Vises maksimalt én gang pr. session (sessionStorage), så brugeren ikke bliver
 * spammet ved hver navigation. Kan altid aktiveres igen via banneret på dashboard.
 */
export function TrialExpiredModal({
  company,
  storageKeyPrefix = 'bilago:trial-expired-seen:',
}: {
  company: { id: string }
  storageKeyPrefix?: string
}) {
  const storageKey = `${storageKeyPrefix}${company.id}`
  const [open, setOpen] = useState(false)
  const checkout = useStripeCheckoutLauncher()

  useEffect(() => {
    try {
      const seen = window.sessionStorage.getItem(storageKey)
      if (!seen) setOpen(true)
    } catch {
      setOpen(true)
    }
  }, [storageKey])

  function close() {
    try {
      window.sessionStorage.setItem(storageKey, '1')
    } catch {
      /* ignore */
    }
    setOpen(false)
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trial-expired-title"
    >
      <button
        type="button"
        aria-label="Luk"
        className="absolute inset-0 bg-slate-900/50"
        onClick={close}
      />
      <div className="relative w-full max-w-lg rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-2xl sm:p-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
          <svg
            className="h-6 w-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <rect x="4" y="10" width="16" height="11" rx="2.5" />
            <path d="M8 10V7a4 4 0 1 1 8 0v3" />
          </svg>
        </div>
        <h2
          id="trial-expired-title"
          className="mt-5 text-2xl font-semibold tracking-tight text-slate-900"
        >
          Din gratis prøveperiode er slut
        </h2>
        <p className="mt-3 text-sm text-slate-600">
          Tilmeld dig for 99 kr./md. og fortsæt hvor du slap. Alle dine data er gemt,
          og du har fuld adgang igen så snart betalingen er på plads.
        </p>
        <ul className="mt-5 space-y-2 text-sm text-slate-700">
          {[
            'Fortsæt med alle dine eksisterende fakturaer og bilag',
            'Ingen binding — opsig når som helst',
            'Dansk support på hverdage',
          ].map((line) => (
            <li key={line} className="flex items-start gap-2">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <svg
                  className="h-3 w-3"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="m5 12 5 5 9-11" />
                </svg>
              </span>
              {line}
            </li>
          ))}
        </ul>
        <div className="mt-7 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            disabled={checkout.loading}
            onClick={() => {
              if (checkout.loading) return
              close()
              void checkout.launch(company.id)
            }}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-80"
          >
            {checkout.loading ? <ButtonSpinner /> : null}
            {checkout.loading ? 'Åbner Stripe…' : 'Start abonnement'}
            {checkout.loading ? null : <span aria-hidden>→</span>}
          </button>
          <button
            type="button"
            onClick={close}
            className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Ikke nu
          </button>
        </div>
      </div>
    </div>
  )
}
