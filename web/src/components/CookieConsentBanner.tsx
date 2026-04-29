import { useState } from 'react'
import {
  getStoredCookieConsent,
  hasCookieConsentAnswer,
  saveCookieConsent,
} from '@/lib/cookieConsentStorage'

/**
 * GDPR-venligt cookie-banner (første besøg / indtil brugeren vælger).
 * Valgfri analyse er slået fra som standard; kan udvides når I tilføjer måling.
 */
export function CookieConsentBanner() {
  const [visible, setVisible] = useState(
    () => typeof window !== 'undefined' && !hasCookieConsentAnswer(),
  )
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [analyticsOptIn, setAnalyticsOptIn] = useState(
    () => getStoredCookieConsent()?.analytics ?? false,
  )

  function acceptAll() {
    saveCookieConsent(true)
    setVisible(false)
  }

  function necessaryOnly() {
    saveCookieConsent(false)
    setVisible(false)
  }

  function savePreferences() {
    saveCookieConsent(analyticsOptIn)
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[200] border-t border-slate-200 bg-white/95 px-6 py-4 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] backdrop-blur-sm pb-[max(1rem,env(safe-area-inset-bottom))]"
      role="dialog"
      aria-labelledby="cookie-consent-title"
      aria-modal="false"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 text-sm text-slate-700">
        <h2 id="cookie-consent-title" className="text-base font-semibold text-slate-900">
          Cookies og dit samtykke
        </h2>
        <p className="leading-relaxed">
          Vi bruger <strong>nødvendige cookies</strong> (og tilsvarende teknologi i browseren), så
          siden kan logge dig sikkert ind og huske dine valg. Med dit samtykke må vi også bruge{' '}
          <strong>valgfrie cookies</strong> til statistik og forbedring af produktet. Læs mere i{' '}
          <a href="/cookiepolitik" className="font-medium text-indigo-600 hover:underline">
            cookiepolitikken
          </a>
          .
        </p>
        <button
          type="button"
          onClick={() => setDetailsOpen((o) => !o)}
          className="self-start text-left text-sm font-medium text-indigo-600 hover:underline"
        >
          {detailsOpen ? 'Skjul detaljer' : 'Vis detaljer og valgfri analyse'}
        </button>
        {detailsOpen ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs leading-relaxed text-slate-600">
            <p className="font-medium text-slate-800">Nødvendige</p>
            <p className="mt-1">
              Påkrævet for drift: session, sikkerhed (fx Supabase-auth), og lagring af dette
              samtykke.
            </p>
            <label className="mt-3 flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5 rounded border-slate-300 text-indigo-600"
                checked={analyticsOptIn}
                onChange={(e) => setAnalyticsOptIn(e.target.checked)}
              />
              <span>
                <span className="font-medium text-slate-800">Valgfri analyse</span>
                <span className="block text-slate-600">
                  Hjælper os med at forstå brug af Bilago (kun hvis vi aktiverer måleværktøj, der
                  respekterer dette valg).
                </span>
              </span>
            </label>
          </div>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end sm:gap-3">
          <button
            type="button"
            onClick={() => necessaryOnly()}
            className="order-3 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 sm:order-1"
          >
            Kun nødvendige
          </button>
          {detailsOpen ? (
            <button
              type="button"
              onClick={() => savePreferences()}
              className="order-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-medium text-indigo-900 hover:bg-indigo-100"
            >
              Gem valg
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => acceptAll()}
            className="order-1 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 sm:order-3"
          >
            Accepter alle
          </button>
        </div>
      </div>
    </div>
  )
}
