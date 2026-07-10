/**
 * Custom 30-dages prøveperiode uden kortkrav.
 *
 * Klokken starter på `companies.created_at` — hver ny virksomhed får sine egne 30 dage.
 * Dette er kun kunde-synlig UI-logik; der er ingen DB-kolonne der sporer trial-status,
 * fordi den kan beregnes fra created_at. Hvis produktet senere skifter til Stripe-trial
 * (kortkrav) kan denne modul fjernes og Stripe-subscription-status bruges i stedet.
 */

export const TRIAL_DAYS = 30

/** Vis "X dage tilbage"-banner når der er ≤ dette tal dage tilbage. */
export const TRIAL_BANNER_THRESHOLD_DAYS = 3

const DAY_MS = 86_400_000

export type TrialStatus = {
  /** Millisekunder siden trial-start. */
  msSinceStart: number
  /** Tidspunkt hvor trial udløber (ISO). */
  endsAt: string
  /** Antal dage tilbage (afrundet op); 0 hvis udløbet. */
  daysLeft: number
  /** True hvis trial ikke er udløbet endnu. */
  active: boolean
  /** True hvis trial er udløbet. */
  expired: boolean
}

export function trialStatusFor(
  company: { created_at: string; trial_ends_at?: string | null } | null,
): TrialStatus | null {
  if (!company?.created_at) return null
  const start = new Date(company.created_at).getTime()
  if (!Number.isFinite(start)) return null
  // Foretræk en lagret slut-override (sat når platform-ejeren forlænger), ellers created_at + 30 dage.
  const override = company.trial_ends_at ? new Date(company.trial_ends_at).getTime() : NaN
  const end = Number.isFinite(override) ? override : start + TRIAL_DAYS * DAY_MS
  const now = Date.now()
  const daysLeft = Math.max(0, Math.ceil((end - now) / DAY_MS))
  return {
    msSinceStart: Math.max(0, now - start),
    endsAt: new Date(end).toISOString(),
    daysLeft,
    active: now < end,
    expired: now >= end,
  }
}
