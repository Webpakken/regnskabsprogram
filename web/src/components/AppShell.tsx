import type { ReactNode } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { useApp, subscriptionOk } from '@/context/AppProvider'
import { startStripeCheckout } from '@/lib/edge'
import { supabase } from '@/lib/supabase'

const nav = [
  { to: '/app/dashboard', label: 'Oversigt' },
  { to: '/app/invoices', label: 'Fakturaer' },
  { to: '/app/vouchers', label: 'Bilag' },
  { to: '/app/bank', label: 'Bank' },
  { to: '/app/settings', label: 'Indstillinger' },
]

export function AppShell({ children }: { children?: ReactNode }) {
  const {
    user,
    companies,
    currentCompany,
    subscription,
    setCurrentCompanyId,
  } = useApp()
  const navigate = useNavigate()
  const ok = subscriptionOk(subscription)

  async function logout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="border-b border-slate-100 px-4 py-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Hisab
          </div>
          <div className="mt-1 text-lg font-semibold text-slate-900">
            Regnskab
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-3">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  'rounded-lg px-3 py-2 text-sm font-medium transition',
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-50',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-100 p-3 text-xs text-slate-500">
          {user?.email}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2 md:flex-row md:items-center md:gap-4">
            <select
              className="max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm md:max-w-xs"
              value={currentCompany?.id ?? ''}
              onChange={(e) => void setCurrentCompanyId(e.target.value)}
            >
              {companies.length === 0 ? (
                <option value="">Ingen virksomhed</option>
              ) : (
                companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))
              )}
            </select>
            {!ok && currentCompany && (
              <span className="text-xs text-amber-700">
                Abonnement påkrævet for fuld adgang
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!ok && currentCompany && (
              <button
                type="button"
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                onClick={() =>
                  void startStripeCheckout(currentCompany.id).then((url) => {
                    window.location.href = url
                  })
                }
              >
                Abonnér
              </button>
            )}
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              onClick={() => void logout()}
            >
              Log ud
            </button>
          </div>
        </header>

        {!ok && currentCompany ? (
          <div className="border-b border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Aktivér dit månedsabonnement for at bruge Hisab. Data er isoleret per
            virksomhed (CVR kan tilføjes under Indstillinger).
          </div>
        ) : null}

        <main className="flex-1 px-4 py-6 md:px-8">
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  )
}
