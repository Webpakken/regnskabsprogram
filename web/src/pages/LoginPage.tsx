import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { invokeAuthPasswordReset } from '@/lib/edge'
import { useApp } from '@/context/AppProvider'

export function LoginPage() {
  const { session, loading } = useApp()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'login' | 'forgot'>('login')
  const [forgotDone, setForgotDone] = useState(false)

  if (!loading && session) {
    return <Navigate to="/" replace />
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    setBusy(false)
    if (err) {
      setError(err.message)
      return
    }
    navigate('/')
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

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
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
        <Link
          to="/"
          className="mt-4 flex w-full items-center justify-center rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Gå til forsiden
        </Link>
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
