import { usePlatformPublicSettings } from '@/hooks/usePlatformPublicSettings'

export function PlatformPublicContactPage() {
  const { pub, setPub, loading, saving, message, error, saveFields } =
    usePlatformPublicSettings()

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    await saveFields(
      {
        contact_email: pub.contact_email || null,
        contact_phone: pub.contact_phone || null,
        address_line: pub.address_line || null,
        postal_code: pub.postal_code || null,
        city: pub.city || null,
        org_cvr: pub.org_cvr || null,
        support_hours: pub.support_hours || null,
        terms_url: pub.terms_url || null,
        privacy_url: pub.privacy_url || null,
      },
      'Kontakt og links gemt.',
    )
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
        onSubmit={(e) => void onSubmit(e)}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="text-sm font-semibold text-slate-900">Kontakt & links</h2>
        <p className="text-xs text-slate-500">
          Vises på forsiden og i sidens fod. Brug Enter i felterne nedenfor for nye linjer
          — de vises også på websitet.
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
          <TextArea
            label="Åbningstider og noter"
            hint="Samme tekst som under fanen «Åbningstider». Flere linjer vises på forsiden og under Kontakt."
            className="sm:col-span-2"
            rows={5}
            value={pub.support_hours ?? ''}
            onChange={(v) => setPub((p) => ({ ...p, support_hours: v }))}
            placeholder={'Fx Mandag – torsdag 9–15 Fredag 9–12\nWeekend lukket'}
          />
          <TextArea
            label="Adresse"
            className="sm:col-span-2"
            rows={3}
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
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? 'Gemmer…' : 'Gem kontakt & links'}
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

function TextArea({
  label,
  hint,
  value,
  onChange,
  className = '',
  rows = 4,
  placeholder,
}: {
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
  className?: string
  rows?: number
  placeholder?: string
}) {
  return (
    <div className={className}>
      <label className="text-xs font-medium text-slate-600">{label}</label>
      {hint ? <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p> : null}
      <textarea
        rows={rows}
        placeholder={placeholder}
        className="mt-1 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
