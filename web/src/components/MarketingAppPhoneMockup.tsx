import type { ReactNode } from 'react'
import { CheckIcon, SearchIcon } from '@/marketing/MarketingIcons'

export type AppPhoneVariant = 'pricing' | 'faq' | 'support'

/**
 * Produkt-illustrationer i **samme visuelle sprog som forsiderens hero** (browser-chrome, indigo-skygge, læsbar typografi).
 * Vises på pris / FAQ / support — ingen sort telefon-ramme eller 8px tekst.
 */
function HeroStyleWindow({ url, children }: { url: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-lg">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xl shadow-indigo-100/60 sm:p-5">
        <div className="flex items-center gap-1.5 border-b border-slate-100 pb-3">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-300" aria-hidden />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300" aria-hidden />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" aria-hidden />
          <span className="ml-2 min-w-0 truncate text-xs text-slate-400">{url}</span>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}

/** Tre nøgletal i samme grid som forsidens «omsætning / udestående / bilag» */
function StatRow3({
  items,
}: {
  items: readonly { label: string; value: string; hint?: string }[]
}) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {items.map((s) => (
        <div
          key={s.label}
          className="rounded-xl border border-slate-100 bg-slate-50 p-2.5 sm:p-3"
        >
          <div className="text-[10px] uppercase leading-tight tracking-wide text-slate-500 sm:text-xs sm:normal-case sm:tracking-normal">
            {s.label}
          </div>
          <div className="mt-0.5 text-sm font-semibold text-slate-900 sm:text-base">
            {s.value}
          </div>
          {s.hint ? <div className="mt-0.5 text-[10px] text-slate-500 sm:text-xs">{s.hint}</div> : null}
        </div>
      ))}
    </div>
  )
}

function ScreenPricing() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-900 sm:text-base">Dit abonnement</h2>
        <p className="mt-0.5 text-xs text-slate-500">Samme pris som på websitet — ingen skjulte moduler</p>
      </div>
      <StatRow3
        items={[
          { label: 'Aktuelt', value: 'Aktiv', hint: 'Alle funktioner' },
          { label: 'Pris', value: '79 kr.', hint: 'pr. md. · kampagne' },
          { label: 'Næste træk', value: '3. maj', hint: '2026' },
        ]}
      />
      <div className="rounded-xl border border-slate-100 p-3 sm:p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-slate-900">Bilago abonnement</span>
          <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
            I orden
          </span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-600">
          Faktura, bilag, bank og moms er inkluderet. Efter kampagnen gælder listepris 99 kr./md. ekskl.
          moms.
        </p>
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
        <span>Overblik</span>
        <span className="text-indigo-600">Abonnement</span>
        <span>Fakturaer</span>
        <span>…</span>
      </div>
    </div>
  )
}

function ScreenFaq() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-900 sm:text-base">Hjælp &amp; svar</h2>
        <p className="mt-0.5 text-xs text-slate-500">Som i appen, med søgning efter emne</p>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500">
        <SearchIcon className="h-4 w-4 shrink-0 text-slate-400" />
        Søg efter binding, moms, EAN…
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
          <span>Emne</span>
        </div>
        <ul className="space-y-2 text-sm">
          {[
            'Opsigelse & betaling',
            'Bogføringsloven (kort)',
            'CVR-opslag på kunder',
            'Skifte fra andet system',
          ].map((row) => (
            <li
              key={row}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 font-medium text-slate-800"
            >
              <span className="min-w-0 flex-1 truncate">{row}</span>
              <span className="shrink-0 text-slate-300" aria-hidden>
                ›
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
        <span>Overblik</span>
        <span>Fakturaer</span>
        <span className="text-indigo-600">Hjælp</span>
        <span>Mere</span>
      </div>
    </div>
  )
}

function ScreenSupport() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-900 sm:text-base">Support</h2>
        <p className="mt-0.5 text-xs text-slate-500">Dansk team · sag fortsat i tråd</p>
      </div>
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
            B
          </div>
          <div className="min-w-0 max-w-[88%] rounded-2xl rounded-tl-sm border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
            Hej — vi ser på EAN-feltet på fakturaen. Vi skriver tilbage om 5 min.
          </div>
        </div>
        <div className="flex justify-end">
          <div className="max-w-[88%] rounded-2xl rounded-tr-sm bg-indigo-600 px-3 py-2 text-sm text-white">
            Super, tak! /Mikkel
          </div>
        </div>
        <p className="text-center text-xs text-slate-500">Nyt svar giver typisk e-mail notifikation</p>
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
        <span>Overblik</span>
        <span>Fakturaer</span>
        <span className="text-indigo-600">Support</span>
        <span>Mere</span>
      </div>
    </div>
  )
}

const urlByVariant: Record<AppPhoneVariant, string> = {
  pricing: 'bilago.dk/app/abonnement',
  faq: 'bilago.dk/hjælp',
  support: 'bilago.dk/app/support',
}

const highlightCardByVariant: Record<AppPhoneVariant, { title: string; body: string; meta?: string }> = {
  pricing: {
    title: 'Prøv samme oplevelse efter tilmelding',
    body: 'Skærmen afspejler webappen — kort, tabeller og tydelig pris, som kunder møder i PWA’en.',
  },
  faq: {
    title: 'Emner og søgning i ét mønster',
    body: 'Som på forsiden: hvidt kort, grå sektioner og fokus på læsbarhed, ikke fiktiv mobil-chrome.',
  },
  support: {
    title: 'Personlige svar, ikke en bot',
    body: 'Tråd-layout som i kundeappen, med tydelige chatbobler i Bilagos farver.',
  },
}

export function MarketingAppPhoneFrame({ variant }: { variant: AppPhoneVariant }) {
  const h = highlightCardByVariant[variant]
  return (
    <div className="space-y-4">
      <HeroStyleWindow url={urlByVariant[variant]}>
        {variant === 'pricing' ? <ScreenPricing /> : null}
        {variant === 'faq' ? <ScreenFaq /> : null}
        {variant === 'support' ? <ScreenSupport /> : null}
      </HeroStyleWindow>
      <div className="mx-auto flex max-w-lg items-start gap-2 rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-xs text-slate-600 shadow-sm sm:text-sm sm:px-4">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-600">
          <CheckIcon className="h-3.5 w-3.5" />
        </span>
        <div>
          <div className="font-medium text-slate-800">{h.title}</div>
          <p className="mt-0.5 text-slate-500">{h.body}</p>
        </div>
      </div>
    </div>
  )
}
