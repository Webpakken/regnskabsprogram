import { usePlatformPublicSettings } from '@/hooks/usePlatformPublicSettings'

export function PlatformPublicHoursPage() {
  const { pub, setPub, loading, saving, message, error, saveFields } =
    usePlatformPublicSettings()

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    await saveFields(
      { support_hours: pub.support_hours || null },
      'Åbningstider gemt.',
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
        <h2 className="text-sm font-semibold text-slate-900">Åbningstider</h2>
        <p className="text-xs text-slate-500">
          Vises på den offentlige side{' '}
          <span className="font-mono text-slate-600">/support-tider</span>. Du kan
          skrive flere linjer.
        </p>
        <div>
          <label className="text-xs font-medium text-slate-600" htmlFor="support_hours">
            Tekst
          </label>
          <textarea
            id="support_hours"
            rows={10}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={pub.support_hours ?? ''}
            onChange={(e) =>
              setPub((p) => ({ ...p, support_hours: e.target.value }))
            }
            placeholder={'Fx Mandag–torsdag 9–16\nFredag 9–14'}
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? 'Gemmer…' : 'Gem åbningstider'}
        </button>
      </form>
    </div>
  )
}
