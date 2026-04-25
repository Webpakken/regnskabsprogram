import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppProvider'
import { PricingCard } from '@/components/PricingCard'
import { PRICING_DEFAULTS } from '@/lib/pricingPublicDefaults'
import type { Database } from '@/types/database'

type Plan = Database['public']['Tables']['billing_plans']['Row']
type Feature = Database['public']['Tables']['billing_features']['Row']
type PlanFeature = Database['public']['Tables']['billing_plan_features']['Row']
type Bullet = Database['public']['Tables']['billing_plan_bullets']['Row']
type BulletKind = Bullet['kind']

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

function priceToCents(raw: string): number {
  return Math.max(0, Math.round((Number(raw.replace(',', '.')) || 0) * 100))
}

function nowIso() {
  return new Date().toISOString()
}

export function PlatformBillingPlansPage() {
  const { platformRole } = useApp()
  const [plans, setPlans] = useState<Plan[]>([])
  const [features, setFeatures] = useState<Feature[]>([])
  const [planFeatures, setPlanFeatures] = useState<PlanFeature[]>([])
  const [bullets, setBullets] = useState<Bullet[]>([])
  const [error, setError] = useState<string | null>(null)
  const [openEntitlementsFor, setOpenEntitlementsFor] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [planRes, featureRes, planFeatureRes, bulletRes] = await Promise.all([
      supabase.from('billing_plans').select('*').order('sort_order', { ascending: true }).order('name'),
      supabase.from('billing_features').select('*').order('sort_order', { ascending: true }).order('name'),
      supabase.from('billing_plan_features').select('*'),
      supabase.from('billing_plan_bullets').select('*').order('sort_order', { ascending: true }),
    ])
    const firstErr =
      planRes.error?.message ??
      featureRes.error?.message ??
      planFeatureRes.error?.message ??
      bulletRes.error?.message
    if (firstErr) {
      setError(firstErr)
      return
    }
    setPlans(planRes.data ?? [])
    setFeatures(featureRes.data ?? [])
    setPlanFeatures(planFeatureRes.data ?? [])
    setBullets(bulletRes.data ?? [])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const planFeatureByKey = useMemo(() => {
    const map = new Map<string, PlanFeature>()
    for (const row of planFeatures) map.set(`${row.plan_id}:${row.feature_id}`, row)
    return map
  }, [planFeatures])

  const bulletsByPlan = useMemo(() => {
    const map = new Map<string, Bullet[]>()
    for (const b of bullets) {
      const list = map.get(b.plan_id) ?? []
      list.push(b)
      map.set(b.plan_id, list)
    }
    for (const list of map.values()) list.sort((a, b) => a.sort_order - b.sort_order)
    return map
  }, [bullets])

  const featureById = useMemo(() => {
    const map = new Map<string, Feature>()
    for (const f of features) map.set(f.id, f)
    return map
  }, [features])

  if (platformRole !== 'superadmin') {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Kun superadmin kan ændre planer og features.
      </p>
    )
  }

  // ---------- plan ops ----------

  async function updatePlan(plan: Plan, patch: Database['public']['Tables']['billing_plans']['Update']) {
    setError(null)
    const { error: err } = await supabase
      .from('billing_plans')
      .update({ ...patch, updated_at: nowIso() })
      .eq('id', plan.id)
    if (err) {
      setError(err.message)
      return
    }
    setPlans((prev) => prev.map((p) => (p.id === plan.id ? { ...p, ...patch } : p)))
  }

  async function createPlan() {
    setError(null)
    const baseName = `Plan ${plans.length + 1}`
    const baseSlug = slugify(`${baseName}-${Date.now().toString(36)}`)
    const { data, error: err } = await supabase
      .from('billing_plans')
      .insert({
        name: baseName,
        slug: baseSlug,
        active: true,
        sort_order: (plans.at(-1)?.sort_order ?? 0) + 10,
      })
      .select('*')
      .single()
    if (err || !data) {
      setError(err?.message ?? 'Kunne ikke oprette plan')
      return
    }
    setPlans((prev) => [...prev, data])
  }

  async function deletePlan(plan: Plan) {
    if (!window.confirm(`Slet planen «${plan.name}»? Bullets fjernes også.`)) return
    setError(null)
    const { error: err } = await supabase.from('billing_plans').delete().eq('id', plan.id)
    if (err) {
      setError(err.message)
      return
    }
    setPlans((prev) => prev.filter((p) => p.id !== plan.id))
    setBullets((prev) => prev.filter((b) => b.plan_id !== plan.id))
    setPlanFeatures((prev) => prev.filter((pf) => pf.plan_id !== plan.id))
  }

  async function movePlan(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= plans.length) return
    const next = [...plans]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    const reordered = next.map((p, i) => ({ ...p, sort_order: (i + 1) * 10 }))
    setPlans(reordered)
    setError(null)
    const updates = await Promise.all(
      reordered.map((p) =>
        supabase
          .from('billing_plans')
          .update({ sort_order: p.sort_order, updated_at: nowIso() })
          .eq('id', p.id),
      ),
    )
    const err = updates.find((r) => r.error)?.error
    if (err) {
      setError(err.message)
      await load()
    }
  }

  // ---------- bullet ops ----------

  async function addBullet(plan: Plan, kind: BulletKind, opts?: { feature?: Feature }) {
    setError(null)
    const list = bulletsByPlan.get(plan.id) ?? []
    const sortOrder = (list.at(-1)?.sort_order ?? 0) + 10
    const title =
      opts?.feature?.name ??
      (kind === 'heading' ? 'Overskrift' : kind === 'text' ? 'Nyt punkt' : 'Funktion')
    const subtitle = opts?.feature?.description ?? null
    const featureId = opts?.feature?.id ?? null
    const { data, error: err } = await supabase
      .from('billing_plan_bullets')
      .insert({
        plan_id: plan.id,
        kind,
        feature_id: featureId,
        title,
        subtitle,
        sort_order: sortOrder,
      })
      .select('*')
      .single()
    if (err || !data) {
      setError(err?.message ?? 'Kunne ikke tilføje punkt')
      return
    }
    setBullets((prev) => [...prev, data])
    if (kind === 'feature' && opts?.feature) {
      // Sørg for at feature også er enabled på planen
      await setEntitlement(plan, opts.feature, true, null)
    }
  }

  async function updateBullet(bullet: Bullet, patch: Database['public']['Tables']['billing_plan_bullets']['Update']) {
    setError(null)
    const { error: err } = await supabase
      .from('billing_plan_bullets')
      .update({ ...patch, updated_at: nowIso() })
      .eq('id', bullet.id)
    if (err) {
      setError(err.message)
      return
    }
    setBullets((prev) => prev.map((b) => (b.id === bullet.id ? { ...b, ...patch } : b)))
  }

  async function deleteBullet(bullet: Bullet) {
    setError(null)
    const { error: err } = await supabase.from('billing_plan_bullets').delete().eq('id', bullet.id)
    if (err) {
      setError(err.message)
      return
    }
    setBullets((prev) => prev.filter((b) => b.id !== bullet.id))
  }

  async function moveBullet(plan: Plan, index: number, direction: -1 | 1) {
    const list = bulletsByPlan.get(plan.id) ?? []
    const target = index + direction
    if (target < 0 || target >= list.length) return
    const next = [...list]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    const reordered = next.map((b, i) => ({ ...b, sort_order: (i + 1) * 10 }))
    setBullets((prev) => {
      const others = prev.filter((b) => b.plan_id !== plan.id)
      return [...others, ...reordered]
    })
    setError(null)
    const updates = await Promise.all(
      reordered.map((b) =>
        supabase
          .from('billing_plan_bullets')
          .update({ sort_order: b.sort_order, updated_at: nowIso() })
          .eq('id', b.id),
      ),
    )
    const err = updates.find((r) => r.error)?.error
    if (err) {
      setError(err.message)
      await load()
    }
  }

  // ---------- entitlement ops ----------

  async function setEntitlement(plan: Plan, feature: Feature, enabled: boolean, limitValue: number | null) {
    setError(null)
    const { data, error: err } = await supabase
      .from('billing_plan_features')
      .upsert(
        {
          plan_id: plan.id,
          feature_id: feature.id,
          enabled,
          limit_value: limitValue,
          updated_at: nowIso(),
        },
        { onConflict: 'plan_id,feature_id' },
      )
      .select('*')
      .single()
    if (err || !data) {
      setError(err?.message ?? 'Kunne ikke gemme adgang')
      return
    }
    setPlanFeatures((prev) => {
      const rest = prev.filter((r) => !(r.plan_id === plan.id && r.feature_id === feature.id))
      return [...rest, data]
    })
  }

  // ---------- feature registry ops ----------

  async function createFeature(name: string) {
    if (!name.trim()) return
    setError(null)
    const key = slugify(name).replace(/-/g, '_')
    const { data, error: err } = await supabase
      .from('billing_features')
      .insert({
        name: name.trim(),
        key,
        active: true,
        sort_order: (features.at(-1)?.sort_order ?? 0) + 10,
      })
      .select('*')
      .single()
    if (err || !data) {
      setError(err?.message ?? 'Kunne ikke oprette feature')
      return
    }
    setFeatures((prev) => [...prev, data])
  }

  async function updateFeatureMeta(feature: Feature, patch: Database['public']['Tables']['billing_features']['Update']) {
    setError(null)
    const { error: err } = await supabase
      .from('billing_features')
      .update({ ...patch, updated_at: nowIso() })
      .eq('id', feature.id)
    if (err) {
      setError(err.message)
      return
    }
    setFeatures((prev) => prev.map((f) => (f.id === feature.id ? { ...f, ...patch } : f)))
  }

  // ---------- render ----------

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Planer og features</h1>
          <p className="mt-1 text-sm text-slate-600">
            Rediger planerne præcis som de vises på pricing-siden — bullets, priser og adgang pr. plan.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void createPlan()}
          className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
        >
          + Ny plan
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      ) : null}

      <div className="space-y-6">
        {plans.map((plan, index) => {
          const planBullets = bulletsByPlan.get(plan.id) ?? []
          const usedFeatureIds = new Set(
            planBullets.filter((b) => b.kind === 'feature' && b.feature_id).map((b) => b.feature_id as string),
          )
          const availableFeatures = features.filter((f) => !usedFeatureIds.has(f.id))
          const entitlementsOpen = openEntitlementsFor === plan.id
          const visiblePrevPlan = (() => {
            if (plan.marketing_hidden) return null
            for (let i = index - 1; i >= 0; i--) {
              const p = plans[i]
              if (!p.marketing_hidden && p.active) return p
            }
            return null
          })()
          const prevBullets = visiblePrevPlan ? bulletsByPlan.get(visiblePrevPlan.id) ?? [] : []
          const planCornerLabel =
            plan.slug === 'pro' ? 'Mest værdi' : plan.is_default_free ? 'Start her' : null
          return (
            <div key={plan.id} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
            <div
              className={
                'flex flex-col rounded-2xl border bg-white p-5 shadow-sm ' +
                (plan.marketing_hidden ? 'border-slate-200 opacity-75' : 'border-indigo-100')
              }
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex gap-1">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => void movePlan(index, -1)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-35"
                    title="Flyt op"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={index === plans.length - 1}
                    onClick={() => void movePlan(index, 1)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-35"
                    title="Flyt ned"
                  >
                    ↓
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void updatePlan(plan, { marketing_hidden: !plan.marketing_hidden })}
                    className={
                      'inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium ' +
                      (plan.marketing_hidden
                        ? 'border-slate-300 bg-slate-100 text-slate-600'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-800')
                    }
                    title={plan.marketing_hidden ? 'Skjult — klik for at vise på pricing-siden' : 'Synlig — klik for at skjule'}
                  >
                    {plan.marketing_hidden ? 'Skjult' : 'Synlig'}
                  </button>
                  <label className="inline-flex items-center gap-1 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={plan.active}
                      onChange={(e) => void updatePlan(plan, { active: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                    />
                    Aktiv
                  </label>
                  <button
                    type="button"
                    onClick={() => void deletePlan(plan)}
                    className="text-xs font-medium text-rose-600 hover:text-rose-800"
                    title="Slet plan"
                  >
                    Slet
                  </button>
                </div>
              </div>

              <input
                value={plan.name}
                onChange={(e) => {
                  const value = e.target.value
                  setPlans((prev) => prev.map((p) => (p.id === plan.id ? { ...p, name: value } : p)))
                }}
                onBlur={(e) => {
                  const value = e.target.value.trim()
                  if (!value) return
                  void updatePlan(plan, { name: value })
                }}
                placeholder="Plannavn"
                className="mt-3 w-full rounded-lg border border-transparent px-2 py-1 text-2xl font-bold tracking-tight text-slate-900 hover:border-slate-200 focus:border-slate-300 focus:outline-none"
              />
              <input
                value={plan.slug}
                onChange={(e) => {
                  const value = slugify(e.target.value)
                  setPlans((prev) => prev.map((p) => (p.id === plan.id ? { ...p, slug: value } : p)))
                }}
                onBlur={(e) => {
                  const value = slugify(e.target.value)
                  if (!value) return
                  void updatePlan(plan, { slug: value })
                }}
                placeholder="slug"
                className="mt-1 w-full rounded-lg border border-transparent px-2 py-0.5 font-mono text-xs text-slate-500 hover:border-slate-200 focus:border-slate-300 focus:outline-none"
              />
              <textarea
                value={plan.description ?? ''}
                onChange={(e) => {
                  const value = e.target.value
                  setPlans((prev) => prev.map((p) => (p.id === plan.id ? { ...p, description: value } : p)))
                }}
                onBlur={(e) => void updatePlan(plan, { description: e.target.value.trim() || null })}
                placeholder="Kort beskrivelse"
                className="mt-2 min-h-12 w-full rounded-lg border border-transparent px-2 py-1 text-sm text-slate-600 hover:border-slate-200 focus:border-slate-300 focus:outline-none"
              />

              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Før pris (kr./md.)
                  <input
                    value={plan.compare_price_cents == null ? '' : String(Math.round(plan.compare_price_cents / 100))}
                    onChange={(e) => {
                      const raw = e.target.value
                      const cents = raw === '' ? null : priceToCents(raw)
                      setPlans((prev) => prev.map((p) => (p.id === plan.id ? { ...p, compare_price_cents: cents } : p)))
                    }}
                    onBlur={(e) => {
                      const raw = e.target.value.trim()
                      const cents = raw === '' ? null : priceToCents(raw)
                      void updatePlan(plan, { compare_price_cents: cents })
                    }}
                    placeholder="–"
                    inputMode="decimal"
                    className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-medium text-slate-700"
                  />
                </label>
                <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Pris nu (kr./md.)
                  <input
                    value={String(Math.round(plan.monthly_price_cents / 100))}
                    onChange={(e) => {
                      const cents = priceToCents(e.target.value)
                      setPlans((prev) => prev.map((p) => (p.id === plan.id ? { ...p, monthly_price_cents: cents } : p)))
                    }}
                    onBlur={(e) => void updatePlan(plan, { monthly_price_cents: priceToCents(e.target.value) })}
                    inputMode="decimal"
                    className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-bold text-indigo-600"
                  />
                </label>
              </div>
              <label className="mt-2 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Stripe Price ID
                <input
                  value={plan.stripe_price_id ?? ''}
                  onChange={(e) => {
                    const value = e.target.value
                    setPlans((prev) => prev.map((p) => (p.id === plan.id ? { ...p, stripe_price_id: value || null } : p)))
                  }}
                  onBlur={(e) => void updatePlan(plan, { stripe_price_id: e.target.value.trim() || null })}
                  placeholder="price_..."
                  className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-xs"
                />
              </label>

              <div className="mt-4 border-t border-slate-100 pt-4">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Punkter på pricing-kortet
                </div>
                <ul className="mt-2 space-y-2">
                  {planBullets.map((b, i) => (
                    <li
                      key={b.id}
                      className={
                        'rounded-lg border px-2 py-2 ' +
                        (b.kind === 'heading' ? 'border-slate-100 bg-slate-50' : 'border-slate-200 bg-white')
                      }
                    >
                      <div className="flex items-start gap-1">
                        <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            disabled={i === 0}
                            onClick={() => void moveBullet(plan, i, -1)}
                            className="inline-flex h-5 w-5 items-center justify-center rounded text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                            title="Flyt op"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            disabled={i === planBullets.length - 1}
                            onClick={() => void moveBullet(plan, i, 1)}
                            className="inline-flex h-5 w-5 items-center justify-center rounded text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                            title="Flyt ned"
                          >
                            ↓
                          </button>
                        </div>
                        <span
                          className="mt-0.5 inline-flex h-5 w-12 shrink-0 items-center justify-center rounded text-[10px] font-semibold uppercase tracking-wide"
                          style={{
                            background:
                              b.kind === 'feature'
                                ? '#ecfdf5'
                                : b.kind === 'heading'
                                  ? '#eef2ff'
                                  : '#fef3c7',
                            color:
                              b.kind === 'feature'
                                ? '#047857'
                                : b.kind === 'heading'
                                  ? '#3730a3'
                                  : '#92400e',
                          }}
                        >
                          {b.kind === 'feature' ? '✓ Feat' : b.kind === 'heading' ? 'H1' : 'Tekst'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <input
                            value={b.title}
                            onChange={(e) => {
                              const value = e.target.value
                              setBullets((prev) => prev.map((x) => (x.id === b.id ? { ...x, title: value } : x)))
                            }}
                            onBlur={(e) => {
                              const value = e.target.value.trim()
                              if (!value) return
                              void updateBullet(b, { title: value })
                            }}
                            className="w-full rounded border border-transparent px-1 py-0.5 text-sm font-medium text-slate-900 hover:border-slate-200 focus:border-slate-300 focus:outline-none"
                          />
                          {b.kind !== 'heading' ? (
                            <input
                              value={b.subtitle ?? ''}
                              onChange={(e) => {
                                const value = e.target.value
                                setBullets((prev) =>
                                  prev.map((x) => (x.id === b.id ? { ...x, subtitle: value } : x)),
                                )
                              }}
                              onBlur={(e) =>
                                void updateBullet(b, { subtitle: e.target.value.trim() || null })
                              }
                              placeholder="Undertekst (valgfri)"
                              className="mt-0.5 w-full rounded border border-transparent px-1 py-0.5 text-xs text-slate-500 hover:border-slate-200 focus:border-slate-300 focus:outline-none"
                            />
                          ) : null}
                          {b.kind === 'feature' && b.feature_id ? (
                            <div className="mt-0.5 px-1 font-mono text-[10px] text-emerald-700">
                              ↳ {featureById.get(b.feature_id)?.key ?? '?'}
                            </div>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => void deleteBullet(b)}
                          className="text-slate-400 hover:text-rose-600"
                          title="Slet punkt"
                        >
                          ✕
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void addBullet(plan, 'text')}
                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    + Tekst
                  </button>
                  <button
                    type="button"
                    onClick={() => void addBullet(plan, 'heading')}
                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    + Overskrift
                  </button>
                  {availableFeatures.length > 0 ? (
                    <select
                      value=""
                      onChange={(e) => {
                        const f = features.find((x) => x.id === e.target.value)
                        if (f) void addBullet(plan, 'feature', { feature: f })
                      }}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <option value="">+ Tilføj feature…</option>
                      {availableFeatures.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setOpenEntitlementsFor(entitlementsOpen ? null : plan.id)}
                  className="flex w-full items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700"
                >
                  <span>Aktive funktioner (adgang i appen)</span>
                  <span>{entitlementsOpen ? '▾' : '▸'}</span>
                </button>
                {entitlementsOpen ? (
                  <ul className="mt-2 space-y-1">
                    {features.map((f) => {
                      const row = planFeatureByKey.get(`${plan.id}:${f.id}`)
                      const enabled = row?.enabled ?? false
                      return (
                        <li key={f.id} className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={(e) => void setEntitlement(plan, f, e.target.checked, row?.limit_value ?? null)}
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                          />
                          <span className="flex-1 text-slate-700">{f.name}</span>
                          <input
                            value={row?.limit_value ?? ''}
                            onChange={(e) => {
                              const value = e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0)
                              setPlanFeatures((prev) => {
                                const rest = prev.filter(
                                  (r) => !(r.plan_id === plan.id && r.feature_id === f.id),
                                )
                                return [
                                  ...rest,
                                  {
                                    plan_id: plan.id,
                                    feature_id: f.id,
                                    enabled,
                                    limit_value: value,
                                    created_at: row?.created_at ?? nowIso(),
                                    updated_at: nowIso(),
                                  } satisfies PlanFeature,
                                ]
                              })
                            }}
                            onBlur={(e) => {
                              const value = e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0)
                              void setEntitlement(plan, f, enabled, value)
                            }}
                            placeholder="Limit"
                            inputMode="numeric"
                            className="w-16 rounded border border-slate-200 px-1.5 py-0.5 text-xs"
                          />
                        </li>
                      )
                    })}
                  </ul>
                ) : null}
              </div>
            </div>

            <div className="lg:sticky lg:top-4 lg:self-start">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Forhåndsvisning (sådan vises kortet på pricing-siden)
              </div>
              <PricingCard
                plan={plan}
                bullets={planBullets.map((b) => ({
                  id: b.id,
                  kind: b.kind,
                  featureId: b.feature_id,
                  title: b.title,
                  subtitle: b.subtitle,
                }))}
                previousPlan={
                  visiblePrevPlan
                    ? {
                        name: visiblePrevPlan.name,
                        bullets: prevBullets.map((b) => ({
                          id: b.id,
                          kind: b.kind,
                          featureId: b.feature_id,
                          title: b.title,
                          subtitle: b.subtitle,
                        })),
                      }
                    : null
                }
                badge={PRICING_DEFAULTS.badge}
                unit={PRICING_DEFAULTS.unitLabel}
                lockLabel={PRICING_DEFAULTS.lockLabel}
                cta={PRICING_DEFAULTS.cta}
                cornerLabel={planCornerLabel}
                asLink={false}
              />
            </div>
            </div>
          )
        })}
      </div>

      <FeaturesRegistry
        features={features}
        onCreate={(name) => void createFeature(name)}
        onUpdate={(f, patch) => void updateFeatureMeta(f, patch)}
      />
    </div>
  )
}

function FeaturesRegistry({
  features,
  onCreate,
  onUpdate,
}: {
  features: Feature[]
  onCreate: (name: string) => void
  onUpdate: (feature: Feature, patch: Database['public']['Tables']['billing_features']['Update']) => void
}) {
  const [newName, setNewName] = useState('')
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Feature-bibliotek</h2>
          <p className="mt-0.5 text-xs text-slate-600">
            Globale features der kan tilknyttes flere planer. Bruges af appen til at gate adgang.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Ny feature"
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={() => {
              if (!newName.trim()) return
              onCreate(newName)
              setNewName('')
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-50"
          >
            Opret
          </button>
        </div>
      </div>
      <ul className="mt-4 divide-y divide-slate-100 text-sm">
        {features.map((f) => (
          <li key={f.id} className="flex items-center gap-2 py-2">
            <input
              value={f.name}
              onChange={(e) => onUpdate(f, { name: e.target.value })}
              onBlur={(e) => {
                const value = e.target.value.trim()
                if (!value) return
                onUpdate(f, { name: value })
              }}
              className="flex-1 rounded border border-transparent px-1 py-0.5 font-medium text-slate-900 hover:border-slate-200 focus:border-slate-300 focus:outline-none"
            />
            <span className="font-mono text-[10px] text-slate-400">{f.key}</span>
            <input
              value={f.description ?? ''}
              onChange={(e) => onUpdate(f, { description: e.target.value })}
              onBlur={(e) => onUpdate(f, { description: e.target.value.trim() || null })}
              placeholder="Standard undertekst"
              className="w-64 rounded border border-slate-200 px-2 py-1 text-xs"
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
