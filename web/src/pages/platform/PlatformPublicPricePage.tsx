import { usePlatformPublicSettings } from '@/hooks/usePlatformPublicSettings'

export function PlatformPublicPricePage() {
  const { pub, setPub, loading, saving, message, error, saveFields } =
    usePlatformPublicSettings()

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    await saveFields(
      { monthly_price_cents: pub.monthly_price_cents ?? null },
      'Pris gemt.',
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
        <h2 className="text-sm font-semibold text-slate-900">Pris (visning)</h2>
        <p className="text-xs text-slate-500">
          Listepris i øre til visning på forsiden (fx 24900 for 249 kr.). Tilpasser
          ikke Stripe — kun tekst.
        </p>
        <div>
          <label className="text-xs font-medium text-slate-600" htmlFor="monthly_price_cents">
            Månedspris (øre)
          </label>
          <input
            id="monthly_price_cents"
            type="number"
            min={0}
            className="mt-1 w-full max-w-xs rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={pub.monthly_price_cents ?? ''}
            onChange={(e) =>
              setPub((p) => ({
                ...p,
                monthly_price_cents: e.target.value ? Number(e.target.value) : null,
              }))
            }
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? 'Gemmer…' : 'Gem pris'}
        </button>
      </form>
    </div>
  )
}
