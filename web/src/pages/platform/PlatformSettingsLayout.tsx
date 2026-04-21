import { useEffect, useMemo } from 'react'
import { useNavigate, Outlet, useLocation } from 'react-router-dom'
import { useApp } from '@/context/AppProvider'
import {
  EMAIL_TEMPLATE_NAV,
  PUBLIC_SETTINGS_LINKS,
  SMTP_PROFILE_IDS,
  SMTP_SIDEBAR_LABELS,
  getPlatformSettingsPageMeta,
} from '@/lib/platformSettingsNav'

type MobileOption = { value: string; label: string }

export function PlatformSettingsLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { platformRole } = useApp()

  const mobileOptions = useMemo(() => {
    const publicOpts: MobileOption[] = PUBLIC_SETTINGS_LINKS.map((l) => ({
      value: l.to,
      label: l.label,
    }))
    const smtpOpts: MobileOption[] = SMTP_PROFILE_IDS.map((id) => ({
      value: `/platform/settings/smtp/${id}`,
      label: SMTP_SIDEBAR_LABELS[id],
    }))
    const emailOpts: MobileOption[] =
      platformRole === 'superadmin'
        ? EMAIL_TEMPLATE_NAV.map((e) => ({
            value: `/platform/settings/emails/${e.slug}`,
            label: e.label,
          }))
        : []
    return { publicOpts, smtpOpts, emailOpts }
  }, [platformRole])

  const selectValue = useMemo(() => {
    const path = location.pathname
    const flat = [
      ...mobileOptions.publicOpts,
      ...mobileOptions.smtpOpts,
      ...mobileOptions.emailOpts,
    ]
    const exact = flat.find((o) => o.value === path)
    if (exact) return exact.value
    if (path.startsWith('/platform/settings/public')) {
      return mobileOptions.publicOpts[0]?.value ?? '/platform/settings/public/kontakt'
    }
    if (path.startsWith('/platform/settings/smtp')) {
      return mobileOptions.smtpOpts[0]?.value ?? '/platform/settings/smtp/marketing'
    }
    if (path.startsWith('/platform/settings/emails')) {
      return mobileOptions.emailOpts[0]?.value ?? '/platform/settings/emails/velkomst-ny-bruger'
    }
    return '/platform/settings/public/kontakt'
  }, [location.pathname, mobileOptions])

  const pageMeta = useMemo(
    () => getPlatformSettingsPageMeta(location.pathname),
    [location.pathname],
  )

  useEffect(() => {
    document.title = `${pageMeta.title} · Bilago`
  }, [pageMeta.title])

  return (
    <div className="w-full max-w-none">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{pageMeta.title}</h1>
        <p className="mt-1 text-sm text-slate-600">{pageMeta.subtitle}</p>
      </div>

      <div className="mt-6 md:hidden">
        <label htmlFor="platform-settings-mobile-nav" className="text-xs font-medium text-slate-600">
          Undersektion
        </label>
        <select
          id="platform-settings-mobile-nav"
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm"
          value={selectValue}
          onChange={(e) => navigate(e.target.value)}
        >
          <optgroup label="Offentligt">
            {mobileOptions.publicOpts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="SMTP">
            {mobileOptions.smtpOpts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
          {mobileOptions.emailOpts.length > 0 ? (
            <optgroup label="E-mail skabeloner">
              {mobileOptions.emailOpts.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
      </div>

      <div className="mt-8">
        <Outlet />
      </div>
    </div>
  )
}
