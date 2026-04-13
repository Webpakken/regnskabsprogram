import { useEffect, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useApp, subscriptionOk } from '@/context/AppProvider'
import { startStripeCheckout } from '@/lib/edge'

export function OnboardingPage() {
  const {
    session,
    loading,
    companies,
    currentCompany,
    subscription,
    refresh,
    user,
  } = useApp()
  const [searchParams] = useSearchParams()
  const [name, setName] = useState('')
  const [cvr, setCvr] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (searchParams.get('checkout') === 'success') {
      void refresh()
    }
  }, [searchParams, refresh])

  if (!loading && !session) {
    return <Navigate to="/login" replace />
  }

  if (!loading && companies.length > 0 && subscriptionOk(subscription)) {
    return <Navigate to="/app/dashboard" replace />
  }

  async function createCompany(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setBusy(true)
    setError(null)
    const { data: company, error: cErr } = await supabase
      .from('companies')
      .insert({ name, cvr: cvr || null })
      .select('id')
      .single()
    if (cErr || !company) {
      setBusy(false)
      setError(cErr?.message ?? 'Kunne ikke oprette virksomhed')
      return
    }
    const { error: mErr } = await supabase.from('company_members').insert({
      company_id: company.id,
      user_id: user.id,
      role: 'owner',
    })
    if (mErr) {
      setBusy(false)
      setError(mErr.message)
      return
    }
    await supabase
      .from('profiles')
      .update({ current_company_id: company.id })
      .eq('id', user.id)
    setBusy(false)
    await refresh()
  }

  async function goPay() {
    if (!currentCompany) return
    setBusy(true)
    setError(null)
    try {
      const url = await startStripeCheckout(currentCompany.id)
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout fejlede')
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Indlæser…
      </div>
    )
  }

  const needsCompany = companies.length === 0

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <h1 className="text-2xl font-semibold text-slate-900">Kom i gang</h1>
      <p className="mt-2 text-sm text-slate-600">
        Opret din virksomhed og aktiver månedsabonnement. Data er isoleret per
        virksomhed.
      </p>

      {searchParams.get('checkout') === 'cancel' ? (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Betaling afbrudt. Du kan prøve igen herunder.
        </p>
      ) : null}

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
            <input
              id="cvr"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={cvr}
              onChange={(e) => setCvr(e.target.value)}
              placeholder="12345678"
            />
          </div>
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
