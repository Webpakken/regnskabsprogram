import { Link } from 'react-router-dom'
import { MarketingProductVisual } from '@/components/MarketingProductVisual'
import { MarketingPricingSection } from '@/components/MarketingPricingSection'
import { MarketingShell, useMarketingPublicSettings } from '@/components/MarketingShell'
import { MarketingSplitSection } from '@/components/MarketingSplitSection'
import { CheckIcon } from '@/marketing/MarketingIcons'

const included = [
  'Ubegrænset fakturaer og bilag (fair use)',
  'Bank-import og forslag til match',
  'Moms og oversigter til afregning',
  'CVR-opslag på kunder',
  'Digital opbevaring efter bogføringsloven',
  'Invitér medlemmer med roller',
  'E-mail support på dansk',
]

function PricingContent() {
  const pub = useMarketingPublicSettings()

  return (
    <>
      <MarketingSplitSection
        withHeroGradient
        withMarketingSurface={false}
        left={
          <div className="space-y-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
                Gennemsigtige priser
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
                Vælg den plan der passer til jer
              </h1>
              <p className="mt-5 max-w-xl text-lg text-slate-600">
                Start simpelt og opgradér, når I får brug for flere funktioner. Planerne viser
                tydeligt hvad der følger med, så prisen og adgangen hænger sammen.
              </p>
            </div>
            <div className="border-t border-slate-200/80 pt-8">
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
                I produktet
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
                Abonnement, som kunder møder efter tilmelding
              </h2>
              <p className="mt-2 max-w-xl text-base text-slate-600">
                Samme planlogik styrer både prissiden, abonnementssiden og adgang til funktioner i appen.
              </p>
            </div>
          </div>
        }
        right={<MarketingProductVisual variant="pricing" />}
      />

      <section className="bg-slate-50">
        <MarketingPricingSection pub={pub} />
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Funktioner der kan indgå i en plan
          </h2>
          <p className="mt-3 text-slate-600">
            De konkrete adgangsrettigheder styres af planerne ovenfor, så nye funktioner kan tilknyttes løbende.
          </p>
        </div>
        <div className="mx-auto mt-10 max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
          <ul className="space-y-4 text-sm text-slate-700">
            {included.map((line) => (
              <li key={line} className="flex items-start gap-3">
                <CheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                {line}
              </li>
            ))}
          </ul>
        </div>
        <p className="mx-auto mt-10 max-w-xl text-center text-sm text-slate-500">
          Prøv gratis i 30 dage uden betalingskort. Herefter fortsætter du på den viste månedlige
          pris — opsig når som helst.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link
            to="/signup"
            className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Start gratis prøveperiode
          </Link>
          <Link
            to="/faq"
            className="rounded-lg border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Læs FAQ
          </Link>
        </div>
      </section>
    </>
  )
}

export function PricingPage() {
  return (
    <MarketingShell pageTitle="Priser">
      <PricingContent />
    </MarketingShell>
  )
}
