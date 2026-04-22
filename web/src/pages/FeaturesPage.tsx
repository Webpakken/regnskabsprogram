import { Link } from 'react-router-dom'
import { MarketingDashboardShowcase } from '@/components/MarketingDashboardShowcase'
import { MarketingShell } from '@/components/MarketingShell'
import { CheckIcon } from '@/marketing/MarketingIcons'
import { marketingFeatureCards } from '@/marketing/featureCards'
import { marketingTestimonials } from '@/marketing/marketingData'

const audiences = [
  'Freelancere & konsulenter',
  'Anpartsselskaber',
  'Enkeltmandsvirksomheder',
  'Butik & webshop',
  'Rådgivning & bureau',
  'Håndværk & service',
]

export function FeaturesPage() {
  return (
    <MarketingShell pageTitle="Funktioner">
      <section className="relative overflow-hidden border-b border-slate-100">
        <div
          className="absolute inset-0 -z-10 bg-gradient-to-b from-indigo-50 via-white to-white"
          aria-hidden
        />
        <div className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
            Alt-i-et regnskab
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
            Professionelt regnskab — uden at det føles tungt
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-slate-600">
            Bilago samler fakturaer, bilag, bank og moms ét sted. Bygget til danske virksomheder,
            så du kan bruge tiden på kunderne — ikke på regneark.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              to="/signup"
              className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
            >
              Prøv gratis i 30 dage
            </Link>
            <Link
              to="/priser"
              className="rounded-lg border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Se priser
            </Link>
          </div>
        </div>
      </section>

      <MarketingDashboardShowcase
        variant="features"
        kicker="Indblik i produktet"
        title="Værktøjer du bruger hver dag"
        subtitle="CVR på kunder og tydelige bank-linjer — bygget i samme visuelle sprog som forsiden."
      />

      <section className="border-b border-slate-100 bg-slate-50">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 py-12 text-center sm:grid-cols-4">
          {[
            { k: 'Bogføringslov', v: 'Digital bilag' },
            { k: 'Moms', v: 'Danske satser' },
            { k: 'Bank', v: 'CSV & match' },
            { k: 'Support', v: 'Dansk team' },
          ].map((i) => (
            <div key={i.k}>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{i.k}</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{i.v}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Funktioner der dækker hele flowet
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Fra første faktura til afstemt bank og klar moms — uden at hoppe mellem systemer.
          </p>
        </div>
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {marketingFeatureCards.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-indigo-200 hover:shadow-md"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white">
                <f.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-5 text-lg font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-slate-50 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Udviklet til hverdagen i mindre virksomheder
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-slate-600">
            Uanset branche får du et overblik du kan stole på — og et system der følger danske regler.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-2">
            {audiences.map((a) => (
              <span
                key={a}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm"
              >
                {a}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <div className="grid gap-14 lg:grid-cols-2 lg:items-center">
          <div>
            <span className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
              Faktura & kunder
            </span>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
              Send fakturaer der ser professionelle ud
            </h2>
            <p className="mt-4 text-slate-600">
              Fortløbende numre, korrekt moms og PDF til kunden. CVR-opslag udfylder kundedata,
              så du slipper for copy-paste.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-slate-700">
              {[
                'Tilpas virksomhedsoplysninger og logo',
                'Automatisk moms og forfaldsdato',
                'Status på fakturaer på ét overblik',
              ].map((l) => (
                <li key={l} className="flex items-start gap-2">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  {l}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Eksempel</div>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-600">Faktura</span>
                <span className="font-semibold text-slate-900">#2026-014</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Total inkl. moms</span>
                <span className="font-semibold text-slate-900">12.500,00 kr.</span>
              </div>
              <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
                Sendt · Betalt
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-slate-100 bg-slate-50 py-20 sm:py-24">
        <div className="mx-auto grid max-w-6xl gap-14 px-6 lg:grid-cols-2 lg:items-center">
          <div className="order-2 lg:order-1">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Bankafstemning
              </div>
              <ul className="mt-4 divide-y divide-slate-100 text-sm">
                {[
                  { t: 'Indbetaling · Acme ApS', s: 'Matchet', tone: 'text-emerald-700' },
                  { t: 'Kort · Google Cloud', s: 'Foreslået', tone: 'text-indigo-700' },
                  { t: 'Gebyr · Bank', s: 'Afventer', tone: 'text-amber-700' },
                ].map((r) => (
                  <li key={r.t} className="flex items-center justify-between py-3">
                    <span className="text-slate-800">{r.t}</span>
                    <span className={`text-xs font-medium ${r.tone}`}>{r.s}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="order-1 lg:order-2">
            <span className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
              Bank
            </span>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
              Afstem på få minutter
            </h2>
            <p className="mt-4 text-slate-600">
              Importér kontoudtog og få forslag til matches mod fakturaer og bilag. Du godkender
              — systemet samler tråden.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-slate-700">
              {[
                'CSV fra danske banker',
                'Match på beløb og reference',
                'Færre manuelle fejl ved månedsafslutning',
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

      <section className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Hvad siger brugerne
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Mindre virksomheder bruger Bilago til fakturering og afstemning hver dag.
          </p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {marketingTestimonials.map((t) => (
            <figure
              key={t.name}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <blockquote className="text-sm leading-relaxed text-slate-700">
                &ldquo;{t.quote}&rdquo;
              </blockquote>
              <figcaption className="mt-5 flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
                  {t.name.charAt(0)}
                </span>
                <span className="text-sm">
                  <span className="font-semibold text-slate-900">{t.name}</span>
                  <span className="block text-slate-500">{t.role}</span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="bg-indigo-600 py-16 text-white">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Klar til at komme i gang?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-indigo-100">
            Opret en gratis konto og se selv — ingen kort i prøveperioden.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/signup"
              className="rounded-lg bg-white px-6 py-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
            >
              Opret konto
            </Link>
            <Link
              to="/priser"
              className="rounded-lg border border-white/30 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              Se priser
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  )
}
