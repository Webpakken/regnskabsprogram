import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppProvider'

type VatPeriod = 'monthly' | 'quarterly' | 'half_yearly'

const VAT_PERIOD_LABEL: Record<VatPeriod, string> = {
  monthly: 'Månedligt',
  quarterly: 'Kvartalsvis',
  half_yearly: 'Halvårligt',
}

export function SettingsVatPage() {
  const { currentCompany, currentRole, refresh } = useApp()
  const canEdit = currentRole === 'owner' || currentRole === 'manager'
  const [vatRegistered, setVatRegistered] = useState(true)
  const [vatPeriod, setVatPeriod] = useState<VatPeriod>('quarterly')
  const [vatPeriodStartedAt, setVatPeriodStartedAt] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const hydratedForCompanyId = useRef<string | null>(null)
  useEffect(() => {
    if (!currentCompany) {
      hydratedForCompanyId.current = null
      return
    }
    if (hydratedForCompanyId.current === currentCompany.id) return
    hydratedForCompanyId.current = currentCompany.id
    setVatRegistered(currentCompany.vat_registered ?? true)
    setVatPeriod((currentCompany.vat_period as VatPeriod) ?? 'quarterly')
    setVatPeriodStartedAt(currentCompany.vat_period_started_at ?? '')
  }, [currentCompany])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!currentCompany) return
    setSaving(true)
    setMessage(null)
    setSaveError(null)
    const { error } = await supabase
      .from('companies')
      .update({
        vat_registered: vatRegistered,
        vat_period: vatPeriod,
        vat_period_started_at: vatPeriodStartedAt || null,
      })
      .eq('id', currentCompany.id)
    setSaving(false)
    if (error) {
      setSaveError(error.message)
      return
    }
    setMessage('Gemt.')
    await refresh()
  }

  if (!currentCompany) {
    return <p className="text-slate-600">Opret virksomhed under onboarding først.</p>
  }
  if (currentCompany.entity_type !== 'virksomhed') {
    return (
      <p className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
        Moms-indstillinger er kun relevante for virksomheder. Foreninger har ikke moms.
      </p>
    )
  }

  return (
    <div className="space-y-8">
      <form
        onSubmit={(e) => void save(e)}
        className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-lg font-medium text-slate-900">Momsregistrering</h2>
          <a
            href="https://skat.dk/erhverv/moms"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-indigo-600 hover:underline"
          >
            Læs mere
          </a>
        </div>

        <fieldset disabled={!canEdit} className="space-y-3 border-0 p-0">
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition ${
              vatRegistered
                ? 'border-indigo-300 bg-indigo-50/50 ring-1 ring-indigo-200'
                : 'border-slate-200 bg-white hover:bg-slate-50'
            }`}
          >
            <input
              type="radio"
              name="vat_registered"
              checked={vatRegistered}
              onChange={() => setVatRegistered(true)}
              className="mt-0.5 h-4 w-4 text-indigo-600"
            />
            <div className="min-w-0">
              <div className="font-medium text-slate-900">Jeg er momspligtig</div>
              <p className="mt-0.5 text-sm text-slate-600">
                Standard for virksomheder med en omsætning over 50.000 kr/år.
              </p>
            </div>
          </label>
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition ${
              !vatRegistered
                ? 'border-indigo-300 bg-indigo-50/50 ring-1 ring-indigo-200'
                : 'border-slate-200 bg-white hover:bg-slate-50'
            }`}
          >
            <input
              type="radio"
              name="vat_registered"
              checked={!vatRegistered}
              onChange={() => setVatRegistered(false)}
              className="mt-0.5 h-4 w-4 text-indigo-600"
            />
            <div className="min-w-0">
              <div className="font-medium text-slate-900">Jeg er momsfritaget</div>
              <p className="mt-0.5 text-sm text-slate-600">
                Der skal ikke beregnes moms på mine salg og køb.{' '}
                <a
                  href="https://skat.dk/erhverv/moms/momsfritaget-virksomhed"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-indigo-600 hover:underline"
                >
                  Læs mere
                </a>
                .
              </p>
            </div>
          </label>
        </fieldset>

        {vatRegistered ? (
          <fieldset disabled={!canEdit} className="space-y-4 border-0 p-0">
            <div>
              <label className="text-sm font-medium text-slate-700" htmlFor="vat-period">
                Momsafregningsinterval
              </label>
              <select
                id="vat-period"
                value={vatPeriod}
                onChange={(e) => setVatPeriod(e.target.value as VatPeriod)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                {(Object.keys(VAT_PERIOD_LABEL) as VatPeriod[]).map((p) => (
                  <option key={p} value={p}>
                    {VAT_PERIOD_LABEL[p]}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">
                SKAT placerer dig automatisk efter omsætning. Tjek dit eget interval på
                skat.dk hvis du er i tvivl.
              </p>
            </div>

            <div>
              <label
                className="text-sm font-medium text-slate-700"
                htmlFor="vat-period-start"
              >
                Momsafregningsinterval trådte i kraft fra
              </label>
              <input
                id="vat-period-start"
                type="date"
                value={vatPeriodStartedAt}
                onChange={(e) => setVatPeriodStartedAt(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-slate-500">
                Datoen for den første dag i den nuværende afregningsperiode.
              </p>
            </div>
          </fieldset>
        ) : null}

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

        {canEdit ? (
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {saving ? 'Gemmer…' : 'Gem'}
          </button>
        ) : null}
      </form>
    </div>
  )
}
