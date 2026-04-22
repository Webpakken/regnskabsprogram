import { Link } from 'react-router-dom'
import { MarketingDashboardShowcase } from '@/components/MarketingDashboardShowcase'
import { MarketingShell } from '@/components/MarketingShell'
import { marketingFaqs } from '@/marketing/marketingData'

export function FaqPage() {
  return (
    <MarketingShell pageTitle="FAQ">
      <section className="relative overflow-hidden border-b border-slate-100">
        <div
          className="absolute inset-0 -z-10 bg-gradient-to-b from-indigo-50 via-white to-white"
          aria-hidden
        />
        <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
            Hjælp & svar
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
            Ofte stillede spørgsmål
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-slate-600">
            Find hurtigt svar om pris, binding, bogføringsloven og skift fra andre systemer. Finder
            du ikke det du leder efter, er du velkommen til at skrive via support.
          </p>
        </div>
      </section>

      <MarketingDashboardShowcase />

      <section className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
        <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white shadow-sm">
          {marketingFaqs.map((f) => (
            <details key={f.q} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer items-center justify-between text-sm font-semibold text-slate-900">
                {f.q}
                <span className="ml-4 shrink-0 text-slate-400 transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{f.a}</p>
            </details>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-8 text-center">
          <p className="text-sm font-medium text-slate-900">Klar til at prøve Bilago?</p>
          <p className="mt-2 text-sm text-slate-600">
            30 dage gratis — ingen kort påkrævet.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              to="/signup"
              className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Opret konto
            </Link>
            <Link
              to="/priser"
              className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Se priser
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  )
}
