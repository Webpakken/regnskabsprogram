import { usePlatformPublicSettings } from '@/hooks/usePlatformPublicSettings'
import { PRICING_DEFAULTS } from '@/lib/pricingPublicDefaults'

export function PlatformPublicPricePage() {
  const { pub, setPub, loading, saving, message, error, saveFields } =
    usePlatformPublicSettings()

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    await saveFields(
      {
        pricing_title: pub.pricing_title?.trim() || null,
        pricing_subtitle: pub.pricing_subtitle?.trim() || null,
        pricing_badge: pub.pricing_badge?.trim() || null,
        pricing_plan_name: pub.pricing_plan_name?.trim() || null,
        pricing_compare_cents:
          pub.pricing_compare_cents != null && pub.pricing_compare_cents > 0
            ? pub.pricing_compare_cents
            : null,
        pricing_amount_cents:
          pub.pricing_amount_cents != null && pub.pricing_amount_cents > 0
            ? pub.pricing_amount_cents
            : null,
        monthly_price_cents:
          pub.monthly_price_cents != null && pub.monthly_price_cents > 0
            ? pub.monthly_price_cents
            : null,
        pricing_pitch: pub.pricing_pitch?.trim() || null,
        pricing_features: pub.pricing_features?.trim() || null,
        pricing_cta_label: pub.pricing_cta_label?.trim() || null,
      },
      'Pris og tekster gemt.',
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
        className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Pris på forsiden</h2>
          <p className="mt-1 text-xs text-slate-500">
            Alt her vises i prissektionen på den offentlige forside (
            <span className="font-mono">#pricing</span>). Tomme felter bruger
            standardtekster som i koden.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Overskrift"
            placeholder={PRICING_DEFAULTS.title}
            value={pub.pricing_title ?? ''}
            onChange={(v) => setPub((p) => ({ ...p, pricing_title: v }))}
          />
          <Field
            label="Undertitel"
            placeholder={PRICING_DEFAULTS.subtitle}
            value={pub.pricing_subtitle ?? ''}
            onChange={(v) => setPub((p) => ({ ...p, pricing_subtitle: v }))}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Badge (lille pill)"
            placeholder={PRICING_DEFAULTS.badge}
            value={pub.pricing_badge ?? ''}
            onChange={(v) => setPub((p) => ({ ...p, pricing_badge: v }))}
          />
          <Field
            label="Produktnavn i kort"
            placeholder={PRICING_DEFAULTS.planName}
            value={pub.pricing_plan_name ?? ''}
            onChange={(v) => setPub((p) => ({ ...p, pricing_plan_name: v }))}
          />
        </div>

        <div className="grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-3">
          <div>
            <label className="text-xs font-medium text-slate-600" htmlFor="pricing_compare_cents">
              Gennemstreget pris (øre)
            </label>
            <p className="mt-0.5 text-[11px] text-slate-500">Fx 24900 = 249 kr. Tom = skjul linje.</p>
            <input
              id="pricing_compare_cents"
              type="number"
              min={0}
              placeholder="24900"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={pub.pricing_compare_cents ?? ''}
              onChange={(e) =>
                setPub((p) => ({
                  ...p,
                  pricing_compare_cents: e.target.value ? Number(e.target.value) : null,
                }))
              }
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600" htmlFor="pricing_amount_cents">
              Stor hovedpris (øre)
            </label>
            <p className="mt-0.5 text-[11px] text-slate-500">Fx 9900 = 99 kr. Tom = brug listepris.</p>
            <input
              id="pricing_amount_cents"
              type="number"
              min={0}
              placeholder="9900"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={pub.pricing_amount_cents ?? ''}
              onChange={(e) =>
                setPub((p) => ({
                  ...p,
                  pricing_amount_cents: e.target.value ? Number(e.target.value) : null,
                }))
              }
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600" htmlFor="monthly_price_cents">
              Listepris i system (øre)
            </label>
            <p className="mt-0.5 text-[11px] text-slate-500">Vises som note under prisen.</p>
            <input
              id="monthly_price_cents"
              type="number"
              min={0}
              placeholder="9900"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={pub.monthly_price_cents ?? ''}
              onChange={(e) =>
                setPub((p) => ({
                  ...p,
                  monthly_price_cents: e.target.value ? Number(e.target.value) : null,
                }))
              }
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600" htmlFor="pricing_pitch">
            Salgstekst under pris
          </label>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Brug <code className="rounded bg-slate-100 px-1">{`{beløb}`}</code> som pladsholder for den
            beregnede pris (fx 99 kr./md).
          </p>
          <textarea
            id="pricing_pitch"
            rows={3}
            placeholder={PRICING_DEFAULTS.pitch}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={pub.pricing_pitch ?? ''}
            onChange={(e) => setPub((p) => ({ ...p, pricing_pitch: e.target.value }))}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600" htmlFor="pricing_features">
            Punktliste (én linje pr. punkt)
          </label>
          <textarea
            id="pricing_features"
            rows={8}
            placeholder={PRICING_DEFAULTS.features}
            className="mt-1 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
            value={pub.pricing_features ?? ''}
            onChange={(e) => setPub((p) => ({ ...p, pricing_features: e.target.value }))}
          />
        </div>

        <div>
          <Field
            label="Knaptekst"
            placeholder={PRICING_DEFAULTS.cta}
            value={pub.pricing_cta_label ?? ''}
            onChange={(v) => setPub((p) => ({ ...p, pricing_cta_label: v }))}
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? 'Gemmer…' : 'Gem pris og tekster'}
        </button>
      </form>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-600">{label}</label>
      <input
        type="text"
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
