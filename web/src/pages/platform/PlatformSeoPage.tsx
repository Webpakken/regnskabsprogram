import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useApp } from '@/context/AppProvider'
import {
  DEFAULT_LANDING_SEO,
  type LandingSeoSettings,
  mergeLandingSeo,
} from '@/lib/landingSeo'
import { supabase } from '@/lib/supabase'

function Field({
  label,
  hint,
  value,
  onChange,
  multiline,
  rows,
}: {
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
  multiline?: boolean
  rows?: number
}) {
  const common =
    'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900'
  return (
    <div>
      <label className="text-xs font-medium text-slate-600">{label}</label>
      {multiline ? (
        <textarea
          className={`${common} font-mono text-xs`}
          rows={rows ?? 4}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          className={common}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  )
}

export function PlatformSeoPage() {
  const { platformRole } = useApp()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [seo, setSeo] = useState<LandingSeoSettings>(() => ({ ...DEFAULT_LANDING_SEO }))

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: qErr } = await supabase
      .from('platform_public_settings')
      .select('landing_seo')
      .eq('id', 1)
      .maybeSingle()
    setLoading(false)
    if (qErr) {
      setError(qErr.message)
      return
    }
    setSeo(mergeLandingSeo(data?.landing_seo))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setMessage(null)
    const payload: Record<string, string> = {
      document_title: seo.document_title.trim(),
      meta_description: seo.meta_description.trim(),
      meta_keywords: seo.meta_keywords.trim(),
      og_title: seo.og_title.trim(),
      og_description: seo.og_description.trim(),
      og_image_url: seo.og_image_url.trim(),
      og_type: seo.og_type.trim() || DEFAULT_LANDING_SEO.og_type,
      og_site_name: seo.og_site_name.trim() || DEFAULT_LANDING_SEO.og_site_name,
      twitter_card: seo.twitter_card.trim() || DEFAULT_LANDING_SEO.twitter_card,
      canonical_url: seo.canonical_url.trim() || DEFAULT_LANDING_SEO.canonical_url,
      robots: seo.robots.trim() || DEFAULT_LANDING_SEO.robots,
      theme_color: seo.theme_color.trim(),
      json_ld: seo.json_ld.trim(),
    }
    const { error: uErr } = await supabase
      .from('platform_public_settings')
      .update({
        landing_seo: payload as unknown as Record<string, never>,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)
    setSaving(false)
    if (uErr) {
      setError(uErr.message)
      return
    }
    setMessage('SEO gemt. Forsiden opdaterer meta-tags næste gang den indlæses.')
    await load()
  }

  function patch(p: Partial<LandingSeoSettings>) {
    setSeo((prev) => ({ ...prev, ...p }))
  }

  if (platformRole !== 'superadmin') {
    return <Navigate to="/platform/dashboard" replace />
  }

  if (loading) {
    return <div className="text-center text-sm text-slate-500">Indlæser…</div>
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">SEO — forsiden</h1>
        <p className="mt-1 text-sm text-slate-600">
          Styr &lt;title&gt;, meta, Open Graph og valgfri struktureret data (JSON-LD) for marketing-forsiden
          (<span className="font-mono">/</span>). Ændringer vises for besøgende efter næste indlæsning.
        </p>
      </div>

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

      <form onSubmit={(e) => void save(e)} className="space-y-8">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Grundlæggende</h2>
          <div className="mt-4 space-y-4">
            <Field
              label="Sidetitel (browserfane)"
              hint="Fx «Bilago — dansk regnskabsprogram». Vises også som standard for deling hvis OG-felter er tomme."
              value={seo.document_title}
              onChange={(v) => patch({ document_title: v })}
            />
            <Field
              label="Meta-beskrivelse"
              hint="Ca. 150–160 tegn. Vises i Google og som udgangspunkt for sociale medier."
              value={seo.meta_description}
              onChange={(v) => patch({ meta_description: v })}
              multiline
              rows={3}
            />
            <Field
              label="Nøgleord"
              hint="Kommasepareret — bruges kun som hint til søgemaskiner."
              value={seo.meta_keywords}
              onChange={(v) => patch({ meta_keywords: v })}
            />
            <Field
              label="Canonical URL"
              hint="Den «officielle» URL for forsiden (typisk https://bilago.dk/)."
              value={seo.canonical_url}
              onChange={(v) => patch({ canonical_url: v })}
            />
            <Field
              label="Robots"
              hint="Fx index, follow eller noindex for test."
              value={seo.robots}
              onChange={(v) => patch({ robots: v })}
            />
            <Field
              label="Theme color (browser)"
              hint="Hex-farve, fx #4f46e5 (indigo)."
              value={seo.theme_color}
              onChange={(v) => patch({ theme_color: v })}
            />
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Open Graph &amp; sociale medier</h2>
          <p className="mt-1 text-sm text-slate-600">
            Bruges når siden deles på LinkedIn, Facebook m.m. Billede bør helst være ca. 1200×630 px.
          </p>
          <div className="mt-4 space-y-4">
            <Field
              label="OG titel"
              value={seo.og_title}
              onChange={(v) => patch({ og_title: v })}
            />
            <Field
              label="OG beskrivelse"
              value={seo.og_description}
              onChange={(v) => patch({ og_description: v })}
              multiline
              rows={3}
            />
            <Field
              label="OG billede URL"
              hint="Fuld HTTPS-URL til et billede du hoster (fx i public/ eller CDN)."
              value={seo.og_image_url}
              onChange={(v) => patch({ og_image_url: v })}
            />
            <Field
              label="OG type"
              value={seo.og_type}
              onChange={(v) => patch({ og_type: v })}
            />
            <Field
              label="OG site name"
              value={seo.og_site_name}
              onChange={(v) => patch({ og_site_name: v })}
            />
            <Field
              label="Twitter / X card"
              hint="Typisk summary_large_image."
              value={seo.twitter_card}
              onChange={(v) => patch({ twitter_card: v })}
            />
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Struktureret data (JSON-LD)</h2>
          <p className="mt-1 text-sm text-slate-600">
            Valgfrit. Gyldig JSON (fx <code className="text-xs">Organization</code> eller <code className="text-xs">WebSite</code>). Tom = ingen script.
          </p>
          <div className="mt-4">
            <Field
              label="JSON-LD"
              value={seo.json_ld}
              onChange={(v) => patch({ json_ld: v })}
              multiline
              rows={12}
            />
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving ? 'Gemmer…' : 'Gem SEO'}
          </button>
          <button
            type="button"
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
            onClick={() => setSeo({ ...DEFAULT_LANDING_SEO })}
          >
            Nulstil felter til standard (gem ikke automatisk)
          </button>
        </div>
      </form>
    </div>
  )
}
