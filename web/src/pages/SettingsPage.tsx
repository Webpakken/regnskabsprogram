import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useApp, subscriptionOk } from '@/context/AppProvider'
import { formatDateTime } from '@/lib/format'
import { startStripeCheckout } from '@/lib/edge'
import {
  cvrValidationHint,
  isPostgresUniqueViolation,
  normalizeCvrDigits,
} from '@/lib/cvr'

export function SettingsPage() {
  const { currentCompany, subscription, refresh } = useApp()
  const [name, setName] = useState('')
  const [cvr, setCvr] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const ok = subscriptionOk(subscription)

  useEffect(() => {
    if (currentCompany) {
      setName(currentCompany.name)
      setCvr(currentCompany.cvr ?? '')
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
      .update({ name: name.trim(), cvr: cvrDigits })
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
      <p className="text-slate-600">
        Opret virksomhed under onboarding først.
      </p>
    )
  }

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Indstillinger</h1>
        <p className="text-sm text-slate-600">Virksomhed og abonnement</p>
      </div>

      <form
        onSubmit={(e) => void saveCompany(e)}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="text-lg font-medium text-slate-900">Virksomhed</h2>
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
          {saving ? 'Gemmer…' : 'Gem virksomhed'}
        </button>
      </form>

      <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">Abonnement</h2>
        <p className="text-sm text-slate-600">
          Status:{' '}
          <span className="font-medium text-slate-900">
            {subscription?.status ?? 'ingen'}
          </span>
        </p>
        {subscription?.current_period_end ? (
          <p className="text-sm text-slate-600">
            Nuværende periode slutter:{' '}
            {formatDateTime(subscription.current_period_end)}
          </p>
        ) : null}
        {!ok ? (
          <button
            type="button"
            className="mt-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            onClick={() =>
              void startStripeCheckout(currentCompany.id).then((url) => {
                window.location.href = url
              })
            }
          >
            Aktivér abonnement
          </button>
        ) : null}
      </div>
    </div>
  )
}
