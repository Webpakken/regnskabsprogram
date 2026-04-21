import { useCallback, useEffect, useState } from 'react'
import type { Database } from '@/types/database'
import { supabase } from '@/lib/supabase'

type PublicSettings = Database['public']['Tables']['platform_public_settings']['Row']

export function PlatformPublicSettingsPage() {
  const [pub, setPub] = useState<Partial<PublicSettings>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: qErr } = await supabase
      .from('platform_public_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle()
    setLoading(false)
    if (qErr) {
      setError(qErr.message)
      return
    }
    setPub(data ?? {})
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function savePublic(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    setError(null)
    const { error: uErr } = await supabase
      .from('platform_public_settings')
      .update({
        contact_email: pub.contact_email || null,
        contact_phone: pub.contact_phone || null,
        address_line: pub.address_line || null,
        postal_code: pub.postal_code || null,
        city: pub.city || null,
        org_cvr: pub.org_cvr || null,
        support_hours: pub.support_hours || null,
        terms_url: pub.terms_url || null,
        privacy_url: pub.privacy_url || null,
        monthly_price_cents: pub.monthly_price_cents ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)
    setSaving(false)
    if (uErr) {
      setError(uErr.message)
      return
    }
    setMessage('Offentlige oplysninger gemt.')
    void load()
  }

  if (loading) {
    return (
      <div className="text-center text-sm text-slate-500">Indlæser…</div>
    )
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {message}
        </div>
      ) : null}

      <form
        onSubmit={(e) => void savePublic(e)}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="text-sm font-semibold text-slate-900">Offentlig kontakt og pris</h2>
        <p className="text-xs text-slate-500">
          Vises på forsiden og i sidens fod.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Kontakt e-mail"
            value={pub.contact_email ?? ''}
            onChange={(v) => setPub((p) => ({ ...p, contact_email: v }))}
          />
          <Field
            label="Telefon"
            value={pub.contact_phone ?? ''}
            onChange={(v) => setPub((p) => ({ ...p, contact_phone: v }))}
          />
          <Field
            label="Adresse"
            className="sm:col-span-2"
            value={pub.address_line ?? ''}
            onChange={(v) => setPub((p) => ({ ...p, address_line: v }))}
          />
          <Field
            label="Postnr."
            value={pub.postal_code ?? ''}
            onChange={(v) => setPub((p) => ({ ...p, postal_code: v }))}
          />
          <Field
            label="By"
            value={pub.city ?? ''}
            onChange={(v) => setPub((p) => ({ ...p, city: v }))}
          />
          <Field
            label="CVR (Bilago)"
            value={pub.org_cvr ?? ''}
            onChange={(v) => setPub((p) => ({ ...p, org_cvr: v }))}
          />
          <div className="sm:col-span-2">
            <Field
              label="Supporttider (tekst)"
              value={pub.support_hours ?? ''}
              onChange={(v) => setPub((p) => ({ ...p, support_hours: v }))}
            />
            <p className="mt-1 text-xs text-slate-500">
              Vises på den offentlige side{' '}
              <span className="font-mono text-slate-600">/support-tider</span>.
            </p>
          </div>
          <Field
            label="Link vilkår"
            value={pub.terms_url ?? ''}
            onChange={(v) => setPub((p) => ({ ...p, terms_url: v }))}
          />
          <Field
            label="Link privatliv"
            value={pub.privacy_url ?? ''}
            onChange={(v) => setPub((p) => ({ ...p, privacy_url: v }))}
          />
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-slate-600">
              Månedspris (øre), til visning på forsiden
            </label>
            <input
              type="number"
              min={0}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={pub.monthly_price_cents ?? ''}
              onChange={(e) =>
                setPub((p) => ({
                  ...p,
                  monthly_price_cents: e.target.value
                    ? Number(e.target.value)
                    : null,
                }))
              }
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? 'Gemmer…' : 'Gem offentlige felter'}
        </button>
      </form>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  className = '',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  className?: string
}) {
  return (
    <div className={className}>
      <label className="text-xs font-medium text-slate-600">{label}</label>
      <input
        type="text"
        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
