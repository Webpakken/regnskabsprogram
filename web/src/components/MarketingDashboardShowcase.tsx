type MarketingDashboardShowcaseProps = {
  /** Overline over overskriften */
  kicker?: string
  title?: string
  subtitle?: string
  className?: string
}

const imgDashboard = '/marketing/bilago-dashboard-hero.png'
const imgInvoiceMail = '/marketing/invoice-email-notification.png'

/**
 * Offentlige marketing-sider: viser skærmbilleder af dashboard og fakturamail
 * så kunder kan se hvad de får.
 */
export function MarketingDashboardShowcase({
  kicker = 'Produkt',
  title = 'Sådan ser det ud i Bilago',
  subtitle = 'Overblik over omsætning, fakturaer og bank-match — plus professionelle mails når du sender faktura.',
  className = '',
}: MarketingDashboardShowcaseProps) {
  return (
    <section
      className={`border-b border-slate-100 bg-gradient-to-b from-slate-50/80 to-white ${className}`}
      aria-labelledby="marketing-dashboard-showcase-heading"
    >
      <div className="mx-auto max-w-6xl px-6 py-14 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">{kicker}</p>
          <h2
            id="marketing-dashboard-showcase-heading"
            className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl"
          >
            {title}
          </h2>
          <p className="mt-3 text-base text-slate-600 sm:text-lg">{subtitle}</p>
        </div>
        <div className="mt-10 grid gap-8 lg:grid-cols-2 lg:items-start lg:gap-10">
          <figure className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-md shadow-slate-200/50 ring-1 ring-slate-900/5">
            <img
              src={imgDashboard}
              alt="Bilago dashboard med nøgletal, seneste fakturaer og status, samt bank-match notifikation"
              width={1200}
              height={800}
              className="h-auto w-full object-cover object-top"
              loading="lazy"
              decoding="async"
            />
            <figcaption className="border-t border-slate-100 px-4 py-3 text-left text-sm text-slate-600">
              <span className="font-medium text-slate-800">Dashboard</span> — omsætning, udestående
              og seneste fakturaer på ét sted.
            </figcaption>
          </figure>
          <figure className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-md shadow-slate-200/50 ring-1 ring-slate-900/5">
            <img
              src={imgInvoiceMail}
              alt="E-mail notifikation med fakturadetaljer og beløb inklusiv moms fra Bilago"
              width={800}
              height={600}
              className="h-auto w-full object-cover object-top"
              loading="lazy"
              decoding="async"
            />
            <figcaption className="border-t border-slate-100 px-4 py-3 text-left text-sm text-slate-600">
              <span className="font-medium text-slate-800">Fakturamail</span> — tydelig oversigt til
              kunden med beløb og forfald.
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  )
}
