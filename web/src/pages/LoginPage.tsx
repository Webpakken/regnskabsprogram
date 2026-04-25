import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { invokeAuthPasswordReset } from '@/lib/edge'
import { BrandMark } from '@/components/BrandMark'
import { useApp } from '@/context/AppProvider'

function hasRecoveryParams() {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const searchParams = new URLSearchParams(window.location.search)
  return hashParams.get('type') === 'recovery' || searchParams.get('type') === 'recovery'
}

export function LoginPage() {
  const { session, loading, refresh } = useApp()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'login' | 'forgot' | 'recovery'>(() =>
    hasRecoveryParams() ? 'recovery' : 'login',
  )
  const [forgotDone, setForgotDone] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [recoveryDone, setRecoveryDone] = useState(false)

  useEffect(() => {
    if (hasRecoveryParams()) {
      setMode('recovery')
      setError(null)
      setForgotDone(false)
      setRecoveryDone(false)
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('recovery')
        setError(null)
        setForgotDone(false)
        setRecoveryDone(false)
      }
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  if (!loading && session && mode !== 'recovery') {
    return <Navigate to="/home" replace />
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (err) {
      setBusy(false)
      setError(err.message)
      return
    }
    await refresh()
    setBusy(false)
    navigate('/home', { replace: true })
  }

  async function submitForgot(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) {
      setError('Indtast e-mail')
      return
    }
    setBusy(true)
    setError(null)
    setForgotDone(false)
    try {
      await invokeAuthPasswordReset(email)
      setForgotDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke sende')
    } finally {
      setBusy(false)
    }
  }

  async function submitRecovery(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword.length < 8) {
      setError('Adgangskoden skal være mindst 8 tegn')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Adgangskoderne matcher ikke')
      return
    }
    setBusy(true)
    setError(null)
    setRecoveryDone(false)
    const { error: err } = await supabase.auth.updateUser({ password: newPassword })
    if (err) {
      setBusy(false)
      setError(err.message)
      return
    }
    window.history.replaceState({}, document.title, '/login')
    setRecoveryDone(true)
    await refresh()
    setBusy(false)
    navigate('/home', { replace: true })
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <div className="mb-4 flex justify-start">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <span aria-hidden>←</span> Gå til forsiden
        </Link>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex justify-center">
          <BrandMark />
        </div>
        {mode === 'login' ? (
          <>
            <h1 className="text-2xl font-semibold text-slate-900">Log ind</h1>
            <p className="mt-1 text-sm text-slate-500">Bilago · dansk SMB-regnskab</p>
            <form className="mt-6 space-y-4" onSubmit={(e) => void submit(e)}>
              <div>
                <label className="text-sm font-medium text-slate-700" htmlFor="email">
                  E-mail
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
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
                  autoComplete="current-password"
                  required
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
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
                {busy ? 'Logger ind…' : 'Log ind'}
              </button>
            </form>
            <button
              type="button"
              className="mt-3 w-full text-center text-sm font-medium text-indigo-600 hover:text-indigo-800"
              onClick={() => {
                setMode('forgot')
                setError(null)
                setForgotDone(false)
              }}
            >
              Glemt adgangskode?
            </button>
          </>
        ) : mode === 'recovery' ? (
          <>
            <h1 className="text-2xl font-semibold text-slate-900">Vælg ny adgangskode</h1>
            <p className="mt-1 text-sm text-slate-500">
              Linket er godkendt. Vælg nu en ny adgangskode til din konto.
            </p>
            <form className="mt-6 space-y-4" onSubmit={(e) => void submitRecovery(e)}>
              <div>
                <label
                  className="text-sm font-medium text-slate-700"
                  htmlFor="new-password"
                >
                  Ny adgangskode
                </label>
                <input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div>
                <label
                  className="text-sm font-medium text-slate-700"
                  htmlFor="confirm-password"
                >
                  Gentag ny adgangskode
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              {error ? (
                <p className="text-sm text-red-600" role="alert">
                  {error}
                </p>
              ) : null}
              {recoveryDone ? (
                <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                  Adgangskoden er opdateret. Du bliver sendt videre.
                </p>
              ) : null}
              <button
                type="submit"
                disabled={busy || !session}
                className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {busy ? 'Gemmer…' : 'Gem ny adgangskode'}
              </button>
              {!session ? (
                <p className="text-sm text-slate-500">
                  Linket klargøres… hvis siden ikke fortsætter, så prøv at åbne mail-linket igen.
                </p>
              ) : null}
            </form>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold text-slate-900">Nulstil adgangskode</h1>
            <p className="mt-1 text-sm text-slate-500">
              Vi sender et link til at vælge en ny adgangskode, hvis kontoen findes.
            </p>
            <form className="mt-6 space-y-4" onSubmit={(e) => void submitForgot(e)}>
              <div>
                <label className="text-sm font-medium text-slate-700" htmlFor="forgot-email">
                  E-mail
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  required
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              {error ? (
                <p className="text-sm text-red-600" role="alert">
                  {error}
                </p>
              ) : null}
              {forgotDone ? (
                <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                  Hvis der findes en konto med denne e-mail, er der sendt et link. Tjek også spam.
                </p>
              ) : null}
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {busy ? 'Sender…' : 'Send nulstillingslink'}
              </button>
            </form>
            <button
              type="button"
              className="mt-4 w-full text-center text-sm font-medium text-slate-600 hover:text-slate-900"
              onClick={() => {
                setMode('login')
                setError(null)
                setForgotDone(false)
              }}
            >
              ← Tilbage til log ind
            </button>
          </>
        )}
        {mode === 'login' ? (
          <p className="mt-4 text-center text-sm text-slate-600">
            Ingen konto?{' '}
            <Link className="font-medium text-indigo-600" to="/signup">
              Opret
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  )
}
