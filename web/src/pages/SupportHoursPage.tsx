import { useEffect, useState } from 'react'
import { MarketingDashboardShowcase } from '@/components/MarketingDashboardShowcase'
import { MarketingFooter } from '@/components/MarketingFooter'
import { MarketingHeader } from '@/components/MarketingHeader'
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
    <div className="flex min-h-screen flex-col bg-white text-slate-900">
      <MarketingHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-16 pt-12 sm:pt-16">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
            Kundeservice
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Support og åbningstider
          </h1>
          <p className="mt-4 text-base leading-relaxed text-slate-600">
            Her finder du vores telefontider og direkte kontaktoplysninger. Svartid på e-mail
            afhænger af henvendelsens omfang; vi bestræber os på at svare inden for
            åbningstiderne.
          </p>
        </div>

        <MarketingDashboardShowcase
          variant="support"
          className="mt-8"
          kicker="Bilago i brug"
          title="Support i produktet"
          subtitle="Eksempel på tråd i samme stil som forsiden — rigtige sager når du er logget ind."
        />

        {loading ? (
          <div className="mt-12 flex items-center gap-3 text-sm text-slate-500">
            <span
              className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600"
              aria-hidden
            />
            Indlæser oplysninger…
          </div>
        ) : (
          <div className="mt-12 grid gap-6 lg:grid-cols-2 lg:items-stretch">
            <article className="flex flex-col rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm shadow-slate-200/50 sm:p-8">
              <div className="flex items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
                  <ClockIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold text-slate-900">Åbningstider</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Telefon og hurtig henvendelse
                  </p>
                </div>
              </div>
              <div className="mt-6 flex-1 border-t border-slate-100 pt-6">
                {hours ? (
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                    {hours}
                  </div>
                ) : (
                  <p className="text-sm leading-relaxed text-slate-600">
                    Vi har ikke offentliggjort faste telefon-tider endnu. Skriv på e-mail eller
                    ring — vi vender tilbage så hurtigt som muligt.
                  </p>
                )}
              </div>
            </article>

            <article className="flex flex-col rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm shadow-slate-200/50 sm:p-8">
              <div className="flex items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
                  <HeadsetIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold text-slate-900">Kontakt</h2>
                  <p className="mt-1 text-sm text-slate-500">Skriv eller ring til os</p>
                </div>
              </div>
              <div className="mt-6 flex-1 border-t border-slate-100 pt-6">
                {hasContact ? (
                  <ul className="space-y-5">
                    {pub?.contact_email ? (
                      <li className="flex gap-4">
                        <span className="mt-0.5 text-slate-400" aria-hidden>
                          <MailIcon className="h-5 w-5" />
                        </span>
                        <div>
                          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
                            E-mail
                          </div>
                          <a
                            href={`mailto:${pub.contact_email}`}
                            className="mt-1 inline-block text-base font-medium text-indigo-700 underline-offset-2 hover:text-indigo-900 hover:underline"
                          >
                            {pub.contact_email}
                          </a>
                        </div>
                      </li>
                    ) : null}
                    {pub?.contact_phone ? (
                      <li className="flex gap-4">
                        <span className="mt-0.5 text-slate-400" aria-hidden>
                          <PhoneIcon className="h-5 w-5" />
                        </span>
                        <div>
                          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
                            Telefon
                          </div>
                          <a
                            href={`tel:${pub.contact_phone.replace(/\s/g, '')}`}
                            className="mt-1 inline-block text-base font-medium text-indigo-700 underline-offset-2 hover:text-indigo-900 hover:underline"
                          >
                            {pub.contact_phone}
                          </a>
                        </div>
                      </li>
                    ) : null}
                  </ul>
                ) : (
                  <p className="text-sm leading-relaxed text-slate-600">
                    Kontaktoplysninger opdateres snarest. Opret en konto og brug support i appen,
                    eller skriv til os via de kanaler, der fremgår af din velkomstmail.
                  </p>
                )}
              </div>
            </article>
          </div>
        )}

      </main>

      <MarketingFooter pub={pub} />
    </div>
  )
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function HeadsetIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M4 14v1a4 4 0 0 0 4 4h1" strokeLinecap="round" />
      <path d="M20 14v1a4 4 0 0 1-4 4h-1" strokeLinecap="round" />
      <path d="M6 14h-.5A2.5 2.5 0 0 1 3 11.5V10a9 9 0 0 1 18 0v1.5A2.5 2.5 0 0 1 18.5 14H18" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M4 6h16v12H4z" strokeLinejoin="round" />
      <path d="m4 7 8 6 8-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path
        d="M15 3h3a2 2 0 0 1 2 2v2a2 2 0 0 1-1.1 1.8l-2.4 1.2a12 12 0 0 1-5.3 5.3l-1.2 2.4A2 2 0 0 1 9 19H7a2 2 0 0 1-2-2v-3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
