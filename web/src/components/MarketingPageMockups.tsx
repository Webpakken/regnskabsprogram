import type { ReactNode } from 'react'
import { CheckIcon, SearchIcon } from '@/marketing/MarketingIcons'

function MockWindow({
  url,
  children,
  className = '',
}: {
  url: string
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-xl shadow-indigo-100/60 sm:p-5 ${className}`}
    >
      <div className="flex items-center gap-1.5 border-b border-slate-100 pb-3">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-300" aria-hidden />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-300" aria-hidden />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" aria-hidden />
        <span className="ml-2 truncate text-xs text-slate-400">{url}</span>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  )
}

/** Funktioner: CVR + bank/bilag — andet end forsiden */
export function MarketingFeaturesMockup() {
  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
      <MockWindow url="bilago.dk/kunder/ny">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">CVR-opslag</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <div className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-mono text-slate-800">
            12 34 56 78
          </div>
          <span className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white">
            Hent
          </span>
        </div>
        <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/80 p-3">
          <div className="text-sm font-semibold text-slate-900">Nordhavn Consulting ApS</div>
          <div className="mt-1 text-xs text-slate-600">CVR 12345678 · København</div>
        </div>
      </MockWindow>
      <MockWindow url="bilago.dk/bank">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Kontoudtog</p>
        <ul className="mt-3 space-y-2 text-sm">
          {[
            { t: 'Indbetaling · Kunde A/S', a: '4.500,00 kr.', s: 'Matchet', pill: 'bg-emerald-100 text-emerald-800' },
            { t: 'Kort · Software A/S', a: '899,00 kr.', s: 'Forslag', pill: 'bg-indigo-100 text-indigo-800' },
            { t: 'Gebyr', a: '-15,00 kr.', s: 'Tjek', pill: 'bg-amber-100 text-amber-800' },
          ].map((r) => (
            <li
              key={r.t}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-2 py-2"
            >
              <span className="min-w-0 truncate text-slate-800">{r.t}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-slate-600">{r.a}</span>
                <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${r.pill}`}>
                  {r.s}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </MockWindow>
    </div>
  )
}

/** Priser: abonnement + betalingshistorik */
export function MarketingPricingMockup() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <MockWindow url="bilago.dk/app/abonnement">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Nuværende plan</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">Bilago</p>
            <p className="text-sm text-slate-600">Faktura, bilag og bank inkluderet</p>
          </div>
          <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
            Aktiv
          </span>
        </div>
        <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50 p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-slate-600">Pris</span>
            <span className="text-2xl font-semibold text-slate-900">99 kr.</span>
          </div>
          <p className="mt-0.5 text-right text-xs text-slate-500">pr. måned · ekskl. moms</p>
          <div className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-600">
            Næste trækning: <span className="font-medium text-slate-800">1. juni 2026</span>
          </div>
        </div>
      </MockWindow>
      <MockWindow url="bilago.dk/app/betalinger">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Seneste betalinger</p>
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {[
            { d: '1. maj 2026', x: 'Faktura · abonnement', v: '99,00 kr.' },
            { d: '1. apr. 2026', x: 'Faktura · abonnement', v: '99,00 kr.' },
            { d: '1. mar. 2026', x: 'Faktura · abonnement', v: '99,00 kr.' },
          ].map((r) => (
            <li key={r.d} className="flex items-center justify-between py-2.5 first:pt-0">
              <div>
                <div className="font-medium text-slate-900">{r.d}</div>
                <div className="text-xs text-slate-500">{r.x}</div>
              </div>
              <span className="font-medium text-slate-800">{r.v}</span>
            </li>
          ))}
        </ul>
      </MockWindow>
    </div>
  )
}

/** FAQ: søgning + kategorier (andet layout end rigtig FAQ-liste nedenfor) */
export function MarketingFaqMockup() {
  const cats = [
    'Pris & betaling',
    'Bogføringsloven',
    'Skift fra andet system',
    'Konto & brugere',
  ]
  return (
    <MockWindow url="bilago.dk/faq" className="max-w-3xl lg:max-w-none">
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500">
        <SearchIcon className="h-4 w-4 shrink-0 text-slate-400" />
        <span>Søg efter binding, moms, EAN…</span>
      </div>
      <p className="mt-5 text-xs font-medium uppercase tracking-wide text-slate-500">Ofte stillede emner</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {cats.map((c) => (
          <span
            key={c}
            className="rounded-lg border border-indigo-100 bg-indigo-50/80 px-3 py-1.5 text-xs font-medium text-indigo-900"
          >
            {c}
          </span>
        ))}
      </div>
      <div className="mt-5 rounded-xl border border-slate-100 p-4">
        <p className="text-xs text-slate-500">Forhåndsvisning</p>
        <p className="mt-1 text-sm font-semibold text-slate-900">Kan jeg opsige når som helst?</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Ja — der er ingen binding. Du beholder adgang inden for den betalte periode.
        </p>
      </div>
    </MockWindow>
  )
}

/** Support: chat-tråd i appen */
export function MarketingSupportMockup() {
  return (
    <div className="grid gap-6 lg:grid-cols-5 lg:items-end">
      <div className="lg:col-span-3">
        <MockWindow url="bilago.dk/app/support">
          <div className="space-y-3">
            <div className="flex gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                B
              </span>
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                Hej! Vi har modtaget din fakturaspørgsmål. Her er et link til moms-guiden i hjælpen.
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-indigo-600 px-3 py-2 text-sm text-white">
                Tak — kan I også bekræfte forfaldsdato på kladden?
              </div>
            </div>
            <div className="flex gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                B
              </span>
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                Ja. Åbn fakturaen, og ret forfaldsdatoen før du sender — så står den rigtigt på
                fakturaen.
              </div>
            </div>
          </div>
          <p className="mt-4 text-center text-[11px] text-slate-400">
            Dansk support — typisk svar inden for åbningstid
          </p>
        </MockWindow>
      </div>
      <div className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-lg lg:col-span-2">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <CheckIcon className="h-5 w-5" />
          </span>
          <div>
            <div className="text-sm font-semibold text-slate-900">Besked læst</div>
            <div className="text-xs text-slate-500">Du får mail ved nyt svar</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export type MarketingShowcaseVariant = 'features' | 'pricing' | 'faq' | 'support'

export function MarketingShowcaseBody({ variant }: { variant: MarketingShowcaseVariant }) {
  switch (variant) {
    case 'features':
      return <MarketingFeaturesMockup />
    case 'pricing':
      return <MarketingPricingMockup />
    case 'faq':
      return <MarketingFaqMockup />
    case 'support':
      return <MarketingSupportMockup />
  }
}
