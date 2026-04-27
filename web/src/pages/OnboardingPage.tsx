import { useEffect, useState } from 'react'
import { detectEntityTypeFromCvr, lookupCVR, type EntityType } from '@/lib/cvrLookup'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useApp, subscriptionOk } from '@/context/AppProvider'
import { LoadingCentered } from '@/components/LoadingIndicator'
import { startStripeCheckout } from '@/lib/edge'
import { CheckoutResultNotice } from '@/components/CheckoutResultNotice'
import {
  cvrValidationHint,
  isPostgresUniqueViolation,
  normalizeCvrDigits,
} from '@/lib/cvr'

export function OnboardingPage() {
  const {
    session,
    loading,
    companies,
    currentCompany,
    subscription,
    refresh,
    user,
    platformRole,
    tenantCompanyCount,
  } = useApp()
  const [searchParams] = useSearchParams()
  const selectedPlanSlug = searchParams.get('plan')?.trim() || undefined
  const checkoutResult = searchParams.get('checkout')
  const [name, setName] = useState('')
  const [cvr, setCvr] = useState('')
  const [entityType, setEntityType] = useState<EntityType>('virksomhed')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [cvrLoading, setCvrLoading] = useState(false)
  async function handleCvrLookup() {
    if (!cvr) return
    setCvrLoading(true)
    setError(null)
    try {
      const digits = normalizeCvrDigits(cvr)
      const data = await lookupCVR(digits ?? cvr)
      if (data && data.name) {
        setName(data.name)
        setEntityType(detectEntityTypeFromCvr(data))
      } else {
        setError('Ingen virksomhed fundet på dette CVR')
      }
    } catch {
      setError('CVR slå-op fejlede')
    }
    setCvrLoading(false)
  }

  useEffect(() => {
    if (checkoutResult === 'success') {
      void refresh()
    }
  }, [checkoutResult, refresh])

  if (loading) {
    return (
      <LoadingCentered
        minHeight="min-h-screen"
        className="bg-slate-50"
        caption="Indlæser…"
        srLabel="Indlæser"
      />
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  /* Platform-staff uden eget medlemskab skal ikke sidde fast her (RPC/RLS kan have fejlet før). */
  if (
    platformRole &&
    tenantCompanyCount === 0 &&
    searchParams.get('opret') !== '1'
  ) {
    return <Navigate to="/platform/dashboard" replace />
  }

  if (companies.length > 0 && subscriptionOk(subscription)) {
    const suffix = checkoutResult ? `?checkout=${encodeURIComponent(checkoutResult)}` : ''
    return <Navigate to={`/app/dashboard${suffix}`} replace />
  }

  async function createCompany(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setBusy(true)
    setError(null)
    const cvrDigits = normalizeCvrDigits(cvr)
    const hint = cvrValidationHint(cvrDigits, cvr.trim().length > 0)
    if (hint) {
      setError(hint)
      setBusy(false)
      return
    }
    const { data: companyId, error: cErr } = await supabase.rpc('create_company_with_owner', {
      p_name: name.trim(),
      p_cvr: cvrDigits,
      p_entity_type: entityType,
    })
    if (cErr || !companyId) {
      setBusy(false)
      if (isPostgresUniqueViolation(cErr)) {
        setError(
          'Dette CVR er allerede registreret. Én virksomhed kan kun have én konto.',
        )
      } else {
        setError(cErr?.message ?? 'Kunne ikke oprette virksomhed')
      }
      return
    }
    setBusy(false)
    await refresh()
  }

  async function goPay() {
    if (!currentCompany) return
    setBusy(true)
    setError(null)
    try {
      const url = await startStripeCheckout(currentCompany.id, {
        returnPath: 'onboarding',
        billingPlanSlug: selectedPlanSlug,
      })
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout fejlede')
      setBusy(false)
    }
  }

  const needsCompany = companies.length === 0

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <div className="mb-6">
        <Link
          to="/?forside=1"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
        >
          <span aria-hidden>←</span> Gå til forsiden
        </Link>
      </div>
      <h1 className="text-2xl font-semibold text-slate-900">Kom i gang</h1>
      <p className="mt-2 text-sm text-slate-600">
        Opret din virksomhed og aktiver månedsabonnement. Data er isoleret per
        virksomhed.
      </p>

      <CheckoutResultNotice result={checkoutResult} className="mt-4" />

      {needsCompany ? (
        <form
          className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          onSubmit={(e) => void createCompany(e)}
        >
          <h2 className="text-lg font-medium text-slate-900">Virksomhed</h2>
          <div>
            <label className="text-sm font-medium text-slate-700" htmlFor="cname">
              Navn
            </label>
            <input
              id="cname"
              required
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Fx Mit ApS"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700" htmlFor="cvr">
              CVR (valgfrit)
            </label>
            <div className="flex gap-2 mt-1">
              <input
                id="cvr"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={cvr}
                onChange={(e) => setCvr(e.target.value)}
                placeholder="12345678"
                inputMode="numeric"
                autoComplete="off"
              />
              <button
                type="button"
                className="rounded-lg bg-slate-200 px-2 py-2 text-xs font-medium text-slate-700 hover:bg-slate-300 disabled:opacity-60 whitespace-nowrap"
                onClick={handleCvrLookup}
                disabled={!cvr || cvrLoading}
                title="Slå virksomhed op via CVR"
              >
                {cvrLoading ? 'Søger…' : 'Slå op'}
              </button>
            </div>
          </div>
          <fieldset>
            <legend className="text-sm font-medium text-slate-700">Type</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label
                className={
                  'flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ' +
                  (entityType === 'virksomhed'
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-950 ring-1 ring-indigo-200'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50')
                }
              >
                <input
                  type="radio"
                  name="entity_type"
                  value="virksomhed"
                  checked={entityType === 'virksomhed'}
                  onChange={() => setEntityType('virksomhed')}
                  className="mt-0.5 h-4 w-4 text-indigo-600"
                />
                <span>
                  <span className="block font-medium">Virksomhed</span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Aps, A/S, enkeltmand m.fl. Bruger moms og kunde-fakturering.
                  </span>
                </span>
              </label>
              <label
                className={
                  'flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ' +
                  (entityType === 'forening'
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-950 ring-1 ring-indigo-200'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50')
                }
              >
                <input
                  type="radio"
                  name="entity_type"
                  value="forening"
                  checked={entityType === 'forening'}
                  onChange={() => setEntityType('forening')}
                  className="mt-0.5 h-4 w-4 text-indigo-600"
                />
                <span>
                  <span className="block font-medium">Forening</span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Bruger tilskud, bevillinger og medlemskontingent. Typisk uden moms.
                  </span>
                </span>
              </label>
            </div>
          </fieldset>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {busy ? 'Gemmer…' : 'Opret virksomhed'}
          </button>
        </form>
      ) : (
        <div className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-slate-900">Abonnement</h2>
          <p className="text-sm text-slate-600">
            Virksomhed:{' '}
            <span className="font-medium text-slate-900">
              {currentCompany?.name}
            </span>
          </p>
          <p className="text-sm text-slate-600">
            Næste skridt er sikker betaling via Stripe (månedligt).
          </p>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void goPay()}
            className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {busy ? 'Åbner Stripe…' : 'Gå til betaling'}
          </button>
        </div>
      )}
    </div>
  )
}
