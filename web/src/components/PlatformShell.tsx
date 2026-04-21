import type { ReactNode } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { useApp } from '@/context/AppProvider'
import { supabase } from '@/lib/supabase'

const nav = [
  { to: '/platform/dashboard', label: 'Overblik' },
  { to: '/platform/companies', label: 'Virksomheder' },
  { to: '/platform/support', label: 'Support' },
  { to: '/platform/settings/public', label: 'Indstillinger' },
  { to: '/platform/staff', label: 'Team', superadminOnly: true },
]

export function PlatformShell({ children }: { children?: ReactNode }) {
  const { user, platformRole, tenantCompanyCount } = useApp()
  const navigate = useNavigate()

  async function logout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen bg-slate-100">
      <aside className="hidden w-52 shrink-0 flex-col border-r border-slate-200 bg-slate-900 text-slate-100 md:flex">
        <div className="border-b border-slate-800 px-4 py-5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Bilago
          </div>
          <div className="mt-0.5 text-sm font-semibold text-white">Platform</div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-2">
          {nav
            .filter((item) => !item.superadminOnly || platformRole === 'superadmin')
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  clsx(
                    'rounded-lg px-3 py-2 text-sm font-medium transition',
                    isActive
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:bg-slate-800/80 hover:text-white',
                  )
                }
              >
                {item.label}
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
        <div className="border-t border-slate-800 p-3 text-xs text-slate-500">
          {user?.email}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-slate-200 bg-white md:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm font-semibold text-slate-900">Platform</span>
            <button
              type="button"
              className="text-sm text-indigo-600"
              onClick={() => void logout()}
            >
              Log ud
            </button>
          </div>
          <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-2 py-2 text-xs font-medium">
            {nav
              .filter((item) => !item.superadminOnly || platformRole === 'superadmin')
              .map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    clsx(
                      'shrink-0 rounded-lg px-2.5 py-1.5',
                      isActive
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700',
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
          </nav>
        </header>
        <main className="flex-1 overflow-auto px-4 py-6 md:px-8">
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  )
}
