import { useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useApp } from '@/context/AppProvider'
import { LoadingCentered } from '@/components/LoadingIndicator'
import { MarketingFooter } from '@/components/MarketingFooter'
import { MarketingHeader } from '@/components/MarketingHeader'
import { MarketingMobileBottomNav } from '@/components/MarketingMobileBottomNav'
import { MarketingPricingSection } from '@/components/MarketingPricingSection'
import { applyLandingSeoToDocument, mergeLandingSeo } from '@/lib/landingSeo'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { formatKrPerMonth } from '@/lib/format'
import { MarketingFeatureCard } from '@/components/MarketingFeatureCard'
import { marketingFeatureCards } from '@/marketing/featureCards'
import { CheckIcon } from '@/marketing/MarketingIcons'
import { marketingFaqs, marketingPerks, marketingTestimonials } from '@/marketing/marketingData'
import type { Database } from '@/types/database'

type PublicSettings = Database['public']['Tables']['platform_public_settings']['Row']

const landingFeatureCards = marketingFeatureCards.slice(0, 4)

export function LandingPage() {
  const { session, loading } = useApp()
  const [searchParams] = useSearchParams()
  const [pub, setPub] = useState<PublicSettings | null>(null)
  /** Loggede brugere kan se forsiden via /?forside=1 (fx. fra onboarding). */
  const showMarketingWhileLoggedIn = searchParams.get('forside') === '1'

  useEffect(() => {
    if (!isSupabaseConfigured) return
    void supabase
      .from('platform_public_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setPub(data)
      })
  }, [])

  useEffect(() => {
    const seo = mergeLandingSeo(pub?.landing_seo)
    return applyLandingSeoToDocument(seo)
  }, [pub])

  /* Undgå marketing-forside mens auth indlæses (PWA/«tilføj til hjemmeskærm» + logget ind = ellers 1–2 sek flash). */
  if (loading) {
    return (
      <LoadingCentered
        minHeight="min-h-screen"
        className="bg-slate-50"
        caption="Indlæser…"
        srLabel="Indlæser"
      />
    )
  }

  if (session && !showMarketingWhileLoggedIn) {
    return <Navigate to="/home" replace />
  }

  const amountCents = pub?.pricing_amount_cents ?? pub?.monthly_price_cents ?? 9900
  const compareCents = pub?.pricing_compare_cents ?? null
  const compareKr =
    compareCents != null && compareCents > amountCents
      ? Math.round(compareCents / 100)
      : null
  const introPriceLabel = formatKrPerMonth(amountCents)

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <MarketingHeader />

      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 -z-10 bg-gradient-to-b from-indigo-50 via-white to-white"
          aria-hidden
        />
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 lg:grid-cols-2 lg:items-center lg:py-28">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M12 2 14.6 8.4 21 9l-4.8 4.4 1.4 6.6L12 16.8 6.4 20l1.4-6.6L3 9l6.4-.6z" />
              </svg>
              Introtilbud ·{' '}
              {compareKr != null ? (
                <>
                  <span className="text-emerald-700/60 line-through">{compareKr}</span>{' '}
                </>
              ) : null}
              <strong className="font-bold text-emerald-900">{introPriceLabel}</strong>
            </span>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
              Regnskab uden bøvl for danske virksomheder
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate-600">
              Bilago samler fakturering, bilag og bank-afstemning ét sted — med
              CVR-opslag, dansk moms og opfyldelse af bogføringsloven.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/signup"
                className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
              >
                Opret gratis konto
              </Link>
              <Link
                to="/login"
                className="rounded-lg border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Log ind
              </Link>
            </div>
            <ul className="mt-8 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
              {marketingPerks.map((p) => (
                <li key={p} className="flex items-center gap-2 whitespace-nowrap">
                  <CheckIcon className="h-4 w-4 shrink-0 text-emerald-600" />
                  {p}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xl shadow-indigo-100/60">
              <div className="flex items-center gap-1.5 border-b border-slate-100 pb-3">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-300" aria-hidden />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-300" aria-hidden />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" aria-hidden />
                <span className="ml-3 text-xs text-slate-400">bilago.dk/dashboard</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {[
                  { label: 'Omsætning', value: '124.500 kr.' },
                  { label: 'Udestående', value: '18.200 kr.' },
                  { label: 'Bilag', value: '47' },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">{s.label}</div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">{s.value}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-xl border border-slate-100 p-4">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Seneste fakturaer</span>
                  <span>Status</span>
                </div>
                <ul className="mt-3 space-y-2 text-sm">
                  {[
                    {
                      name: 'Acme ApS',
                      amount: '12.400 kr.',
                      status: 'Betalt',
                      tone: 'text-emerald-700 bg-emerald-50',
                    },
                    {
                      name: 'Nordlys A/S',
                      amount: '8.750 kr.',
                      status: 'Afventer',
                      tone: 'text-amber-700 bg-amber-50',
                    },
                    {
                      name: 'Fjord Studio',
                      amount: '3.200 kr.',
                      status: 'Kladde',
                      tone: 'text-slate-700 bg-slate-100',
                    },
                  ].map((r) => (
                    <li key={r.name} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 font-medium text-slate-800">{r.name}</span>
                      <span className="flex shrink-0 items-center gap-3 text-slate-600">
                        {r.amount}
                        <span className={`rounded-md px-2 py-0.5 text-xs ${r.tone}`}>{r.status}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="absolute -bottom-6 -left-6 hidden rounded-xl border border-slate-200 bg-white p-4 shadow-lg lg:block">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <CheckIcon className="h-5 w-5" />
                </span>
                <div>
                  <div className="text-sm font-semibold text-slate-900">Bank-match fundet</div>
                  <div className="text-xs text-slate-500">Acme ApS · 12.400 kr.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-slate-100 bg-slate-50">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-6 py-10 text-center sm:grid-cols-4">
          {[
            { k: 'Moms', v: 'Automatisk beregnet' },
            { k: 'Bilag', v: 'Digital arkivering' },
            { k: 'CVR', v: 'Opslag ét klik' },
            { k: 'Support', v: 'Dansk, via mail' },
          ].map((i) => (
            <div key={i.k}>
              <div className="text-xs uppercase tracking-wide text-slate-500">{i.k}</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{i.v}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Alt du skal bruge til dit regnskab
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Fire kernefunktioner der dækker hverdagen for danske SMB'er og freelancere.
          </p>
          <Link
            to="/funktioner"
            className="mt-4 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-800"
          >
            Se alle funktioner →
          </Link>
        </div>
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {landingFeatureCards.map((f) => (
            <MarketingFeatureCard key={f.title} card={f} />
          ))}
        </div>
      </section>

      <section className="bg-slate-50">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-24 lg:grid-cols-2 lg:items-center">
          <div className="order-2 lg:order-1">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-900">Faktura #2026-014</span>
                <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                  Betalt
                </span>
              </div>
              <dl className="mt-4 space-y-2 text-sm text-slate-600">
                <div className="flex justify-between"><dt>Subtotal</dt><dd>10.000,00 kr.</dd></div>
                <div className="flex justify-between"><dt>Moms 25%</dt><dd>2.500,00 kr.</dd></div>
                <div className="flex justify-between border-t border-slate-100 pt-2 font-semibold text-slate-900"><dt>Total</dt><dd>12.500,00 kr.</dd></div>
              </dl>
              <div className="mt-5 rounded-lg bg-indigo-50 p-3 text-xs text-indigo-800">
                Sendt 2026-04-12 · Forfalder 2026-04-26
              </div>
            </div>
          </div>
          <div className="order-1 lg:order-2">
            <span className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
              Fakturering
            </span>
            <h3 className="mt-3 text-3xl font-semibold tracking-tight">
              Send professionelle fakturaer — hver gang
            </h3>
            <p className="mt-4 text-slate-600">
              Fortløbende numre, moms automatisk beregnet, og PDF-udsendelse
              direkte til kunden. Ingen manuel opsætning nødvendig.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-slate-700">
              {[
                'Dansk momsbehandling og EAN-understøttelse',
                'Automatisk forfaldsdato og påmindelser',
                'Tilpas logo og virksomhedsoplysninger',
              ].map((l) => (
                <li key={l} className="flex items-start gap-2">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  {l}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-24 lg:grid-cols-2 lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
                Bank-afstemning
              </span>
              <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
                Kommer snart
              </span>
            </div>
            <h3 className="mt-3 text-3xl font-semibold tracking-tight">
              Match banken mod dit bogholderi automatisk
            </h3>
            <p className="mt-4 text-slate-600">
              Importér kontoudtog og lad Bilago foreslå matches til fakturaer og
              bilag. Du godkender — systemet bogfører.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-slate-700">
              {[
                'CSV-import fra danske banker',
                'Intelligent matching på beløb og reference',
                'Markér manuelle poster med få klik',
              ].map((l) => (
                <li key={l} className="flex items-start gap-2">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  {l}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Seneste bankposter
            </div>
            <ul className="mt-4 divide-y divide-slate-100 text-sm">
              {[
                { date: '2026-04-12', name: 'Acme ApS', amount: '+12.400 kr.', status: 'Matchet', tone: 'text-emerald-700' },
                { date: '2026-04-10', name: 'Google Cloud', amount: '-412 kr.', status: 'Foreslået', tone: 'text-indigo-700' },
                { date: '2026-04-08', name: 'Nordlys A/S', amount: '+8.750 kr.', status: 'Afventer', tone: 'text-amber-700' },
                { date: '2026-04-05', name: 'Fjord Studio', amount: '-1.200 kr.', status: 'Matchet', tone: 'text-emerald-700' },
              ].map((r) => (
                <li key={r.date} className="flex items-center justify-between py-3">
                  <div>
                    <div className="font-medium text-slate-800">{r.name}</div>
                    <div className="text-xs text-slate-500">{r.date}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-slate-900">{r.amount}</div>
                    <div className={`text-xs ${r.tone}`}>{r.status}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="bg-indigo-600 text-white">
        <div className="mx-auto max-w-6xl px-6 py-20 text-center">
          <h3 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Klar til bogføringsloven
          </h3>
          <p className="mx-auto mt-4 max-w-2xl text-indigo-100">
            Bilago gemmer dine bilag digitalt og dokumenterer dine posteringer
            efter kravene — så du kan fokusere på forretningen.
          </p>
          <Link
            to="/signup"
            className="mt-8 inline-block rounded-lg bg-white px-6 py-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
          >
            Opret gratis konto
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Hvad siger kunderne
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Små virksomheder og freelancere bruger Bilago hver dag.
          </p>
        </div>
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {marketingTestimonials.map((t) => (
            <figure
              key={t.name}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <blockquote className="text-sm text-slate-700">&ldquo;{t.quote}&rdquo;</blockquote>
              <figcaption className="mt-5 flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
                  {t.name.charAt(0)}
                </span>
                <span className="text-sm">
                  <div className="font-semibold text-slate-900">{t.name}</div>
                  <div className="text-slate-500">{t.role}</div>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section id="pricing" className="bg-slate-50">
        <MarketingPricingSection pub={pub} />
        <div className="mx-auto max-w-3xl px-6 pb-16 text-center">
          <Link to="/priser" className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
            Læs mere om priser og hvad der er inkluderet →
          </Link>
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-3xl px-6 py-24">
        <div className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Ofte stillede spørgsmål
          </h2>
          <Link
            to="/faq"
            className="mt-4 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-800"
          >
            Se hele FAQ →
          </Link>
        </div>
        <div className="mt-10 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {marketingFaqs.map((f) => (
            <details key={f.q} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer items-center justify-between text-sm font-semibold text-slate-900">
                {f.q}
                <span className="ml-4 text-slate-400 transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm text-slate-600">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <MarketingFooter pub={pub} />
      <MarketingMobileBottomNav />
    </div>
  )
}
