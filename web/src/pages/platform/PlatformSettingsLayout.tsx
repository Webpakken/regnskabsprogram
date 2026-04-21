import { useNavigate, NavLink, Outlet, useLocation } from 'react-router-dom'
import clsx from 'clsx'

const tabs = [
  { to: '/platform/settings/public', label: 'Offentligt & pris' },
  { to: '/platform/settings/smtp', label: 'SMTP' },
]

export function PlatformSettingsLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const selectValue =
    tabs.find((t) => location.pathname === t.to)?.to ?? '/platform/settings/public'

  return (
    <div className="mx-auto max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Platformindstillinger</h1>
        <p className="mt-1 text-sm text-slate-600">
          Fordelt i sektioner — SMTP uden adgangskode i databasen.
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

      <div className="mt-8">
        <Outlet />
      </div>
    </div>
  )
}
