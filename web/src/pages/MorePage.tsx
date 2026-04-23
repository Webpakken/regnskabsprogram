import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ROLE_LABELS, subscriptionOk, useApp } from '@/context/AppProvider'
import { redirectToStripeCheckout } from '@/lib/edge'
import { useSupportUnread } from '@/context/SupportUnreadContext'
import { AppCard, AppPageLayout } from '@/components/AppPageLayout'
import { logoutToLanding } from '@/lib/logoutToLanding'
import { trialStatusFor } from '@/lib/trial'
import { formatKrPerMonth } from '@/lib/format'
import { supabase } from '@/lib/supabase'

type IconProps = { className?: string }

function BankIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10 12 4l9 6" />
      <path d="M5 10v8M9 10v8M15 10v8M19 10v8" />
      <path d="M3 20h18" />
    </svg>
  )
}

function PercentIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 19 14-14" />
      <circle cx="7" cy="7" r="2.2" />
      <circle cx="17" cy="17" r="2.2" />
    </svg>
  )
}

function UsersIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <circle cx="17" cy="9" r="2.8" />
      <path d="M22 19a5 5 0 0 0-7.5-4.3" />
    </svg>
  )
}

function CogIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  )
}

function ChevronIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}

function BuildingIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="1.5" />
      <path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2M10 21v-3h4v3" />
    </svg>
  )
}

function LogoutIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
      <path d="m15 17 5-5-5-5" />
      <path d="M20 12H9" />
    </svg>
  )
}

function HelpIcon({ className }: IconProps) {
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

function ChatIcon({ className }: IconProps) {
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

function ListIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  )
}

const items = [
  { to: '/app/support', label: 'Support', icon: ChatIcon },
  { to: '/app/hjaelp', label: 'Hjælp & svar', icon: HelpIcon },
  { to: '/app/activity', label: 'Aktivitetslog', icon: ListIcon },
  { to: '/app/bank', label: 'Bank', icon: BankIcon },
  { to: '/app/vat', label: 'Moms', icon: PercentIcon },
  { to: '/app/members', label: 'Medlemmer', icon: UsersIcon },
  { to: '/app/settings', label: 'Indstillinger', icon: CogIcon },
]

export function MorePage() {
  const {
    currentCompany,
    currentRole,
    user,
    companies,
    setCurrentCompanyId,
    subscription,
  } = useApp()
  const ok = subscriptionOk(subscription)
  const trial = trialStatusFor(currentCompany)
  const trialActive = trial?.active === true
  const { unreadCount } = useSupportUnread()
  const navigate = useNavigate()

  const [priceCents, setPriceCents] = useState<number | null>(null)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data } = await supabase
        .from('platform_public_settings')
        .select('pricing_amount_cents, monthly_price_cents')
        .eq('id', 1)
        .maybeSingle()
      if (cancelled) return
      setPriceCents(data?.pricing_amount_cents ?? data?.monthly_price_cents ?? 9900)
    })()
    return () => {
      cancelled = true
    }
  }, [])
  const priceLabel = priceCents != null ? formatKrPerMonth(priceCents) : null

  async function logout() {
    await logoutToLanding(navigate)
  }

  return (
    <AppPageLayout maxWidth="3xl" className="space-y-6 pb-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Mere</h1>
        <p className="mt-1 text-sm text-slate-600">Genveje og konto</p>
      </div>

      {!ok && currentCompany ? (
        trialActive ? (
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-950 sm:flex sm:items-center sm:justify-between sm:gap-4 sm:px-5 sm:py-4">
            <div className="min-w-0">
              <p className="font-medium">
                Prøveperiode aktiv — {trial!.daysLeft} {trial!.daysLeft === 1 ? 'dag' : 'dage'} tilbage
              </p>
              <p className="mt-1 text-indigo-900/80">
                Tilføj kortoplysninger nu, så du fortsætter uden afbrydelse efter prøveperioden
                {priceLabel ? ` for ${priceLabel}` : ''}.
              </p>
            </div>
            <button
              type="button"
              className="mt-3 w-full shrink-0 rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 sm:mt-0 sm:w-auto sm:px-4"
              onClick={() => redirectToStripeCheckout(currentCompany.id)}
            >
              Tilføj kortoplysninger
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:flex sm:items-center sm:justify-between sm:gap-4 sm:px-5 sm:py-4">
            <div className="min-w-0">
              <p className="font-medium">Abonnement påkrævet for fuld adgang</p>
              {priceLabel ? (
                <p className="mt-1 text-amber-900/80">Pris: {priceLabel}</p>
              ) : null}
            </div>
            <button
              type="button"
              className="mt-3 w-full shrink-0 rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 sm:mt-0 sm:w-auto sm:px-4"
              onClick={() => redirectToStripeCheckout(currentCompany.id)}
            >
              Abonnér
            </button>
          </div>
        )
      ) : null}

      <AppCard noPadding>
        {companies.length > 1 ? (
          <div className="border-b border-slate-100 px-5 py-4 md:hidden">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Virksomhed
            </label>
            <select
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
              value={currentCompany?.id ?? ''}
              onChange={(e) => void setCurrentCompanyId(e.target.value)}
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {currentCompany ? (
          <Link
            to="/app/settings"
            className="flex items-center gap-4 border-b border-slate-100 px-5 py-4 transition hover:bg-slate-50/80"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <BuildingIcon className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-semibold text-slate-900">{currentCompany.name}</div>
              <div className="truncate text-xs text-slate-500">
                {currentCompany.cvr ? `CVR ${currentCompany.cvr} · ` : ''}
                {currentRole ? ROLE_LABELS[currentRole] : ''}
              </div>
            </div>
            <ChevronIcon className="h-4 w-4 shrink-0 text-slate-400" />
          </Link>
        ) : null}

        <ul className="divide-y divide-slate-100">
          {items.map((i) => (
            <li key={i.to}>
              <Link
                to={i.to}
                className="flex items-center gap-4 px-5 py-4 text-slate-800 transition hover:bg-slate-50/80"
              >
                <span className="relative inline-flex shrink-0">
                  <i.icon className="h-5 w-5 text-indigo-600" />
                  {i.to === '/app/support' && unreadCount > 0 ? (
                    <span className="absolute -right-2 -top-2 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white shadow-sm">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  ) : null}
                </span>
                <span className="flex-1 text-sm font-semibold">{i.label}</span>
                <ChevronIcon className="h-4 w-4 shrink-0 text-slate-400" />
              </Link>
            </li>
          ))}
        </ul>
      </AppCard>

      <AppCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-slate-400">Logget ind som</div>
            <div className="mt-1 truncate text-sm font-medium text-slate-900">{user?.email}</div>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <LogoutIcon className="h-4 w-4" />
            Log ud
          </button>
        </div>
        {priceLabel ? (
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
            <span className="text-xs uppercase tracking-wide text-slate-400">Abonnement</span>
            <span className="text-sm font-semibold text-slate-900">{priceLabel}</span>
          </div>
        ) : null}
      </AppCard>
    </AppPageLayout>
  )
}
