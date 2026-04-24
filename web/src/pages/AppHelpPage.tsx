import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppPageLayout, AppCard } from '@/components/AppPageLayout'
import { appHelpTopics } from '@/marketing/appHelpTopics'
import { SearchIcon } from '@/marketing/MarketingIcons'

function normalizeSearch(s: string) {
  return s.trim().toLowerCase()
}

export function AppHelpPage() {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = normalizeSearch(query)
    if (!q) return appHelpTopics
    const tokens = q.split(/\s+/).filter(Boolean)
    return appHelpTopics.filter((t) => {
      const hay = normalizeSearch(`${t.title} ${t.body} ${t.searchExtra ?? ''}`)
      return tokens.every((tok) => hay.includes(tok))
    })
  }, [query])

  return (
    <AppPageLayout maxWidth="full" className="space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Hjælp &amp; svar</h1>
        <p className="mt-1 text-sm text-slate-600">Som i appen, med søgning efter emne</p>
      </div>

      <label className="block">
        <span className="sr-only">Søg i hjælp</span>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Søg efter binding, moms, EAN …"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            autoComplete="off"
          />
        </div>
      </label>

      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Emne</h2>
        <ul className="space-y-2">
          {filtered.length === 0 ? (
            <li className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm">
              Ingen emner matcher søgningen.
            </li>
          ) : (
            filtered.map((t) => (
              <li key={t.id}>
                <details className="group rounded-xl border border-slate-200 bg-white shadow-sm open:shadow-md">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-left text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 flex-1">{t.title}</span>
                    <span
                      className="shrink-0 text-lg font-light text-slate-300 transition group-open:rotate-90 group-open:text-indigo-400"
                      aria-hidden
                    >
                      ›
                    </span>
                  </summary>
                  <div className="border-t border-slate-100 px-4 pb-4 pt-3 text-sm leading-relaxed text-slate-600">
                    {t.body}
                  </div>
                </details>
              </li>
            ))
          )}
        </ul>
      </div>

      <AppCard className="text-sm text-slate-600">
        <p>
          Finder du ikke svar her, kan du skrive til os under{' '}
          <Link to="/app/support" className="font-medium text-indigo-600 hover:underline">
            Support
          </Link>
          .
        </p>
      </AppCard>
    </AppPageLayout>
  )
}
