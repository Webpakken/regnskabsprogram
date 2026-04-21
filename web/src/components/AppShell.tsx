import type { ReactNode } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { useApp, subscriptionOk } from '@/context/AppProvider'
import { startStripeCheckout } from '@/lib/edge'
import { supabase } from '@/lib/supabase'
import { MobileBottomNav } from '@/components/MobileBottomNav'

type NavIconProps = { className?: string }

const nav = [
  { to: '/app/dashboard', label: 'Oversigt', icon: HomeIcon },
  { to: '/app/invoices', label: 'Fakturaer', icon: InvoiceIcon },
  { to: '/app/vouchers', label: 'Bilag', icon: ReceiptIcon },
  { to: '/app/bank', label: 'Bank', icon: BankIcon },
  { to: '/app/vat', label: 'Moms', icon: PercentIcon },
  { to: '/app/members', label: 'Medlemmer', icon: UsersIcon },
  { to: '/app/settings', label: 'Indstillinger', icon: CogIcon },
  { to: '/app/support', label: 'Support', icon: ChatIcon },
]

function ChatIcon({ className }: NavIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a8 8 0 0 1-8 8H9l-4 3v-3H7a8 8 0 0 1-8-8 8 8 0 0 1 16 0Z" />
      <path d="M8 10h.01M12 10h.01M16 10h.01" />
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

export function AppShell({ children }: { children?: ReactNode }) {
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
    await supabase.auth.signOut()
    navigate('/')
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
      <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="border-b border-slate-100 px-4 py-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Bilago
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
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-50',
                )
              }
            >
              <item.icon className="h-4 w-4" />
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

        {impersonation && currentCompany && platformRole ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <span>
              <strong>Impersonation:</strong> du ser som{' '}
              <strong>{currentCompany.name}</strong> (udløber{' '}
              {new Date(impersonation.expiresAt).toLocaleString('da-DK')}).
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

        {!ok && currentCompany ? (
          <div className="border-b border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Aktivér dit månedsabonnement for at bruge Bilago. Data er isoleret per
            virksomhed (CVR kan tilføjes under Indstillinger).
          </div>
        ) : subscription?.status === 'trialing' && currentCompany ? (
          <TrialBanner
            periodEnd={subscription.current_period_end}
            companyId={currentCompany.id}
          />
        ) : null}

        <main className="flex-1 px-4 pb-28 pt-6 md:px-8 md:pb-6">
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
  const daysLeft = periodEnd
    ? Math.max(0, Math.ceil((new Date(periodEnd).getTime() - Date.now()) / 86_400_000))
    : null

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
      <span>
        Gratis prøveperiode
        {daysLeft !== null ? ` — ${daysLeft} ${daysLeft === 1 ? 'dag' : 'dage'} tilbage` : null}
        . Tilføj betaling for at fortsætte efter perioden slutter.
      </span>
      <button
        type="button"
        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
        onClick={() =>
          void startStripeCheckout(companyId).then((url) => {
            window.location.href = url
          })
        }
      >
        Tilføj betaling
      </button>
    </div>
  )
}
