import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppProvider'
import { AppPageLayout } from '@/components/AppPageLayout'
import { PasswordInput } from '@/components/PasswordInput'
import { validateSignupPassword } from '@/lib/passwordPolicy'
import { translateAuthErrorDa } from '@/lib/authErrors'

export function MinProfilePage() {
  const { user, profile, refresh } = useApp()
  const [fullName, setFullName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [nameMessage, setNameMessage] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPw, setSavingPw] = useState(false)
  const [pwMessage, setPwMessage] = useState<string | null>(null)
  const [pwError, setPwError] = useState<string | null>(null)

  const hydratedForId = useRef<string | null>(null)
  useEffect(() => {
    if (!profile) {
      hydratedForId.current = null
      return
    }
    if (hydratedForId.current === profile.id) return
    hydratedForId.current = profile.id
    setFullName(profile.full_name ?? '')
  }, [profile])

  async function saveName(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setSavingName(true)
    setNameMessage(null)
    setNameError(null)
    const trimmed = fullName.trim()
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: trimmed || null })
      .eq('id', profile.id)
    setSavingName(false)
    if (error) {
      setNameError(error.message)
      return
    }
    setNameMessage('Gemt.')
    await refresh()
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    setPwMessage(null)
    setPwError(null)
    const policyErr = validateSignupPassword(newPassword)
    if (policyErr) {
      setPwError(policyErr)
      return
    }
    if (newPassword !== confirmPassword) {
      setPwError('De to adgangskoder er ikke ens.')
      return
    }
    setSavingPw(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setSavingPw(false)
    if (error) {
      setPwError(translateAuthErrorDa(error.message))
      return
    }
    setNewPassword('')
    setConfirmPassword('')
    setPwMessage('Adgangskode opdateret.')
  }

  return (
    <AppPageLayout maxWidth="full" className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Min profil</h1>
        <p className="text-sm text-slate-600">Opdater dit navn og adgangskode.</p>
      </div>

      <form
        onSubmit={(e) => void saveName(e)}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="text-lg font-medium text-slate-900">Profiloplysninger</h2>
        <div>
          <label className="text-sm font-medium text-slate-700" htmlFor="profile-email">
            E-mail
          </label>
          <input
            id="profile-email"
            type="email"
            value={user?.email ?? ''}
            readOnly
            className="mt-1 w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
          />
          <p className="mt-1 text-xs text-slate-500">
            E-mail kan ikke ændres. Kontakt support hvis det er nødvendigt.
          </p>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700" htmlFor="profile-name">
            Navn
          </label>
          <input
            id="profile-name"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="Dit fulde navn"
          />
        </div>
        {nameError ? (
          <p className="text-sm text-red-600" role="alert">
            {nameError}
          </p>
        ) : null}
        {nameMessage ? (
          <p className="text-sm text-emerald-700" role="status">
            {nameMessage}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={savingName}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {savingName ? 'Gemmer…' : 'Gem'}
        </button>
      </form>

      <form
        onSubmit={(e) => void changePassword(e)}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="text-lg font-medium text-slate-900">Skift adgangskode</h2>
        <div>
          <label className="text-sm font-medium text-slate-700" htmlFor="new-pw">
            Ny adgangskode
          </label>
          <PasswordInput
            id="new-pw"
            autoComplete="new-password"
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <p className="mt-1 text-xs text-slate-500">
            Mindst 8 tegn: små og store bogstaver, tal og mindst ét symbol (fx ! # -).
          </p>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700" htmlFor="confirm-pw">
            Bekræft ny adgangskode
          </label>
          <PasswordInput
            id="confirm-pw"
            autoComplete="new-password"
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>
        {pwError ? (
          <p className="text-sm text-red-600" role="alert">
            {pwError}
          </p>
        ) : null}
        {pwMessage ? (
          <p className="text-sm text-emerald-700" role="status">
            {pwMessage}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={savingPw || !newPassword || !confirmPassword}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {savingPw ? 'Opdaterer…' : 'Opdater adgangskode'}
        </button>
      </form>

      <TwoFactorSection />
    </AppPageLayout>
  )
}

type TotpFactor = { id: string; friendly_name: string | null; status: 'verified' | 'unverified' }
type Enrollment = { factorId: string; qrCode: string; secret: string }

function TwoFactorSection() {
  const [factors, setFactors] = useState<TotpFactor[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [enrolling, setEnrolling] = useState(false)
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
  const [enrollCode, setEnrollCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [disabling, setDisabling] = useState<string | null>(null)
  const [secretVisible, setSecretVisible] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  async function loadFactors() {
    setLoadError(null)
    const { data, error } = await supabase.auth.mfa.listFactors()
    if (error) {
      setLoadError(error.message)
      return
    }
    setFactors((data?.totp ?? []) as TotpFactor[])
  }

  useEffect(() => {
    void loadFactors()
  }, [])

  async function startEnrollment() {
    setEnrolling(true)
    setVerifyError(null)
    setStatusMessage(null)
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `Bilago ${new Date().toISOString().slice(0, 10)}`,
    })
    setEnrolling(false)
    if (error || !data) {
      setVerifyError(error?.message ?? 'Kunne ikke starte aktivering')
      return
    }
    setEnrollment({
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
    })
    setEnrollCode('')
    setSecretVisible(false)
  }

  async function cancelEnrollment() {
    if (!enrollment) return
    await supabase.auth.mfa.unenroll({ factorId: enrollment.factorId })
    setEnrollment(null)
    setEnrollCode('')
    setVerifyError(null)
  }

  async function verifyEnrollment(e: React.FormEvent) {
    e.preventDefault()
    if (!enrollment) return
    const code = enrollCode.replace(/\s+/g, '')
    if (!/^\d{6}$/.test(code)) {
      setVerifyError('Indtast den 6-cifrede kode fra din authenticator-app.')
      return
    }
    setVerifying(true)
    setVerifyError(null)
    const challengeRes = await supabase.auth.mfa.challenge({ factorId: enrollment.factorId })
    if (challengeRes.error || !challengeRes.data) {
      setVerifying(false)
      setVerifyError(challengeRes.error?.message ?? 'Kunne ikke starte verifikation')
      return
    }
    const verifyRes = await supabase.auth.mfa.verify({
      factorId: enrollment.factorId,
      challengeId: challengeRes.data.id,
      code,
    })
    setVerifying(false)
    if (verifyRes.error) {
      setVerifyError('Koden er forkert eller udløbet — prøv igen.')
      return
    }
    setEnrollment(null)
    setEnrollCode('')
    setStatusMessage('2-trins login er nu aktiveret.')
    await loadFactors()
  }

  async function disableFactor(id: string) {
    if (!window.confirm('Er du sikker på at du vil deaktivere 2-trins login?')) return
    setDisabling(id)
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id })
    setDisabling(null)
    if (error) {
      setVerifyError(error.message)
      return
    }
    setStatusMessage('2-trins login deaktiveret.')
    await loadFactors()
  }

  const verifiedFactors = (factors ?? []).filter((f) => f.status === 'verified')
  const isActive = verifiedFactors.length > 0

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-slate-900">2-trins login</h2>
          <p className="mt-1 text-sm text-slate-600">
            Beskyt din konto med en 6-cifret kode fra en authenticator-app (Google Authenticator, 1Password,
            Authy m.fl.) ved login.
          </p>
        </div>
        {isActive ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
            Aktiveret
          </span>
        ) : (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            Ikke aktiv
          </span>
        )}
      </div>

      {loadError ? (
        <p className="text-sm text-red-600" role="alert">
          {loadError}
        </p>
      ) : null}

      {statusMessage ? (
        <p className="text-sm text-emerald-700" role="status">
          {statusMessage}
        </p>
      ) : null}

      {factors === null ? (
        <p className="text-sm text-slate-500">Indlæser…</p>
      ) : enrollment ? (
        <form
          onSubmit={(e) => void verifyEnrollment(e)}
          className="space-y-4 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4"
        >
          <div>
            <p className="text-sm font-medium text-slate-900">Skan QR-koden</p>
            <p className="mt-1 text-xs text-slate-600">
              Åbn din authenticator-app og skan billedet, eller indtast nøglen manuelt.
            </p>
          </div>
          <div className="flex flex-col items-start gap-4 sm:flex-row">
            <div className="rounded-xl border border-slate-200 bg-white p-2">
              <img
                src={enrollment.qrCode}
                alt="QR-kode til 2-trins login"
                className="h-44 w-44"
              />
            </div>
            <div className="min-w-0 flex-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Manuel nøgle
              </label>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <code className="break-all rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                  {secretVisible ? enrollment.secret : '••••••••••••••••'}
                </code>
                <button
                  type="button"
                  onClick={() => setSecretVisible((v) => !v)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  {secretVisible ? 'Skjul' : 'Vis'}
                </button>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(enrollment.secret)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Kopiér
                </button>
              </div>
              <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Verifikationskode
              </label>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={enrollCode}
                onChange={(e) => setEnrollCode(e.target.value)}
                placeholder="123456"
                className="mt-1 w-40 rounded-lg border border-slate-200 bg-white px-3 py-2 text-base tracking-widest text-slate-900"
              />
              {verifyError ? (
                <p className="mt-2 text-sm text-red-600" role="alert">
                  {verifyError}
                </p>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={verifying || enrollCode.length !== 6}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {verifying ? 'Verificerer…' : 'Aktiver'}
                </button>
                <button
                  type="button"
                  onClick={() => void cancelEnrollment()}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Annullér
                </button>
              </div>
            </div>
          </div>
        </form>
      ) : isActive ? (
        <div className="space-y-3">
          {verifiedFactors.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"
            >
              <span className="text-slate-700">
                {f.friendly_name ?? 'Authenticator-app'}
              </span>
              <button
                type="button"
                disabled={disabling === f.id}
                onClick={() => void disableFactor(f.id)}
                className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
              >
                {disabling === f.id ? 'Deaktiverer…' : 'Deaktiver'}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div>
          {verifyError ? (
            <p className="mb-3 text-sm text-red-600" role="alert">
              {verifyError}
            </p>
          ) : null}
          <button
            type="button"
            disabled={enrolling}
            onClick={() => void startEnrollment()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {enrolling ? 'Forbereder…' : 'Aktiver 2-trins login'}
          </button>
        </div>
      )}
    </div>
  )
}
