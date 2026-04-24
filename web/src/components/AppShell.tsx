import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { useApp, subscriptionOk } from '@/context/AppProvider'
import { redirectToStripeCheckout } from '@/lib/edge'
import { logoutToLanding } from '@/lib/logoutToLanding'
import { supabase } from '@/lib/supabase'
import { BrandMark } from '@/components/BrandMark'
import { formatDateTime } from '@/lib/format'
import {
  getHideTrialBannerDuringTrial,
  setHideTrialBannerDuringTrial,
} from '@/lib/trialPaymentUiPreference'
import { MobileBottomNav } from '@/components/MobileBottomNav'
import { RegisterPushNotifications } from '@/components/RegisterPushNotifications'
import { useSupportUnread } from '@/context/SupportUnreadContext'
import { TrialCountdownBanner } from '@/components/TrialCountdownBanner'
import { TrialExpiredModal } from '@/components/TrialExpiredModal'
import { trialStatusFor } from '@/lib/trial'

type NavIconProps = { className?: string }

const nav = [
  { to: '/app/dashboard', label: 'Oversigt', icon: HomeIcon },
  { to: '/app/invoices', label: 'Fakturaer', icon: InvoiceIcon },
  { to: '/app/vouchers', label: 'Bilag', icon: ReceiptIcon },
  { to: '/app/bank', label: 'Bank', icon: BankIcon },
  { to: '/app/vat', label: 'Moms', icon: PercentIcon },
  { to: '/app/hjaelp', label: 'Hjælp & svar', icon: HelpIcon },
  { to: '/app/members', label: 'Medlemmer', icon: UsersIcon },
  { to: '/app/settings', label: 'Indstillinger', icon: CogIcon },
  { to: '/app/support', label: 'Support', icon: ChatIcon },
]

function HelpIcon({ className }: NavIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 2-3 4" />
      <path d="M12 17h.01" />
    </svg>
  )
}

function ChatIcon({ className }: NavIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
      <circle cx="8" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="12" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  )
}

function HomeIcon({ className }: NavIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 11 9-7 9 7" />
      <path d="M5 10v10h14V10" />
    </svg>
  )
}

function InvoiceIcon({ className }: NavIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h6" />
    </svg>
  )
}

function ReceiptIcon({ className }: NavIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 3v18l2-1 2 1 2-1 2 1 2-1 2 1 2-1V3z" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </svg>
  )
}

function BankIcon({ className }: NavIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10 12 4l9 6" />
      <path d="M5 10v8M9 10v8M15 10v8M19 10v8" />
      <path d="M3 20h18" />
    </svg>
  )
}

function PercentIcon({ className }: NavIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 19 14-14" />
      <circle cx="7" cy="7" r="2.2" />
      <circle cx="17" cy="17" r="2.2" />
    </svg>
  )
}

function UsersIcon({ className }: NavIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <circle cx="17" cy="9" r="2.8" />
      <path d="M22 19a5 5 0 0 0-7.5-4.3" />
    </svg>
  )
}

function CogIcon({ className }: NavIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  )
}

function NavBadge({ count }: { count: number }) {
  if (count <= 0) return null
  const label = count > 99 ? '99+' : String(count)
  return (
    <span className="absolute -right-2 -top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-600 px-0.5 text-[10px] font-bold leading-none text-white shadow-sm">
      {label}
    </span>
  )
}

