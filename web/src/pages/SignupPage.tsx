import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { invokeAuthSignupConfirmation } from '@/lib/edge'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppProvider'
import { BrandMark } from '@/components/BrandMark'
import { validateSignupPassword } from '@/lib/passwordPolicy'
import { formatKrPerMonth } from '@/lib/format'

type SignupPlan = {
  slug: string
  name: string
  monthly_price_cents: number
}

export function SignupPage() {
  const { session, loading } = useApp()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [plans, setPlans] = useState<SignupPlan[]>([])
  const planSlug = searchParams.get('plan') ?? ''

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data } = await supabase
        .from('billing_plans')
        .select('slug, name, monthly_price_cents')
        .eq('active', true)
        .order('sort_order', { ascending: true })
        .order('monthly_price_cents', { ascending: true })
      if (cancelled) return
      setPlans((data ?? []) as SignupPlan[])
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (plans.length === 0) return
    if (planSlug && plans.some((p) => p.slug === planSlug)) return
    const fallback = plans[0]?.slug
    if (fallback) {
      setSearchParams({ plan: fallback }, { replace: true })
    }
  }, [plans, planSlug, setSearchParams])

  if (!loading && session) {
    return <Navigate to="/" replace />
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const pwErr = validateSignupPassword(password)
    if (pwErr) {
      setError(pwErr)
      setBusy(false)
      return
    }
    try {
      await invokeAuthSignupConfirmation({
        email,
        password,
        fullName,
        plan: planSlug || null,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke sende bekræftelsesmail')
      setBusy(false)
      return
    }
    setBusy(false)
    const params = new URLSearchParams()
    params.set('email', email)
    if (planSlug) params.set('plan', planSlug)
    navigate(`/signup/bekraeft-email?${params.toString()}`, { replace: true })
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex justify-center">
          <BrandMark />
        </div>
        <h1 className="text-2xl font-semibold text-slate-900">Opret konto</h1>
        <p className="mt-1 text-sm text-slate-500">Start med virksomhed og abonnement</p>
        <form className="mt-6 space-y-4" onSubmit={(e) => void submit(e)}>
          {plans.length > 0 ? (
            <div>
              <label className="text-sm font-medium text-slate-700" htmlFor="plan">
                Valgt plan
              </label>
              <select
                id="plan"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                value={planSlug}
                onChange={(e) => setSearchParams({ plan: e.target.value }, { replace: true })}
              >
                {plans.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.name} – {p.monthly_price_cents === 0 ? 'Gratis' : formatKrPerMonth(p.monthly_price_cents)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div>
            <label className="text-sm font-medium text-slate-700" htmlFor="name">
              Navn
            </label>
            <input
              id="name"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700" htmlFor="email">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label
              className="text-sm font-medium text-slate-700"
              htmlFor="password"
            >
              Adgangskode
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-500">
              Mindst 8 tegn: små og store bogstaver, tal og mindst ét symbol (fx ! # -).
            </p>
          </div>
          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {busy ? 'Opretter…' : 'Opret konto'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-600">
          Har du allerede en konto?{' '}
          <Link className="font-medium text-indigo-600" to="/login">
            Log ind
          </Link>
        </p>
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-center text-xs text-emerald-800 ring-1 ring-emerald-200">
          30 dages gratis prøveperiode på alle planer — uden kortkrav.
        </p>
      </div>
    </div>
  )
}
