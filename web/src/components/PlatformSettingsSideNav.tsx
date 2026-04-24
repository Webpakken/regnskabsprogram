import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import clsx from 'clsx'
import { useApp } from '@/context/AppProvider'
import {
  EMAIL_TEMPLATE_NAV,
  BILLING_SETTINGS_LINKS,
  PUBLIC_SETTINGS_LINKS,
  SMTP_PROFILE_IDS,
  SMTP_SIDEBAR_LABELS,
} from '@/lib/platformSettingsNav'

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={clsx('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function PlatformSettingsSideNav() {
  const location = useLocation()
  const { platformRole } = useApp()
  const onSettings = location.pathname.startsWith('/platform/settings')
  /** Undermenu synlig på andre platform-sider, når brugeren har foldet den ud manuelt */
  const [peekOpen, setPeekOpen] = useState(false)
  /** På indstillingssider: altid udvidet, så navigation mellem undersider ikke skjuler menuen */
  const expanded = onSettings || peekOpen

  useEffect(() => {
    if (onSettings) setPeekOpen(false)
  }, [onSettings])

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    clsx(
      'block rounded-lg px-3 py-1.5 text-sm transition',
      isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800/80 hover:text-white',
    )

  const subLabel = 'px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 first:pt-1'

  return (
    <div className="border-b border-slate-800 pb-2">
      <button
        type="button"
        onClick={() => {
          if (onSettings) return
          setPeekOpen((v) => !v)
        }}
        className={clsx(
          'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition',
          onSettings
            ? 'cursor-default bg-slate-800 text-white'
            : 'text-slate-400 hover:bg-slate-800/80 hover:text-white',
        )}
        aria-expanded={expanded}
        title={onSettings ? undefined : 'Fold ud eller ind'}
      >
        Indstillinger
        <Chevron open={expanded} />
      </button>
      {expanded ? (
        <div className="mt-1 space-y-0.5 border-l border-slate-700/80 pl-2 ml-2">
          <div className={subLabel}>Offentligt</div>
          {PUBLIC_SETTINGS_LINKS.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkClass} end>
              {item.label}
            </NavLink>
          ))}

          {platformRole === 'superadmin' ? (
            <>
              <div className={subLabel}>Abonnement</div>
              {BILLING_SETTINGS_LINKS.map((item) => (
                <NavLink key={item.to} to={item.to} className={linkClass} end>
                  {item.label}
                </NavLink>
              ))}
            </>
          ) : null}

          <div className={subLabel}>SMTP</div>
          {SMTP_PROFILE_IDS.map((id) => (
            <NavLink
              key={id}
              to={`/platform/settings/smtp/${id}`}
              className={linkClass}
              end
            >
              {SMTP_SIDEBAR_LABELS[id]}
            </NavLink>
          ))}

          {platformRole === 'superadmin' ? (
            <>
              <div className={subLabel}>E-mail skabeloner</div>
              {EMAIL_TEMPLATE_NAV.map((item) => (
                <NavLink
                  key={item.slug}
                  to={`/platform/settings/emails/${item.slug}`}
                  className={linkClass}
                  end
                >
                  {item.label}
                </NavLink>
              ))}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