export function AppShell({ children }: { children?: ReactNode }) {
  const { unreadCount } = useSupportUnread()
  const {
    user,
    companies,
    currentCompany,
    subscription,
    setCurrentCompanyId,
    impersonation,
    platformRole,
    tenantCompanyCount,
    refresh,
  } = useApp()
  const navigate = useNavigate()
  const ok = subscriptionOk(subscription)

  async function logout() {
    await logoutToLanding(navigate)
  }

  async function endImpersonation() {
    const { error: rpcErr } = await supabase.rpc('end_platform_impersonation')
    if (rpcErr) return
    await refresh()
    navigate(
      tenantCompanyCount > 0 ? '/app/dashboard' : '/platform/dashboard',
    )
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <RegisterPushNotifications />
      <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="border-b border-slate-100 px-4 py-5">
          <div className="flex items-center gap-3">
            <BrandMark />
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Bilago
              </div>
              <div className="mt-1 text-lg font-semibold text-slate-900">
                Regnskab
              </div>
            </div>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-3">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-50',
                )
              }
            >
              <span className="relative inline-flex shrink-0">
                <item.icon className="h-4 w-4" />
                {item.to === '/app/support' ? <NavBadge count={unreadCount} /> : null}
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-100 p-3 text-xs text-slate-500">
          {user?.email}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="hidden items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3.5 md:flex md:px-10">
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
            {!ok && currentCompany && !trialStatusFor(currentCompany)?.active && (
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
                onClick={() => redirectToStripeCheckout(currentCompany.id)}
              >
                {trialStatusFor(currentCompany)?.active ? 'Tilføj kortoplysninger' : 'Abonnér'}
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

        {impersonation && currentCompany && platformRole ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-5 py-3.5 text-sm text-amber-950 md:px-10">
            <span>
              <strong>Impersonation:</strong> du ser som{' '}
              <strong>{currentCompany.name}</strong> (udløber{' '}
              {formatDateTime(impersonation.expiresAt)}).
            </span>
            <button
              type="button"
              onClick={() => void endImpersonation()}
              className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-950 hover:bg-amber-100"
            >
              Afslut
            </button>
          </div>
        ) : null}

        {(() => {
          if (!currentCompany) return null
          const trial = trialStatusFor(currentCompany)
          // Aktiv Stripe-subscription → ingen banner.
          if (ok) {
            if (subscription?.status === 'trialing') {
              return (
                <TrialBanner
                  periodEnd={subscription.current_period_end}
                  companyId={currentCompany.id}
                />
              )
            }
            return null
          }
          // Ingen subscription men custom-trial stadig aktiv → vis nedtælling de sidste dage.
          if (trial?.active) {
            return <TrialCountdownBanner company={currentCompany} />
          }
          // Trial udløbet og ingen subscription → permanent "Prøveperiode slut"-banner.
          return (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-5 py-3.5 text-sm text-amber-900 md:px-10">
              <span className="min-w-0 flex-1">
                <strong className="font-semibold">Din prøveperiode er slut.</strong>
                <span className="ml-1 text-amber-800">
                  Aktivér dit abonnement for at oprette fakturaer, bilag og bruge banken igen.
                </span>
              </span>
              <button
                type="button"
                className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                onClick={() => redirectToStripeCheckout(currentCompany.id)}
              >
                Start abonnement
              </button>
            </div>
          )
        })()}
        {currentCompany && !ok && trialStatusFor(currentCompany)?.expired ? (
          <TrialExpiredModal company={currentCompany} />
        ) : null}

        <main className="flex min-h-0 flex-1 flex-col px-5 pb-28 pt-5 md:px-10 md:pb-8 md:pt-9">
          {children ?? <Outlet />}
        </main>
      </div>

      <MobileBottomNav />
    </div>
  )
}

function TrialBanner({
  periodEnd,
  companyId,
}: {
  periodEnd: string | null
  companyId: string
}) {
  const [, setPrefTick] = useState(0)
  const [daysLeft, setDaysLeft] = useState<number | null>(null)

  useEffect(() => {
    const bump = () => setPrefTick((n) => n + 1)
    window.addEventListener('storage', bump)
    window.addEventListener('bilago:trial-banner-pref', bump)
    return () => {
      window.removeEventListener('storage', bump)
      window.removeEventListener('bilago:trial-banner-pref', bump)
    }
  }, [])

  useEffect(() => {
    if (!periodEnd) {
      queueMicrotask(() => setDaysLeft(null))
      return
    }
    const compute = () =>
      Math.max(0, Math.ceil((new Date(periodEnd).getTime() - Date.now()) / 86_400_000))
    queueMicrotask(() => setDaysLeft(compute()))
    const id = window.setInterval(() => setDaysLeft(compute()), 60_000)
    return () => window.clearInterval(id)
  }, [periodEnd])

  /** Under sidste dag (0 tilbage) eller ukendt slutdato: banner vises altid. */
  const canDismissBanner = daysLeft !== null && daysLeft > 0
  const bannerHiddenByPref =
    getHideTrialBannerDuringTrial() && canDismissBanner

  if (bannerHiddenByPref) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-100 bg-indigo-50 px-5 py-4 text-sm text-indigo-900 md:px-10 md:py-4">
      <span className="min-w-0 flex-1">
        Gratis prøveperiode
        {daysLeft !== null ? ` — ${daysLeft} ${daysLeft === 1 ? 'dag' : 'dage'} tilbage` : null}
        . Tilføj betaling for at fortsætte efter perioden slutter.
      </span>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        {canDismissBanner ? (
          <button
            type="button"
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-indigo-800 hover:bg-indigo-100/80"
            onClick={() => setHideTrialBannerDuringTrial(true)}
          >
            Skjul banner
          </button>
        ) : null}
        <button
          type="button"
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
          onClick={() => redirectToStripeCheckout(companyId)}
        >
          Tilføj betaling
        </button>
      </div>
    </div>
  )
}
