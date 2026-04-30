import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppProvider'
import { BrandMark } from '@/components/BrandMark'
import { logoutToLanding } from '@/lib/logoutToLanding'

export function TwoFactorChallengePage() {
  const { session, aalNeedsUpgrade, refresh } = useApp()
  const navigate = useNavigate()
  const [factorId, setFactorId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase.auth.mfa.listFactors()
      if (cancelled) return
      if (error) {
        setLoadError(error.message)
        return
      }
      const verified = (data?.totp ?? []).find((f) => f.status === 'verified')
      if (!verified) {
        setLoadError('Ingen aktiv 2-trins faktor fundet.')
        return
      }
      setFactorId(verified.id)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (!session) {
    return <Navigate to="/login" replace />
  }
  if (!aalNeedsUpgrade) {
    return <Navigate to="/home" replace />
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    if (!factorId) return
    const trimmed = code.replace(/\s+/g, '')
    if (!/^\d{6}$/.test(trimmed)) {
      setVerifyError('Indtast den 6-cifrede kode fra din authenticator-app.')
      return
    }
    setVerifying(true)
    setVerifyError(null)
    const challengeRes = await supabase.auth.mfa.challenge({ factorId })
    if (challengeRes.error || !challengeRes.data) {
      setVerifying(false)
      setVerifyError(challengeRes.error?.message ?? 'Kunne ikke starte verifikation')
      return
    }
    const verifyRes = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeRes.data.id,
      code: trimmed,
    })
    setVerifying(false)
    if (verifyRes.error) {
      setVerifyError('Koden er forkert eller udløbet — prøv igen.')
      setCode('')
      return
    }
    await refresh()
    navigate('/home', { replace: true })
  }

  async function cancel() {
    await logoutToLanding(navigate)
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex justify-center">
          <BrandMark />
        </div>
        <h1 className="text-2xl font-semibold text-slate-900">2-trins login</h1>
        <p className="mt-2 text-sm text-slate-600">
          Indtast den 6-cifrede kode fra din authenticator-app for at fortsætte.
        </p>
        {loadError ? (
          <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {loadError}
          </p>
        ) : null}
        <form onSubmit={(e) => void verify(e)} className="mt-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700" htmlFor="totp-code">
              Verifikationskode
            </label>
            <input
              id="totp-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-lg tracking-[0.5em] text-slate-900"
            />
          </div>
          {verifyError ? (
            <p className="text-sm text-red-600" role="alert">
              {verifyError}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={verifying || !factorId || code.length !== 6}
            className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {verifying ? 'Verificerer…' : 'Bekræft og fortsæt'}
          </button>
        </form>
        <button
          type="button"
          onClick={() => void cancel()}
          className="mt-4 w-full text-center text-sm font-medium text-slate-500 hover:text-slate-700"
        >
          Log ud og prøv en anden konto
        </button>
      </div>
    </div>
  )
}
