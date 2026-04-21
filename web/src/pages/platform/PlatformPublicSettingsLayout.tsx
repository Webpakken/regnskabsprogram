import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { PlatformPublicSettingsProvider } from '@/hooks/usePlatformPublicSettings'

const subTabs = [
  { to: '/platform/settings/public/kontakt', label: 'Kontakt & links' },
  { to: '/platform/settings/public/aabning', label: 'Åbningstider' },
  { to: '/platform/settings/public/pris', label: 'Pris' },
]

export function PlatformPublicSettingsLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const selectValue =
    subTabs.find((t) => location.pathname === t.to)?.to ??
    '/platform/settings/public/kontakt'

  return (
    <PlatformPublicSettingsProvider>
      <div className="space-y-6">
      <div className="md:hidden">
        <label htmlFor="public-settings-tab" className="text-xs font-medium text-slate-600">
          Undersektion
        </label>
        <select
          id="public-settings-tab"
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm"
          value={selectValue}
          onChange={(e) => navigate(e.target.value)}
        >
          {subTabs.map((t) => (
            <option key={t.to} value={t.to}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <nav
        className="hidden gap-1 border-b border-slate-200 md:flex"
        aria-label="Offentlige indstillinger"
      >
        {subTabs.map((t) => (
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
      </div>
    </PlatformPublicSettingsProvider>
  )
}
