import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useApp, subscriptionOk } from '@/context/AppProvider'
import { formatDateTime, formatKrPerMonth } from '@/lib/format'
import { subscriptionStatusLabelDa } from '@/lib/subscriptionLabels'
import { redirectToStripeCheckout } from '@/lib/edge'
import {
  cvrValidationHint,
  isPostgresUniqueViolation,
  normalizeCvrDigits,
} from '@/lib/cvr'
import {
  getHideTrialBannerDuringTrial,
  setHideTrialBannerDuringTrial,
} from '@/lib/trialPaymentUiPreference'

export function SettingsGeneralPage() {
  const { currentCompany, subscription, refresh } = useApp()
  const [name, setName] = useState('')
  const [cvr, setCvr] = useState('')
  const [street, setStreet] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [city, setCity] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [hideTrialBanner, setHideTrialBanner] = useState(getHideTrialBannerDuringTrial)
  const [priceCents, setPriceCents] = useState<number | null>(null)
  const ok = subscriptionOk(subscription)
  const priceLabel = priceCents != null ? formatKrPerMonth(priceCents) : null

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data } = await supabase
        .from('platform_public_settings')
        .select('pricing_amount_cents, monthly_price_cents')
        .eq('id', 1)
        .maybeSingle()
      if (cancelled) return
      setPriceCents(data?.pricing_amount_cents ?? data?.monthly_price_cents ?? 9900)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const sync = () => setHideTrialBanner(getHideTrialBannerDuringTrial())
    window.addEventListener('storage', sync)
    window.addEventListener('bilago:trial-banner-pref', sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener('bilago:trial-banner-pref', sync)
    }
  }, [])

  useEffect(() => {
    if (currentCompany) {
      setName(currentCompany.name)
      setCvr(currentCompany.cvr ?? '')
      setStreet(currentCompany.street_address ?? '')
      setPostalCode(currentCompany.postal_code ?? '')
      setCity(currentCompany.city ?? '')
    }
  }, [currentCompany])

  async function saveCompany(e: React.FormEvent) {
    e.preventDefault()
    if (!currentCompany) return
    setSaving(true)
    setMessage(null)
    setSaveError(null)
    const cvrDigits = normalizeCvrDigits(cvr)
    const hint = cvrValidationHint(cvrDigits, cvr.trim().length > 0)
    if (hint) {
      setSaveError(hint)
      setSaving(false)
      return
    }
    const { error } = await supabase
      .from('companies')
      .update({
        name: name.trim(),
        cvr: cvrDigits,
        street_address: street.trim() || null,
        postal_code: postalCode.trim() || null,
        city: city.trim() || null,
      })
      .eq('id', currentCompany.id)
    setSaving(false)
    if (error) {
      if (isPostgresUniqueViolation(error)) {
        setSaveError(
          'Dette CVR er allerede knyttet til en anden konto. Én virksomhed kan kun have én konto.',
        )
      } else {
        setSaveError(error.message)
      }
      return
    }
    setMessage('Gemt.')
    await refresh()
  }

  if (!currentCompany) {
    return (
      <p className="text-slate-600">Opret virksomhed under onboarding først.</p>
    )
  }

  return (
    <div className="space-y-8">
      <form
        onSubmit={(e) => void saveCompany(e)}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="text-lg font-medium text-slate-900">Virksomhed</h2>
        <p className="text-sm text-slate-600">
          Stamdata og adresse — bruges bl.a. på fakturaer (se fanen Faktura).
        </p>
        <div>
          <label className="text-sm font-medium text-slate-700" htmlFor="sname">
            Navn
          </label>
          <input
            id="sname"
            required
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700" htmlFor="scvr">
            CVR
          </label>
          <input
            id="scvr"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={cvr}
            onChange={(e) => setCvr(e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700" htmlFor="sstreet">
            Adresse
          </label>
          <input
            id="sstreet"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={street}
            onChange={(e) => setStreet(e.target.value)}
            placeholder="Gade og nr."
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-slate-700" htmlFor="spost">
              Postnr.
            </label>
            <input
              id="spost"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700" htmlFor="scity">
              By
            </label>
            <input
              id="scity"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>
        </div>
        {saveError ? (
          <p className="text-sm text-red-600" role="alert">
            {saveError}
          </p>
        ) : null}
        {message ? (
          <p className="text-sm text-emerald-700" role="status">
            {message}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {saving ? 'Gemmer…' : 'Gem'}
        </button>
      </form>

      <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">Abonnement</h2>
        <p className="text-sm text-slate-600">
          Status:{' '}
          <span className="font-medium text-slate-900">
            {subscriptionStatusLabelDa(subscription?.status)}
          </span>
        </p>
        {subscription?.current_period_end ? (
          <p className="text-sm text-slate-600">
            Nuværende periode slutter:{' '}
            {formatDateTime(subscription.current_period_end)}
          </p>
        ) : null}
        {priceLabel ? (
          <p className="text-sm text-slate-600">
            Abonnement:{' '}
            <span className="font-medium text-slate-900">{priceLabel}</span>
          </p>
        ) : null}
        {!ok ? (
          <button
            type="button"
            className="mt-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            onClick={() => redirectToStripeCheckout(currentCompany.id)}
          >
            Aktivér abonnement
          </button>
        ) : null}
      </div>

      {subscription?.status === 'trialing' ? (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-slate-900">Prøveperiode</h2>
          <p className="text-sm text-slate-600">
            Det lilla banner øverst kan skjules (også via «Skjul banner» i banneret). Den sidste dag før
            udløb vises det igen automatisk. Abonnement kan altid tilføjes herunder.
          </p>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600"
              checked={hideTrialBanner}
              onChange={(e) => {
                const v = e.target.checked
                setHideTrialBannerDuringTrial(v)
                setHideTrialBanner(v)
              }}
            />
            <span className="text-sm text-slate-800">
              Skjul prøvebanner øverst, mens der er mindst én dag tilbage af prøveperioden
            </span>
          </label>
        </div>
      ) : null}
    </div>
  )
}
