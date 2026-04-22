import {
  type MarketingShowcaseVariant,
  MarketingShowcaseBody,
} from '@/components/MarketingPageMockups'

type MarketingDashboardShowcaseProps = {
  /** Hvilken unik produkt-mockup der vises (samme stil som forsiden, andet indhold) */
  variant: MarketingShowcaseVariant
  kicker?: string
  title?: string
  subtitle?: string
  className?: string
}

const footnote: Record<MarketingShowcaseVariant, string> = {
  features: 'Illustration: CVR-opslag og bank-linjer — stil som i Bilago.',
  pricing: 'Illustration: abonnement og betalingshistorik — tal er eksempler.',
  faq: 'Illustration: søgning og emner — svar findes i listen nedenfor.',
  support: 'Illustration: support-tråd i appen — sådan føles dialogen ofte.',
}

/**
 * Offentlige marketing-sider: kodebaserede UI-mockups (som forsiden),
 * unikt indhold pr. `variant` — ingen statiske marketing-fotos.
 */
export function MarketingDashboardShowcase({
  variant,
  kicker = 'Produkt',
  title = 'Sådan ser det ud i Bilago',
  subtitle = 'Korte skærmbilleder bygget i samme stil som forsiden — så du kan mærke produktet.',
  className = '',
}: MarketingDashboardShowcaseProps) {
  const headingId = `marketing-showcase-${variant}-heading`
  return (
    <section
      className={`border-b border-slate-100 bg-gradient-to-b from-slate-50/80 to-white ${className}`}
      aria-labelledby={headingId}
    >
      <div className="mx-auto max-w-6xl px-6 py-14 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">{kicker}</p>
          <h2
            id={headingId}
            className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl"
          >
            {title}
          </h2>
          <p className="mt-3 text-base text-slate-600 sm:text-lg">{subtitle}</p>
        </div>
        <div
          className="mt-10"
          role="img"
          aria-label={footnote[variant].replace('Illustration: ', '')}
        >
          <MarketingShowcaseBody variant={variant} />
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">{footnote[variant]}</p>
      </div>
    </section>
  )
}
