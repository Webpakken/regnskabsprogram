import { Link, Navigate } from 'react-router-dom'
import { useApp } from '@/context/AppProvider'

type IconProps = { className?: string }

function InvoiceIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h6" />
    </svg>
  )
}

function ReceiptIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 3v18l2-1 2 1 2-1 2 1 2-1 2 1 2-1V3z" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </svg>
  )
}

function BankIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10 12 4l9 6" />
      <path d="M5 10v8M9 10v8M15 10v8M19 10v8" />
      <path d="M3 20h18" />
    </svg>
  )
}

function SearchIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

function CheckIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 12 5 5 9-11" />
    </svg>
  )
}

const features = [
  {
    icon: InvoiceIcon,
    title: 'Fakturering',
    desc: 'Opret og send professionelle fakturaer med moms, EAN og fortløbende numre på få sekunder.',
  },
  {
    icon: ReceiptIcon,
    title: 'Bilag',
    desc: 'Upload kvitteringer og bilag, og hold styr på dine udgifter pr. konto uden bøvl.',
  },
  {
    icon: BankIcon,
    title: 'Bank-afstemning',
    desc: 'Importér kontoudtog og match automatisk mod fakturaer og bilag — uden fejl.',
  },
  {
    icon: SearchIcon,
    title: 'CVR-opslag',
    desc: 'Slå kunder op via CVR-nummer og få navn, adresse og data automatisk udfyldt.',
  },
]

const perks = [
  '30 dage gratis — ingen kort påkrævet',
  'Bygget til danske regler og moms',
  'Opfylder bogføringsloven',
  'Ingen binding — sig op når du vil',
]

const testimonials = [
  {
    quote:
      'Bilago har gjort vores månedsafslutning meget hurtigere. Bank-afstemningen alene sparer mig timer.',
    name: 'Mette H.',
    role: 'Indehaver, ApS',
  },
  {
    quote:
      'Endelig et regnskabsprogram der føles enkelt. CVR-opslaget er en lille ting der betyder meget.',
    name: 'Anders K.',
    role: 'Konsulent',
  },
  {
    quote:
      'Fakturering tager nu minutter i stedet for timer. Vi har ikke misset en faktura siden vi skiftede.',
    name: 'Sara L.',
    role: 'Freelancer',
  },
]

const faqs = [
  {
    q: 'Er Bilago i overensstemmelse med bogføringsloven?',
    a: 'Ja. Bilago gemmer bilag digitalt og opfylder kravene til opbevaring og dokumentation i den nye bogføringslov.',
  },
  {
    q: 'Kan jeg skifte fra et andet regnskabsprogram?',
    a: 'Ja. Du kan komme i gang med det samme ved at oprette en konto og indtaste dine virksomhedsoplysninger via CVR-opslag.',
  },
  {
    q: 'Er der binding?',
    a: 'Nej. Du betaler månedligt og kan opsige dit abonnement når som helst.',
  },
  {
    q: 'Hvad koster Bilago?',
    a: 'Bilago koster normalt 249 kr./md. Vi kører et introtilbud på 99 kr./md, og den pris er låst så længe dit abonnement løber — også efter tilbuddet slutter.',
  },
  {
    q: 'Er der en gratis prøveperiode?',
    a: 'Ja. De første 30 dage er gratis, og du behøver ikke at tilføje betalingsoplysninger før du vil fortsætte.',
  },
]

