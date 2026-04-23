import { useMemo } from 'react'
import { usePlatformPublicSettings } from '@/hooks/usePlatformPublicSettings'
import {
  PRICING_DEFAULTS,
  resolveFeatureItems,
  type PricingFeatureItem,
} from '@/lib/pricingPublicDefaults'

const MAX_FEATURE_ITEMS = 8

export function PlatformPublicPricePage() {
  const { pub, setPub, loading, saving, message, error, saveFields } =
    usePlatformPublicSettings()

  const featureItems: PricingFeatureItem[] = useMemo(
    () => resolveFeatureItems(pub.pricing_feature_items),
    [pub.pricing_feature_items],
  )

  function updateFeatureItems(next: PricingFeatureItem[]) {
    setPub((p) => ({ ...p, pricing_feature_items: next }))
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const cleanedItems = featureItems
      .map((f) => ({
        title: f.title.trim(),
        subtitle: f.subtitle.trim(),
      }))
      .filter((f) => f.title.length > 0)

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
        pricing_unit_label: pub.pricing_unit_label?.trim() || null,
        pricing_lock_label: pub.pricing_lock_label?.trim() || null,
        pricing_pitch: pub.pricing_pitch?.trim() || null,
        pricing_features: pub.pricing_features?.trim() || null,
        pricing_feature_items: cleanedItems.length > 0 ? cleanedItems : null,
        pricing_cta_label: pub.pricing_cta_label?.trim() || null,
        pricing_corner_badge: pub.pricing_corner_badge?.trim() || null,
        pricing_footer_left: pub.pricing_footer_left?.trim() || null,
        pricing_footer_right: pub.pricing_footer_right?.trim() || null,
      },
      'Pris og tekster gemt.',
    )
  }

  if (loading) {
    return <div className="text-center text-sm text-slate-500">Indlæser…</div>
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
            standardtekster som i koden. "Spar X%" beregnes automatisk ud fra før- og nu-prisen.
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
            label="Introtilbud-pill (midt foroven)"
            placeholder={PRICING_DEFAULTS.badge}
            value={pub.pricing_badge ?? ''}
            onChange={(v) => setPub((p) => ({ ...p, pricing_badge: v }))}
          />
          <Field
            label="Plan-navn (stor overskrift)"
            placeholder={PRICING_DEFAULTS.planName}
            value={pub.pricing_plan_name ?? ''}
            onChange={(v) => setPub((p) => ({ ...p, pricing_plan_name: v }))}
          />
        </div>

        <Field
          label="Valgfrit: overstyr hjørne-badge (ellers auto «Spar X%»)"
          placeholder="Tom: «Spar X%» beregnes automatisk ud fra priserne"
          value={pub.pricing_corner_badge ?? ''}
          onChange={(v) => setPub((p) => ({ ...p, pricing_corner_badge: v }))}
        />

        <div className="grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-3">
          <div>
            <label className="text-xs font-medium text-slate-600" htmlFor="pricing_compare_cents">
              Gennemstreget pris (øre)
            </label>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Fx 24900 = 249 kr. Tom = skjul linje.
            </p>
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
            <p className="mt-0.5 text-[11px] text-slate-500">
              Fx 9900 = 99 kr. Tom = brug listepris.
            </p>
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
            <p className="mt-0.5 text-[11px] text-slate-500">Systemets interne listepris.</p>
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

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Pris-enhed (efter tallet)"
            placeholder={PRICING_DEFAULTS.unitLabel}
            value={pub.pricing_unit_label ?? ''}
            onChange={(v) => setPub((p) => ({ ...p, pricing_unit_label: v }))}
          />
          <Field
            label="Lock-badge tekst (grøn hængelås)"
            placeholder={PRICING_DEFAULTS.lockLabel}
            value={pub.pricing_lock_label ?? ''}
            onChange={(v) => setPub((p) => ({ ...p, pricing_lock_label: v }))}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600" htmlFor="pricing_pitch">
            Salgstekst under pris
          </label>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Brug <code className="rounded bg-slate-100 px-1">{`{beløb}`}</code> som pladsholder for
            den beregnede pris (fx 99 kr./md).
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

        <div className="border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Feature-liste</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Hver række består af en fed titel og en grå undertekst. Max {MAX_FEATURE_ITEMS} rækker.
              </p>
            </div>
            <button
              type="button"
              disabled={featureItems.length >= MAX_FEATURE_ITEMS}
              onClick={() =>
                updateFeatureItems([...featureItems, { title: '', subtitle: '' }])
              }
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              + Tilføj række
            </button>
          </div>

          <ul className="mt-3 space-y-3">
            {featureItems.map((item, idx) => (
              <li
                key={idx}
                className="rounded-xl border border-slate-200 bg-slate-50/40 p-3"
              >
                <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                  <span>Række {idx + 1}</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => {
                        const next = [...featureItems]
                        ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
                        updateFeatureItems(next)
                      }}
                      className="rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-200 disabled:opacity-30"
                      aria-label="Flyt op"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={idx === featureItems.length - 1}
                      onClick={() => {
                        const next = [...featureItems]
                        ;[next[idx + 1], next[idx]] = [next[idx], next[idx + 1]]
                        updateFeatureItems(next)
                      }}
                      className="rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-200 disabled:opacity-30"
                      aria-label="Flyt ned"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = featureItems.filter((_, i) => i !== idx)
                        updateFeatureItems(next)
                      }}
                      className="rounded px-1.5 py-0.5 text-rose-600 hover:bg-rose-50"
                      aria-label="Slet række"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="Titel (fed)"
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
                  value={item.title}
                  onChange={(e) => {
                    const next = [...featureItems]
                    next[idx] = { ...next[idx], title: e.target.value }
                    updateFeatureItems(next)
                  }}
                />
                <input
                  type="text"
                  placeholder="Undertekst (grå)"
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  value={item.subtitle}
                  onChange={(e) => {
                    const next = [...featureItems]
                    next[idx] = { ...next[idx], subtitle: e.target.value }
                    updateFeatureItems(next)
                  }}
                />
              </li>
            ))}
          </ul>
          {featureItems.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-slate-200 bg-white p-4 text-center text-xs text-slate-500">
              Ingen rækker — der vises fallback fra koden.
            </p>
          ) : null}
        </div>

        <div className="grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
          <Field
            label="Knap-tekst"
            placeholder={PRICING_DEFAULTS.cta}
            value={pub.pricing_cta_label ?? ''}
            onChange={(v) => setPub((p) => ({ ...p, pricing_cta_label: v }))}
          />
          <div />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Footer venstre"
            placeholder={PRICING_DEFAULTS.footerLeft}
            value={pub.pricing_footer_left ?? ''}
            onChange={(v) => setPub((p) => ({ ...p, pricing_footer_left: v }))}
          />
          <Field
            label="Footer højre"
            placeholder={PRICING_DEFAULTS.footerRight}
            value={pub.pricing_footer_right ?? ''}
            onChange={(v) => setPub((p) => ({ ...p, pricing_footer_right: v }))}
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
