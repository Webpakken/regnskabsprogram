import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppProvider'
import {
  cvrValidationHint,
  isPostgresUniqueViolation,
  normalizeCvrDigits,
} from '@/lib/cvr'
import type { EntityType } from '@/lib/cvrLookup'

export function SettingsGeneralPage() {
  const { currentCompany, refresh } = useApp()
  const [name, setName] = useState('')
  const [cvr, setCvr] = useState('')
  const [entityType, setEntityType] = useState<EntityType>('virksomhed')
  const [street, setStreet] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [city, setCity] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Initialiser kun ved virksomhedsskift, så baggrunds-refresh i AppProvider
  // (fx ved tab-skift) ikke overskriver ugemte ændringer.
  const hydratedForCompanyId = useRef<string | null>(null)
  useEffect(() => {
    if (!currentCompany) {
      hydratedForCompanyId.current = null
      return
    }
    if (hydratedForCompanyId.current === currentCompany.id) return
    hydratedForCompanyId.current = currentCompany.id
    setName(currentCompany.name)
    setCvr(currentCompany.cvr ?? '')
    setEntityType(currentCompany.entity_type ?? 'virksomhed')
    setStreet(currentCompany.street_address ?? '')
    setPostalCode(currentCompany.postal_code ?? '')
    setCity(currentCompany.city ?? '')
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
        entity_type: entityType,
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
        <fieldset>
          <legend className="text-sm font-medium text-slate-700">Type</legend>
          <p className="mt-1 text-xs text-slate-500">
            Styrer fx om moms-fanen vises og hvilke indtægts-typer (tilskud, bevillinger, kontingent) der er tilgængelige.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label
              className={
                'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ' +
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
                className="h-4 w-4 text-indigo-600"
              />
              <span className="font-medium">Virksomhed</span>
            </label>
            <label
              className={
                'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ' +
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
                className="h-4 w-4 text-indigo-600"
              />
              <span className="font-medium">Forening</span>
            </label>
          </div>
        </fieldset>
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

    </div>
  )
}
