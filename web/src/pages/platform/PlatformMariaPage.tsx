import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type KnowledgeRow = Database['public']['Tables']['maria_knowledge']['Row']

export function PlatformMariaPage() {
  const [enabled, setEnabled] = useState(true)
  const [guidelines, setGuidelines] = useState('')
  const [entries, setEntries] = useState<KnowledgeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Ny videns-post
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [{ data: settings, error: sErr }, { data: kb, error: kErr }] = await Promise.all([
      supabase.from('maria_settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('maria_knowledge').select('*').order('sort_order').order('created_at'),
    ])
    setLoading(false)
    if (sErr || kErr) {
      setError(sErr?.message ?? kErr?.message ?? 'Kunne ikke indlæse.')
      return
    }
    setEnabled(settings?.enabled ?? true)
    setGuidelines(settings?.response_guidelines ?? '')
    setEntries(kb ?? [])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function flash(msg: string) {
    setNotice(msg)
    setTimeout(() => setNotice(null), 2500)
  }

  async function saveSettings() {
    setSavingSettings(true)
    setError(null)
    const { error: uErr } = await supabase
      .from('maria_settings')
      .update({ enabled, response_guidelines: guidelines.trim() || null, updated_at: new Date().toISOString() })
      .eq('id', 1)
    setSavingSettings(false)
    if (uErr) {
      setError(uErr.message)
      return
    }
    flash('Gemt.')
  }

  async function addEntry() {
    if (!newTitle.trim() || !newContent.trim()) return
    setAdding(true)
    setError(null)
    const nextOrder = entries.length ? Math.max(...entries.map((e) => e.sort_order)) + 10 : 10
    const { error: iErr } = await supabase.from('maria_knowledge').insert({
      title: newTitle.trim(),
      content: newContent.trim(),
      sort_order: nextOrder,
    })
    setAdding(false)
    if (iErr) {
      setError(iErr.message)
      return
    }
    setNewTitle('')
    setNewContent('')
    flash('Videns-post tilføjet.')
    await load()
  }

  async function saveEntry(entry: KnowledgeRow) {
    setError(null)
    const { error: uErr } = await supabase
      .from('maria_knowledge')
      .update({
        title: entry.title.trim(),
        content: entry.content.trim(),
        active: entry.active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', entry.id)
    if (uErr) {
      setError(uErr.message)
      return
    }
    flash('Gemt.')
  }

  async function deleteEntry(id: string) {
    setError(null)
    const { error: dErr } = await supabase.from('maria_knowledge').delete().eq('id', id)
    if (dErr) {
      setError(dErr.message)
      return
    }
    await load()
  }

  function patchEntry(id: string, patch: Partial<KnowledgeRow>) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Maria (AI-support)</h1>
        <p className="mt-1 text-sm text-slate-600">
          Oplær Maria: sæt retningslinjer for hvordan hun svarer, og tilføj produktviden, så hun
          giver præcise svar. Ændringer virker med det samme — både i live chat og i support.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}

      {loading ? (
        <div className="text-sm text-slate-500">Indlæser…</div>
      ) : (
        <>
          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span className="font-medium text-slate-800">Maria er slået til</span>
              <span className="text-slate-500">
                (slås fra → kunder får svar fra et menneske i stedet)
              </span>
            </label>

            <div>
              <label className="text-sm font-medium text-slate-800">Svar-retningslinjer</label>
              <p className="mb-2 text-xs text-slate-500">
                Hvordan Maria skal svare — tone, do/don't, faste formuleringer. Skrives oven på
                Marias indbyggede regler.
              </p>
              <textarea
                value={guidelines}
                onChange={(e) => setGuidelines(e.target.value)}
                rows={7}
                placeholder={'Fx:\n- Vær kort og konkret.\n- Henvis altid til revisor ved skattespørgsmål.\n- Nævn aldrig priser på konkurrenter.'}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>

            <button
              type="button"
              disabled={savingSettings}
              onClick={() => void saveSettings()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {savingSettings ? 'Gemmer…' : 'Gem indstillinger'}
            </button>
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Videns-base</h2>
              <p className="text-sm text-slate-600">
                Korte emner om Bilagos funktioner. Maria bruger dem til at svare konkret. Tilføj en
                post når I lancerer en ny funktion.
              </p>
            </div>

            {entries.map((entry) => (
              <div
                key={entry.id}
                className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <input
                  value={entry.title}
                  onChange={(e) => patchEntry(entry.id, { title: e.target.value })}
                  placeholder="Titel (ftx 'Sådan opretter du en faktura')"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium"
                />
                <textarea
                  value={entry.content}
                  onChange={(e) => patchEntry(entry.id, { content: e.target.value })}
                  rows={4}
                  placeholder="Indhold — forklar funktionen kort og konkret."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={entry.active}
                      onChange={(e) => patchEntry(entry.id, { active: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Aktiv
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void deleteEntry(entry.id)}
                      className="rounded-lg border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50"
                    >
                      Slet
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveEntry(entry)}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
                    >
                      Gem
                    </button>
                  </div>
                </div>
              </div>
            ))}

            <div className="space-y-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-800">Ny videns-post</h3>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Titel"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium"
              />
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                rows={4}
                placeholder="Indhold"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={adding || !newTitle.trim() || !newContent.trim()}
                onClick={() => void addEntry()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {adding ? 'Tilføjer…' : 'Tilføj post'}
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
