import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type PublicSettings = Database['public']['Tables']['platform_public_settings']['Row']

export function SupportHoursPage() {
  const [pub, setPub] = useState<PublicSettings | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    void supabase
      .from('platform_public_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => {
        setPub(data ?? null)
        setLoading(false)
      })
  }, [])

  const hours = pub?.support_hours?.trim()
  const hasContact = Boolean(pub?.contact_email || pub?.contact_phone)

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-semibold text-white">
              B
            </span>
            <span className="text-lg font-semibold">Bilago</span>
          </Link>
          <Link
            to="/"
            className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
          >
            Forside
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Support og åbningstider
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Sådan kan du få fat i os — svartider gælder inden for disse rammer.
        </p>

        {loading ? (
          <p className="mt-8 text-sm text-slate-500">Indlæser…</p>
        ) : (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            {hours ? (
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                {hours}
              </div>
            ) : (
              <p className="text-sm text-slate-600">
                Vi har ikke lagt faste åbningstider ind endnu. Skriv eller ring, så
                vender vi tilbage hurtigst muligt.
              </p>
            )}

            {hasContact ? (
              <div className="mt-8 border-t border-slate-100 pt-6">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Kontakt
                </h2>
                <ul className="mt-3 space-y-2 text-sm text-slate-700">
                  {pub?.contact_email ? (
                    <li>
                      <a
                        href={`mailto:${pub.contact_email}`}
                        className="font-medium text-indigo-600 hover:underline"
                      >
                        {pub.contact_email}
                      </a>
                    </li>
                  ) : null}
                  {pub?.contact_phone ? (
                    <li>
                      <a
                        href={`tel:${pub.contact_phone.replace(/\s/g, '')}`}
                        className="font-medium text-indigo-600 hover:underline"
                      >
                        {pub.contact_phone}
                      </a>
                    </li>
                  ) : null}
                </ul>
              </div>
            ) : null}
          </div>
        )}

        <p className="mt-8 text-center text-sm text-slate-500">
          <Link to="/login" className="text-indigo-600 hover:underline">
            Log ind
          </Link>
          {' · '}
          <Link to="/signup" className="text-indigo-600 hover:underline">
            Opret konto
          </Link>
        </p>
      </main>
    </div>
  )
}