export function LandingPage() {
  const { session, loading } = useApp()

  if (!loading && session) {
    return <Navigate to="/home" replace />
  }

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-semibold text-white">
              B
            </span>
            <span className="text-lg font-semibold">Bilago</span>
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-slate-600 md:flex">
            <a href="#features" className="hover:text-slate-900">
              Funktioner
            </a>
            <a href="#pricing" className="hover:text-slate-900">
              Priser
            </a>
            <a href="#faq" className="hover:text-slate-900">
              FAQ
            </a>
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <Link to="/login" className="hidden text-slate-600 hover:text-slate-900 sm:inline">
              Log ind
            </Link>
            <Link
              to="/signup"
              className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700"
            >
              Kom i gang
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 -z-10 bg-gradient-to-b from-indigo-50 via-white to-white"
          aria-hidden
        />
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 lg:grid-cols-2 lg:items-center lg:py-28">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
              30 dage gratis · ingen kort påkrævet
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
              {perks.map((p) => (
                <li key={p} className="flex items-center gap-2">
                  <CheckIcon className="h-4 w-4 text-emerald-600" />
                  {p}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xl shadow-indigo-100/60">
              <div className="flex items-center gap-1.5 border-b border-slate-100 pb-3">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
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
                    { name: 'Acme ApS', amount: '12.400 kr.', status: 'Betalt', tone: 'text-emerald-700 bg-emerald-50' },
                    { name: 'Nordlys A/S', amount: '8.750 kr.', status: 'Afventer', tone: 'text-amber-700 bg-amber-50' },
                    { name: 'Fjord Studio', amount: '3.200 kr.', status: 'Kladde', tone: 'text-slate-700 bg-slate-100' },
                  ].map((r) => (
                    <li key={r.name} className="flex items-center justify-between">
                      <span className="font-medium text-slate-800">{r.name}</span>
                      <span className="flex items-center gap-3 text-slate-600">
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
                  <div className="text-sm font-semibold">Bank-match fundet</div>
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
        </div>
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-slate-200 bg-white p-6 transition hover:border-indigo-200 hover:shadow-md"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white">
                <f.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-5 text-base font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{f.desc}</p>
            </div>
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
            <span className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
              Bank-afstemning
            </span>
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
          {testimonials.map((t) => (
            <figure
              key={t.name}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <blockquote className="text-sm text-slate-700">"{t.quote}"</blockquote>
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
        <div className="mx-auto max-w-3xl px-6 py-24 text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Én plan. Alt inkluderet.
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Ingen bindingsperiode. Opsig når du vil.
          </p>
          <div className="mx-auto mt-10 max-w-md rounded-2xl border-2 border-indigo-200 bg-white p-8 shadow-lg shadow-indigo-100/60">
            <div className="flex items-center justify-center">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                Introtilbud — lås prisen
              </span>
            </div>
            <div className="mt-5 text-sm font-semibold uppercase tracking-wide text-indigo-600">
              Bilago
            </div>
            <div className="mt-2 text-sm text-slate-400">
              <span className="line-through">249 kr./md</span>
            </div>
            <div className="mt-1 flex items-baseline justify-center gap-1">
              <span className="text-5xl font-semibold text-slate-900">99</span>
              <span className="text-base text-slate-500">kr./md</span>
            </div>
            <p className="mt-3 text-xs text-slate-600">
              Første måned gratis. Tilmeld dig nu og behold <strong className="text-slate-900">99 kr./md</strong> for altid — så længe dit abonnement løber.
            </p>
            <ul className="mt-6 space-y-3 text-left text-sm text-slate-700">
              {[
                'Fakturering med dansk moms',
                'Bilagshåndtering og digital arkivering',
                'Bank-afstemning og CSV-import',
                'CVR-opslag',
                'Dansk support via mail',
              ].map((l) => (
                <li key={l} className="flex items-start gap-2">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  {l}
                </li>
              ))}
            </ul>
            <Link
              to="/signup"
              className="mt-8 block rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Kom i gang
            </Link>
          </div>
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-3xl px-6 py-24">
        <div className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Ofte stillede spørgsmål
          </h2>
        </div>
        <div className="mt-10 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {faqs.map((f) => (
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

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-semibold text-white">
                H
              </span>
              <span className="text-lg font-semibold">Bilago</span>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              Dansk regnskab, bygget enkelt.
            </p>
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">Produkt</div>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li><a href="#features" className="hover:text-slate-900">Funktioner</a></li>
              <li><a href="#pricing" className="hover:text-slate-900">Priser</a></li>
              <li><a href="#faq" className="hover:text-slate-900">FAQ</a></li>
            </ul>
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">Konto</div>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li><Link to="/login" className="hover:text-slate-900">Log ind</Link></li>
              <li><Link to="/signup" className="hover:text-slate-900">Opret konto</Link></li>
            </ul>
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">Kontakt</div>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>support@bilago.dk</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-slate-100 py-6 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} Bilago. Alle rettigheder forbeholdes.
        </div>
      </footer>
    </div>
  )
}
