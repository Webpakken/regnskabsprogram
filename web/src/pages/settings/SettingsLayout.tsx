import { NavLink, Outlet } from 'react-router-dom'
import clsx from 'clsx'
import { AppPageLayout } from '@/components/AppPageLayout'

const tabs = [
  { to: '/app/settings/general', label: 'Generelt' },
  { to: '/app/settings/invoice', label: 'Faktura' },
  { to: '/app/settings/notifications', label: 'Notifikationer' },
  { to: '/app/settings/subscription', label: 'Abonnement' },
]

export function SettingsLayout() {
  return (
    <AppPageLayout maxWidth="2xl" className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Indstillinger</h1>
        <p className="text-sm text-slate-600">Virksomhed, faktura, notifikationer og abonnement</p>
      </div>

      <nav className="flex gap-1 border-b border-slate-200" aria-label="Indstillinger">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              clsx(
                '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition',
                isActive
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900',
              )
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </AppPageLayout>
  )
}
