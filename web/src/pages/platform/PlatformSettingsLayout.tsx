import { useNavigate, NavLink, Outlet, useLocation } from 'react-router-dom'
import clsx from 'clsx'

const tabs = [
  {
    to: '/platform/settings/public/kontakt',
    label: 'Offentligt',
    activeWhen: (path: string) => path.startsWith('/platform/settings/public'),
  },
  {
    to: '/platform/settings/smtp',
    label: 'SMTP',
    activeWhen: (path: string) => path.startsWith('/platform/settings/smtp'),
  },
]

export function PlatformSettingsLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const selectValue =
    tabs.find((t) => t.activeWhen(location.pathname))?.to ??
    '/platform/settings/public/kontakt'

  return (
    <div className="mx-auto max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Platformindstillinger</h1>
        <p className="mt-1 text-sm text-slate-600">
          Offentligt indhold i faner — SMTP med adgangskode (kun platform-staff).
        </p>
      </div>

      <div className="mt-6 md:hidden">
        <label htmlFor="platform-settings-section" className="text-xs font-medium text-slate-600">
          Sektion
        </label>
        <select
          id="platform-settings-section"
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm"
          value={selectValue}
          onChange={(e) => navigate(e.target.value)}
        >
          {tabs.map((t) => (
            <option key={t.to} value={t.to}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <nav className="mt-6 hidden gap-1 border-b border-slate-200 md:flex" aria-label="Indstillinger">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={() =>
              clsx(
                '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition',
                t.activeWhen(location.pathname)
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900',
              )
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-8">
        <Outlet />
      </div>
    </div>
  )
}
