import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatKrPerMonth } from '@/lib/format'
import { useApp } from '@/context/AppProvider'
import type { Database } from '@/types/database'

type Plan = Database['public']['Tables']['billing_plans']['Row']
type Feature = Database['public']['Tables']['billing_features']['Row']
type PlanFeature = Database['public']['Tables']['billing_plan_features']['Row']

type NewPlanState = {
  name: string
  slug: string
  monthlyPriceKr: string
  stripePriceId: string
  description: string
}

const emptyPlan: NewPlanState = {
  name: '',
  slug: '',
  monthlyPriceKr: '',
  stripePriceId: '',
  description: '',
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function PlatformBillingPlansPage() {
  const { platformRole } = useApp()
  const [plans, setPlans] = useState<Plan[]>([])
  const [features, setFeatures] = useState<Feature[]>([])
  const [planFeatures, setPlanFeatures] = useState<PlanFeature[]>([])
  const [newPlan, setNewPlan] = useState<NewPlanState>(emptyPlan)
  const [newFeatureName, setNewFeatureName] = useState('')
  const [newFeatureKey, setNewFeatureKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [planRes, featureRes, planFeatureRes] = await Promise.all([
      supabase.from('billing_plans').select('*').order('sort_order', { ascending: true }).order('name'),
      supabase.from('billing_features').select('*').order('sort_order', { ascending: true }).order('name'),
      supabase.from('billing_plan_features').select('*'),
    ])
    if (planRes.error || featureRes.error || planFeatureRes.error) {
      setError(planRes.error?.message ?? featureRes.error?.message ?? planFeatureRes.error?.message ?? 'Kunne ikke hente planer')
      return
    }
    setPlans(planRes.data ?? [])
    setFeatures(featureRes.data ?? [])
    setPlanFeatures(planFeatureRes.data ?? [])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const planFeatureByKey = useMemo(() => {
    const map = new Map<string, PlanFeature>()
    for (const row of planFeatures) {
      map.set(`${row.plan_id}:${row.feature_id}`, row)
    }
    return map
  }, [planFeatures])

  if (platformRole !== 'superadmin') {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Kun superadmin kan ændre planer og features.
      </p>
    )
  }

  async function createPlan() {
    const name = newPlan.name.trim()
    const slug = (newPlan.slug.trim() || slugify(name)).trim()
    if (!name || !slug) return
    setSaving(true)
    setError(null)
    const monthlyPriceCents = Math.max(
      0,
      Math.round((Number(newPlan.monthlyPriceKr.replace(',', '.')) || 0) * 100),
    )
    const { error: insertErr } = await supabase.from('billing_plans').insert({
      name,
      slug,
      description: newPlan.description.trim() || null,
      monthly_price_cents: monthlyPriceCents,
      stripe_price_id: newPlan.stripePriceId.trim() || null,
      active: true,
      sort_order: (plans.at(-1)?.sort_order ?? 0) + 10,
    })
    setSaving(false)
    if (insertErr) {
      setError(insertErr.message)
      return
    }
    setNewPlan(emptyPlan)
    await load()
  }

  async function createFeature() {
    const name = newFeatureName.trim()
    const key = (newFeatureKey.trim() || slugify(name).replace(/-/g, '_')).trim()
    if (!name || !key) return
    setSaving(true)
    setError(null)
    const { error: insertErr } = await supabase.from('billing_features').insert({
      name,
      key,
      active: true,
      sort_order: (features.at(-1)?.sort_order ?? 0) + 10,
    })
    setSaving(false)
    if (insertErr) {
      setError(insertErr.message)
      return
    }
    setNewFeatureName('')
    setNewFeatureKey('')
    await load()
  }

  async function updatePlan(plan: Plan, patch: Database['public']['Tables']['billing_plans']['Update']) {
    setError(null)
    const { error: updateErr } = await supabase
      .from('billing_plans')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', plan.id)
    if (updateErr) {
      setError(updateErr.message)
      return
    }
    setPlans((prev) => prev.map((p) => (p.id === plan.id ? { ...p, ...patch } : p)))
  }

  async function setPlanFeature(plan: Plan, feature: Feature, enabled: boolean, limitValue: number | null) {
    setError(null)
    const { data, error: upsertErr } = await supabase
      .from('billing_plan_features')
      .upsert(
        {
          plan_id: plan.id,
          feature_id: feature.id,
          enabled,
          limit_value: limitValue,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'plan_id,feature_id' },
      )
      .select('*')
      .single()
    if (upsertErr || !data) {
      setError(upsertErr?.message ?? 'Kunne ikke gemme feature')
      return
    }
    setPlanFeatures((prev) => {
      const rest = prev.filter((row) => !(row.plan_id === plan.id && row.feature_id === feature.id))
      return [...rest, data]
    })
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(24rem,0.8fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Planer og priser</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Plan</th>
                  <th className="py-2 pr-3">Pris</th>
                  <th className="py-2 pr-3">Stripe Price ID</th>
                  <th className="py-2 pr-3">Aktiv</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <tr key={plan.id} className="border-t border-slate-100">
                    <td className="py-3 pr-3">
                      <div className="font-medium text-slate-900">{plan.name}</div>
                      <div className="font-mono text-xs text-slate-500">{plan.slug}</div>
                    </td>
                    <td className="py-3 pr-3 text-slate-700">
                      {formatKrPerMonth(plan.monthly_price_cents)}
                    </td>
                    <td className="py-3 pr-3">
                      <input
                        value={plan.stripe_price_id ?? ''}
                        onChange={(e) => {
                          const value = e.target.value
                          setPlans((prev) =>
                            prev.map((p) => (p.id === plan.id ? { ...p, stripe_price_id: value || null } : p)),
                          )
                        }}
                        onBlur={(e) => void updatePlan(plan, { stripe_price_id: e.target.value.trim() || null })}
                        placeholder="price_..."
                        className="w-56 rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-xs"
                      />
                    </td>
                    <td className="py-3 pr-3">
                      <input
                        type="checkbox"
                        checked={plan.active}
                        onChange={(e) => void updatePlan(plan, { active: e.target.checked })}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Ny plan</h2>
          <div className="mt-4 space-y-3">
            <input
              value={newPlan.name}
              onChange={(e) =>
                setNewPlan((p) => ({
                  ...p,
                  name: e.target.value,
                  slug: p.slug || slugify(e.target.value),
                }))
              }
              placeholder="Pro"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              value={newPlan.slug}
              onChange={(e) => setNewPlan((p) => ({ ...p, slug: slugify(e.target.value) }))}
              placeholder="pro"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm"
            />
            <input
              value={newPlan.monthlyPriceKr}
              onChange={(e) => setNewPlan((p) => ({ ...p, monthlyPriceKr: e.target.value }))}
              placeholder="99"
              inputMode="decimal"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              value={newPlan.stripePriceId}
              onChange={(e) => setNewPlan((p) => ({ ...p, stripePriceId: e.target.value }))}
              placeholder="price_..."
              className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm"
            />
            <textarea
              value={newPlan.description}
              onChange={(e) => setNewPlan((p) => ({ ...p, description: e.target.value }))}
              placeholder="Kort beskrivelse"
              className="min-h-20 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={saving || !newPlan.name.trim()}
              onClick={() => void createPlan()}
              className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Opret plan
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Features pr. plan</h2>
            <p className="mt-1 text-sm text-slate-600">
              Slå funktioner til/fra og sæt eventuelle limits. Tomt limit betyder ubegrænset eller ikke relevant.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(10rem,1fr)_minmax(10rem,1fr)_auto]">
            <input
              value={newFeatureName}
              onChange={(e) => {
                setNewFeatureName(e.target.value)
                if (!newFeatureKey) setNewFeatureKey(slugify(e.target.value).replace(/-/g, '_'))
              }}
              placeholder="Ny feature"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              value={newFeatureKey}
              onChange={(e) => setNewFeatureKey(e.target.value.trim().toLowerCase())}
              placeholder="feature_key"
              className="rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm"
            />
            <button
              type="button"
              disabled={saving || !newFeatureName.trim()}
              onClick={() => void createFeature()}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50"
            >
              Opret feature
            </button>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="sticky left-0 bg-white py-2 pr-4">Feature</th>
                {plans.map((plan) => (
                  <th key={plan.id} className="min-w-52 py-2 pr-4">
                    {plan.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {features.map((feature) => (
                <tr key={feature.id} className="border-t border-slate-100">
                  <td className="sticky left-0 bg-white py-3 pr-4">
                    <div className="font-medium text-slate-900">{feature.name}</div>
                    <div className="font-mono text-xs text-slate-500">{feature.key}</div>
                  </td>
                  {plans.map((plan) => {
                    const row = planFeatureByKey.get(`${plan.id}:${feature.id}`)
                    return (
                      <td key={plan.id} className="py-3 pr-4 align-top">
                        <div className="flex items-center gap-2">
                          <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                            <input
                              type="checkbox"
                              checked={row?.enabled ?? false}
                              onChange={(e) =>
                                void setPlanFeature(plan, feature, e.target.checked, row?.limit_value ?? null)
                              }
                              className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                            />
                            Aktiv
                          </label>
                          <input
                            value={row?.limit_value ?? ''}
                            onChange={(e) => {
                              const value = e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0)
                              setPlanFeatures((prev) => {
                                const rest = prev.filter((r) => !(r.plan_id === plan.id && r.feature_id === feature.id))
                                return [
                                  ...rest,
                                  {
                                    plan_id: plan.id,
                                    feature_id: feature.id,
                                    enabled: row?.enabled ?? false,
                                    limit_value: value,
                                    created_at: row?.created_at ?? new Date().toISOString(),
                                    updated_at: new Date().toISOString(),
                                  },
                                ]
                              })
                            }}
                            onBlur={(e) => {
                              const value = e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0)
                              void setPlanFeature(plan, feature, row?.enabled ?? false, value)
                            }}
                            placeholder="Limit"
                            inputMode="numeric"
                            className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                          />
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
