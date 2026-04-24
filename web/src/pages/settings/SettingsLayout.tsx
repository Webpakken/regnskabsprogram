import { Link, Outlet, useLocation } from 'react-router-dom'
import { AppPageLayout } from '@/components/AppPageLayout'

const tabs = [
  { to: '/app/settings/general', label: 'Generelt' },
  { to: '/app/settings/invoice', label: 'Faktura' },
  { to: '/app/settings/notifications', label: 'Notifikationer' },
  { to: '/app/settings/subscription', label: 'Abonnement' },
]

export function SettingsLayout() {
  const location = useLocation()
  const isMenuPage = location.pathname === '/app/settings'
  const activeTab =
    tabs.find((tab) => location.pathname === tab.to || location.pathname.startsWith(`${tab.to}/`)) ??
    null

  return (
    <AppPageLayout maxWidth="full" className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Indstillinger</h1>
        <p className="text-sm text-slate-600">Virksomhed, faktura, notifikationer og abonnement</p>
      </div>

      {!isMenuPage ? (
        <div className="md:hidden">
          <Link
            to="/app/settings"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <svg
              viewBox="0 0 20 20"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="m12.5 4.5-5 5 5 5" />
            </svg>
            Tilbage til indstillinger
          </Link>
          {activeTab ? (
            <p className="mt-3 text-sm font-semibold text-slate-900">{activeTab.label}</p>
          ) : null}
        </div>
      ) : null}

      <Outlet />
    </AppPageLayout>
  )
}
