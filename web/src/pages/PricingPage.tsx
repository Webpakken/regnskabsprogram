import { Link } from 'react-router-dom'
import { MarketingDashboardShowcase } from '@/components/MarketingDashboardShowcase'
import { MarketingPricingSection } from '@/components/MarketingPricingSection'
import { MarketingShell, useMarketingPublicSettings } from '@/components/MarketingShell'
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
      <section className="relative overflow-hidden border-b border-slate-100">
        <div
          className="absolute inset-0 -z-10 bg-gradient-to-b from-indigo-50 via-white to-white"
          aria-hidden
        />
        <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
            Gennemsigtige priser
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
            Ét abonnement — ingen skjulte gebyrer
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-slate-600">
            Du betaler kun for Bilago. Ingen ekstra moduler for faktura, bilag eller bank — det
            hele følger med, så du ved hvad det koster.
          </p>
        </div>
      </section>

      <MarketingDashboardShowcase
        kicker="Hvad du får"
        title="Samme overblik som alle andre funktioner"
        subtitle="Ét abonnement giver adgang til dashboard, fakturering og de mails dine kunder modtager."
      />

      <section className="bg-slate-50">
        <MarketingPricingSection pub={pub} />
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Inkluderet i dit abonnement
          </h2>
          <p className="mt-3 text-slate-600">
            Ligesom du kender det fra andre danske løsninger — samlet værdi uden tillægsmoduler.
          </p>
        </div>
        <div className="mx-auto mt-10 max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
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
