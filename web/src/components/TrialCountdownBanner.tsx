import { useEffect, useState } from 'react'
import {
  ButtonSpinner,
  useStripeCheckoutLauncher,
} from '@/lib/useStripeCheckoutLauncher'
import {
  TRIAL_BANNER_THRESHOLD_DAYS,
  trialStatusFor,
} from '@/lib/trial'

/**
 * Banner der viser "X dage tilbage" i de sidste TRIAL_BANNER_THRESHOLD_DAYS dage
 * af den 30-dages custom trial. Vises kun hvis brugeren IKKE har aktivt abonnement
 * — parent-komponenten (AppShell) styrer det via accessOk + subscription-status.
 */
export function TrialCountdownBanner({
  company,
}: {
  company: { id: string; created_at: string }
}) {
  const [, tick] = useState(0)
  const checkout = useStripeCheckoutLauncher()

  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const trial = trialStatusFor(company)
  if (!trial || !trial.active) return null
  if (trial.daysLeft > TRIAL_BANNER_THRESHOLD_DAYS) return null

  const word = trial.daysLeft === 1 ? 'dag' : 'dage'
  const daysText =
    trial.daysLeft === 0
      ? 'Din prøveperiode slutter i dag'
      : `${trial.daysLeft} ${word} tilbage af din prøveperiode`

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-5 py-3.5 text-sm text-amber-900 md:px-10">
      <span className="min-w-0 flex-1">
        <strong className="font-semibold">{daysText}</strong>
        <span className="ml-1 text-amber-800">
          · Tilmeld dig nu for at fortsætte uden afbrydelse.
        </span>
      </span>
      <button
        type="button"
        disabled={checkout.loading}
        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-80"
        onClick={() => void checkout.launch(company.id)}
      >
        {checkout.loading ? <ButtonSpinner /> : null}
        {checkout.loading ? 'Åbner Stripe…' : 'Start abonnement'}
      </button>
    </div>
  )
}
