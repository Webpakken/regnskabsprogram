import { useState, type ReactElement } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { marketingFeatureCards } from '@/marketing/featureCards'

type IconProps = { className?: string }

/** Ekstra bund-padding på marketing-footer under `md`, så sidste links ikke skjules bag den faste menu. */
export const marketingMobileNavFooterPad =
  'max-md:pb-[calc(5.25rem+env(safe-area-inset-bottom))]'

function HomeIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 11 12 4l9 7v9a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2z" />
    </svg>
  )
}

function GridIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
    </svg>
  )
}

function TagIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20.6 12.6 12.6 20.6a2 2 0 0 1-2.83 0l-6.77-6.77A2 2 0 0 1 2.4 12.4V5a2.6 2.6 0 0 1 2.6-2.6h7.4a2 2 0 0 1 1.43.59l6.77 6.77a2 2 0 0 1 0 2.84z" />
      <circle cx="7.5" cy="7.5" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  )
}

function MoreIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="5" cy="12" r="0.6" />
      <circle cx="12" cy="12" r="0.6" />
      <circle cx="19" cy="12" r="0.6" />
    </svg>
  )
}

function PercentIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m5 19 14-14" />
      <circle cx="7" cy="7" r="2.2" />
      <circle cx="17" cy="17" r="2.2" />
    </svg>
  )
}

function HeadsetIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 14v1a4 4 0 0 0 4 4h1" />
      <path d="M20 14v1a4 4 0 0 1-4 4h-1" />
      <path d="M6 14h-.5A2.5 2.5 0 0 1 3 11.5V10a9 9 0 0 1 18 0v1.5A2.5 2.5 0 0 1 18.5 14H18" />
    </svg>
  )
}

function FaqIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 2-3 4" />
      <path d="M12 17h.01" />
    </svg>
  )
}

function NavTab({
  to,
  label,
  Icon,
  end,
}: {
  to: string
  label: string
  Icon: (p: IconProps) => ReactElement
  end?: boolean
}) {
  return (
    <NavLink
      to={to}
      end={Boolean(end)}
      className={({ isActive }) =>
        clsx(
          'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium',
          isActive ? 'text-indigo-700' : 'text-slate-500',
        )
      }
    >
      <Icon className="h-5 w-5" />
      <span>{label}</span>
    </NavLink>
  )
}

function SheetTab({
  label,
  Icon,
  active,
  onClick,
}: {
  label: string
  Icon: (p: IconProps) => ReactElement
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      className={clsx(
        'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium',
        active ? 'text-indigo-700' : 'text-slate-500',
      )}
    >
      <Icon className="h-5 w-5" />
      <span>{label}</span>
    </button>
  )
}

export function MarketingMobileBottomNav() {
  const [sheet, setSheet] = useState<null | 'products' | 'more'>(null)
  const navigate = useNavigate()

  function go(path: string) {
    setSheet(null)
    navigate(path)
  }

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 md:hidden">
        <nav
          className="pointer-events-auto flex items-stretch border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
          aria-label="Hovedmenu"
        >
          <NavTab to="/" label="Forside" Icon={HomeIcon} end />
          <SheetTab
            label="Produkter"
            Icon={GridIcon}
            active={sheet === 'products'}
            onClick={() => setSheet(sheet === 'products' ? null : 'products')}
          />
          <NavTab to="/priser" label="Pris" Icon={TagIcon} />
          <SheetTab
            label="Mere"
            Icon={MoreIcon}
            active={sheet === 'more'}
            onClick={() => setSheet(sheet === 'more' ? null : 'more')}
          />
        </nav>
      </div>

      {sheet === 'products' ? (
        <div
          className="fixed inset-0 z-40 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Produkter"
        >
          <button
            type="button"
            aria-label="Luk"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setSheet(null)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[calc(100dvh-0.5rem)] overflow-y-auto rounded-t-3xl bg-white px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+14px)] shadow-2xl sm:max-h-[min(85vh,36rem)] sm:p-5 sm:pb-[calc(env(safe-area-inset-bottom)+20px)]">
            <div className="mx-auto h-1 w-10 rounded-full bg-slate-200" />
            <h2 className="mt-3 text-center text-sm font-semibold text-slate-900">Produkter</h2>
            <ul className="mt-3 space-y-0.5 sm:mt-4 sm:space-y-1">
              {marketingFeatureCards.map((f) => (
                <li key={f.slug}>
                  <button
                    type="button"
                    onClick={() => go(`/funktioner/${f.slug}`)}
                    className="flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-slate-50 sm:px-3 sm:py-3"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 sm:h-10 sm:w-10">
                      <f.icon className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">{f.title}</span>
                        {f.comingSoon ? (
                          <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
                            Snart
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-[13px] leading-snug text-slate-500 sm:text-xs">
                        {f.desc.length > 80 ? `${f.desc.slice(0, 78)}…` : f.desc}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-3 border-t border-slate-100 pt-2.5 sm:mt-4 sm:pt-3">
              <button
                type="button"
                onClick={() => go('/funktioner')}
                className="flex w-full items-center justify-center gap-1 rounded-xl px-3 py-2.5 text-sm font-semibold text-indigo-600 hover:bg-indigo-50/60 sm:py-3"
              >
                Se alle funktioner <span aria-hidden>→</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {sheet === 'more' ? (
        <div
          className="fixed inset-0 z-40 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Flere sider"
        >
          <button
            type="button"
            aria-label="Luk"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setSheet(null)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[min(85vh,32rem)] overflow-y-auto rounded-t-3xl bg-white p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] shadow-2xl">
            <div className="mx-auto h-1 w-10 rounded-full bg-slate-200" />
            <h2 className="mt-4 text-center text-sm font-semibold text-slate-900">Mere</h2>
            <ul className="mt-4 space-y-0.5">
              <li>
                <button
                  type="button"
                  onClick={() => go('/faq')}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-800 hover:bg-slate-50"
                >
                  <FaqIcon className="h-5 w-5 shrink-0 text-indigo-600" />
                  FAQ
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => go('/support-tider')}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-800 hover:bg-slate-50"
                >
                  <HeadsetIcon className="h-5 w-5 shrink-0 text-indigo-600" />
                  Support og åbningstider
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => go('/app/vat')}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-800 hover:bg-slate-50"
                >
                  <PercentIcon className="h-5 w-5 shrink-0 text-indigo-600" />
                  Moms (i appen)
                </button>
              </li>
            </ul>
            <div className="mt-4 border-t border-slate-100 pt-3">
              <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Juridisk</p>
              <ul className="mt-2 space-y-0.5">
                {(
                  [
                    ['/handelsbetingelser', 'Handelsbetingelser'],
                    ['/privatlivspolitik', 'Privatlivspolitik'],
                    ['/cookiepolitik', 'Cookiepolitik'],
                    ['/databehandleraftale', 'Databehandleraftale'],
                  ] as const
                ).map(([href, label]) => (
                  <li key={href}>
                    <Link
                      to={href}
                      onClick={() => setSheet(null)}
                      className="block rounded-lg px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
