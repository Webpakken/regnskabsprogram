import { useState, type ComponentType, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { PlatformSettingsSideNav } from '@/components/PlatformSettingsSideNav'
import { RegisterPushNotifications } from '@/components/RegisterPushNotifications'
import { PLATFORM_MAIN_SCROLL_ID } from '@/components/ScrollToTop'
import { useApp } from '@/context/AppProvider'
import { logoutToLanding } from '@/lib/logoutToLanding'
import {
  PlatformAdminNotificationsProvider,
  usePlatformAdminNotifications,
} from '@/hooks/usePlatformAdminNotifications'
import { PlatformNotificationBell } from '@/components/PlatformNotificationBell'
import { BrandMark } from '@/components/BrandMark'

const nav = [
  { to: '/platform/dashboard', label: 'Overblik' },
  { to: '/platform/companies', label: 'Virksomheder' },
  { to: '/platform/chat', label: 'Support', notifKind: 'support' as const },
  { to: '/platform/billing', label: 'Planer', superadminOnly: true },
  { to: '/platform/seo', label: 'SEO', superadminOnly: true },
  { to: '/platform/staff', label: 'Team', superadminOnly: true },
]

type IconProps = { className?: string }

function svg(children: ReactNode) {
  return function Icon({ className }: IconProps) {
    return (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    )
  }
}

const OverviewIcon = svg(
  <>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </>,
)
const CompaniesIcon = svg(
  <>
    <path d="M3 21h18" />
    <path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16" />
    <path d="M15 9h2a2 2 0 0 1 2 2v10" />
    <path d="M9 7h2M9 11h2M9 15h2" />
  </>,
)
const SupportIcon = svg(
  <>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="3.2" />
    <path d="m4.8 4.8 4.4 4.4M14.8 14.8l4.4 4.4M19.2 4.8l-4.4 4.4M9.2 14.8l-4.4 4.4" />
  </>,
)
const SettingsIcon = svg(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </>,
)
const MoreIcon = svg(
  <>
    <circle cx="5" cy="12" r="1.4" />
    <circle cx="12" cy="12" r="1.4" />
    <circle cx="19" cy="12" r="1.4" />
  </>,
)
const TagIcon = svg(
  <>
    <path d="M20.59 13.41 12 22l-9-9V4a1 1 0 0 1 1-1h8z" />
    <circle cx="7.5" cy="7.5" r="1.2" />
  </>,
)
const SeoIcon = svg(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </>,
)
const TeamIcon = svg(
  <>
    <circle cx="9" cy="8" r="3" />
    <path d="M3 20a6 6 0 0 1 12 0" />
    <path d="M16 5.5a3 3 0 0 1 0 5.5" />
    <path d="M17 14a6 6 0 0 1 4 5.7" />
  </>,
)
const ExternalIcon = svg(
  <>
    <path d="M14 4h6v6" />
    <path d="M20 4 10 14" />
    <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </>,
)
const LogoutIcon = svg(
  <>
    <path d="M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4" />
    <path d="M16 17l5-5-5-5" />
    <path d="M21 12H9" />
  </>,
)

/** App-agtig bund-navigation for ejeren (fast bjælke i bunden på mobil). */
type MobileNavItem = {
  to: string
  label: string
  icon: ComponentType<IconProps>
  notifKind?: 'support'
  superadminOnly?: boolean
  /** Aktiv når stien starter med dette præfiks (fx indstillinger med underruter). */
  activePrefix?: string
}

/** De fire faste faner i bund-bjælken. */
const mobileNav: MobileNavItem[] = [
  { to: '/platform/dashboard', label: 'Overblik', icon: OverviewIcon },
  { to: '/platform/companies', label: 'Virksomheder', icon: CompaniesIcon },
  { to: '/platform/chat', label: 'Support', icon: SupportIcon, notifKind: 'support' },
  {
    to: '/platform/settings/public/kontakt',
    label: 'Indstillinger',
    icon: SettingsIcon,
    activePrefix: '/platform/settings',
  },
]

/** Resten af menuen — vises i «Mere»-sliden. */
const moreNav: MobileNavItem[] = [
  { to: '/platform/billing', label: 'Planer', icon: TagIcon, superadminOnly: true },
  { to: '/platform/seo', label: 'SEO', icon: SeoIcon, superadminOnly: true },
  { to: '/platform/staff', label: 'Team', icon: TeamIcon, superadminOnly: true },
]

function NavBadge({ count, dark }: { count: number; dark?: boolean }) {
  if (count <= 0) return null
  return (
    <span
      className={clsx(
        'ml-auto inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[10px] font-bold shadow-sm',
        dark ? 'bg-rose-500 text-white' : 'bg-rose-600 text-white',
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

export function PlatformShell({ children }: { children?: ReactNode }) {
  return (
    <PlatformAdminNotificationsProvider>
      <PlatformShellInner>{children}</PlatformShellInner>
    </PlatformAdminNotificationsProvider>
  )
}

function PlatformShellInner({ children }: { children?: ReactNode }) {
  const { user, platformRole, tenantCompanyCount } = useApp()
  const { counts } = usePlatformAdminNotifications()
  const navigate = useNavigate()
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)

  async function logout() {
    await logoutToLanding(navigate)
  }

  function isItemActive(item: MobileNavItem): boolean {
    if (item.activePrefix) return location.pathname.startsWith(item.activePrefix)
    return (
      location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)
    )
  }

  const moreItems = moreNav.filter(
    (item) => !item.superadminOnly || platformRole === 'superadmin',
  )
  const moreActive = moreItems.some((item) => isItemActive(item))

  return (
    <div className="flex min-h-screen bg-slate-100">
      <RegisterPushNotifications variant="platform" />
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-slate-900 text-slate-100 md:flex">
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-4 py-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <BrandMark size="sm" />
            <div className="min-w-0 leading-tight">
              <div className="text-sm font-semibold text-white">Bilago</div>
              <div className="text-[11px] text-slate-400">Platform</div>
            </div>
          </div>
          <PlatformNotificationBell variant="sidebar" />
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          {nav
            .filter((item) => !item.superadminOnly || platformRole === 'superadmin')
            .slice(0, 4)
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition',
                    isActive
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:bg-slate-800/80 hover:text-white',
                  )
                }
              >
                <span>{item.label}</span>
                {item.notifKind === 'support' ? (
                  <NavBadge count={counts.support} dark />
                ) : null}
              </NavLink>
            ))}
          <PlatformSettingsSideNav />
          {nav
            .filter((item) => !item.superadminOnly || platformRole === 'superadmin')
            .slice(4)
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition',
                    isActive
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:bg-slate-800/80 hover:text-white',
                  )
                }
              >
                <span>{item.label}</span>
                {item.notifKind === 'support' ? (
                  <NavBadge count={counts.support} dark />
                ) : null}
              </NavLink>
            ))}
        </nav>
        {tenantCompanyCount > 0 ? (
          <div className="border-t border-slate-800 p-2">
            <button
              type="button"
              onClick={() => navigate('/app/dashboard')}
              className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-indigo-300 hover:bg-slate-800"
            >
              Til kundeappen
            </button>
          </div>
        ) : null}
        <div className="border-t border-slate-800 p-3">
          <div className="mb-2 font-mono text-[10px] leading-tight text-slate-500">
            {__PLATFORM_BUILD__}
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="mb-2 w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-200 hover:bg-slate-800"
          >
            Log ud
          </button>
          <div className="truncate text-xs text-slate-500" title={user?.email}>
            {user?.email}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <div className="flex min-w-0 items-center gap-2.5">
            <BrandMark size="sm" />
            <div className="min-w-0 leading-tight">
              <span className="text-sm font-semibold text-slate-900">Bilago</span>
              <div className="font-mono text-[10px] text-slate-400">{__PLATFORM_BUILD__}</div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <PlatformNotificationBell variant="mobile" />
          </div>
        </header>

        <main
          id={PLATFORM_MAIN_SCROLL_ID}
          className="flex-1 overflow-auto px-4 pb-24 pt-6 md:px-8 md:pb-8"
        >
          {children ?? <Outlet />}
        </main>

        {/* App-agtig bund-navigation (fast bjælke i bunden på mobil). */}
        <nav
          aria-label="Hovedmenu"
          className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        >
          {mobileNav.map((item) => {
            const active = isItemActive(item)
            const Icon = item.icon
            const showBadge = item.notifKind === 'support' && counts.support > 0
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={clsx(
                  'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium',
                  active ? 'text-indigo-700' : 'text-slate-500',
                )}
              >
                <span className="relative inline-flex">
                  <Icon className="h-5 w-5" />
                  {showBadge ? (
                    <span className="absolute -right-2.5 -top-1.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-rose-600 px-0.5 text-[9px] font-bold leading-none text-white shadow-sm">
                      {counts.support > 99 ? '99+' : counts.support}
                    </span>
                  ) : null}
                </span>
                <span>{item.label}</span>
              </NavLink>
            )
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            className={clsx(
              'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium',
              moreOpen || moreActive ? 'text-indigo-700' : 'text-slate-500',
            )}
          >
            <MoreIcon className="h-5 w-5" />
            <span>Mere</span>
          </button>
        </nav>

        {/* «Mere»-slide: resten af menuen + konto. */}
        {moreOpen ? (
          <div
            className="fixed inset-0 z-40 md:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Mere"
          >
            <button
              type="button"
              aria-label="Luk"
              className="absolute inset-0 bg-slate-900/50"
              onClick={() => setMoreOpen(false)}
            />
            <div className="absolute inset-x-0 bottom-0 max-h-[80%] overflow-y-auto rounded-t-3xl bg-slate-900 p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] text-slate-100 shadow-2xl">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-700" />
              {moreItems.length > 0 ? (
                <div className="grid gap-0.5">
                  {moreItems.map((item) => {
                    const Icon = item.icon
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => setMoreOpen(false)}
                        className={clsx(
                          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition',
                          isItemActive(item)
                            ? 'bg-slate-800 text-white'
                            : 'text-slate-300 hover:bg-slate-800/80 hover:text-white',
                        )}
                      >
                        <Icon className="h-5 w-5 shrink-0" />
                        <span>{item.label}</span>
                      </NavLink>
                    )
                  })}
                </div>
              ) : null}

              {tenantCompanyCount > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen(false)
                    navigate('/app/dashboard')
                  }}
                  className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-indigo-300 hover:bg-slate-800"
                >
                  <ExternalIcon className="h-5 w-5 shrink-0" />
                  <span>Til kundeappen</span>
                </button>
              ) : null}

              <div className="mt-2 border-t border-slate-800 pt-2">
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-200 hover:bg-slate-800"
                >
                  <LogoutIcon className="h-5 w-5 shrink-0" />
                  <span>Log ud</span>
                </button>
                <div
                  className="truncate px-3 pt-1 text-xs text-slate-500"
                  title={user?.email}
                >
                  {user?.email}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
