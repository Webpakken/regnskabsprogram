import type { ReactNode } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
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

const nav = [
  { to: '/platform/dashboard', label: 'Overblik' },
  { to: '/platform/companies', label: 'Virksomheder' },
  { to: '/platform/support', label: 'Support', notifKind: 'support' as const },
  { to: '/platform/seo', label: 'SEO', superadminOnly: true },
  { to: '/platform/staff', label: 'Team', superadminOnly: true },
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

  async function logout() {
    await logoutToLanding(navigate)
  }

  return (
    <div className="flex min-h-screen bg-slate-100">
      <RegisterPushNotifications variant="platform" />
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-slate-900 text-slate-100 md:flex">
        <div className="flex items-start justify-between gap-2 border-b border-slate-800 px-4 py-5">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Bilago
            </div>
            <div className="mt-0.5 text-sm font-semibold text-white">Platform</div>
          </div>
          <PlatformNotificationBell variant="sidebar" />
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          {nav
            .filter((item) => !item.superadminOnly || platformRole === 'superadmin')
            .slice(0, 3)
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
            .slice(3)
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
        <header className="border-b border-slate-200 bg-white md:hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <div className="min-w-0">
              <span className="text-sm font-semibold text-slate-900">Platform</span>
              <div className="font-mono text-[10px] text-slate-400">{__PLATFORM_BUILD__}</div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <PlatformNotificationBell variant="mobile" />
              <button
                type="button"
                className="text-sm text-indigo-600"
                onClick={() => void logout()}
              >
                Log ud
              </button>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-2 py-2 text-xs font-medium">
            {[
              ...nav.slice(0, 3),
              { to: '/platform/settings/public/kontakt', label: 'Indstillinger' },
              ...nav.slice(3),
            ]
              .filter(
                (item: { superadminOnly?: boolean }) =>
                  !item.superadminOnly || platformRole === 'superadmin',
              )
              .map((item) => {
                const showSupportBadge =
                  'notifKind' in item && item.notifKind === 'support' && counts.support > 0
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      clsx(
                        'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5',
                        isActive
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-700',
                      )
                    }
                  >
                    <span>{item.label}</span>
                    {showSupportBadge ? <NavBadge count={counts.support} /> : null}
                  </NavLink>
                )
              })}
          </nav>
        </header>
        <main id={PLATFORM_MAIN_SCROLL_ID} className="flex-1 overflow-auto px-4 py-6 md:px-8">
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  )
}
