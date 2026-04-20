import { useState, type ReactElement } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import clsx from 'clsx'

type IconProps = { className?: string }

function HomeIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 11 9-7 9 7" />
      <path d="M5 10v10h14V10" />
    </svg>
  )
}

function InvoiceIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h6" />
    </svg>
  )
}

function ReceiptIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 3v18l2-1 2 1 2-1 2 1 2-1 2 1 2-1V3z" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </svg>
  )
}

function MoreIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="12" r="0.5" />
      <circle cx="12" cy="12" r="0.5" />
      <circle cx="19" cy="12" r="0.5" />
    </svg>
  )
}

function PlusIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function CameraIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  )
}

function DocumentAddIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" />
      <path d="M14 2v6h6" />
      <path d="M12 12v6M9 15h6" />
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

const tabs = [
  { to: '/app/dashboard', label: 'Overblik', icon: HomeIcon },
  { to: '/app/invoices', label: 'Fakturaer', icon: InvoiceIcon },
  { to: '/app/vouchers', label: 'Bilag', icon: ReceiptIcon },
  { to: '/app/more', label: 'Mere', icon: MoreIcon },
]

export function MobileBottomNav() {
  const [sheetOpen, setSheetOpen] = useState(false)
  const navigate = useNavigate()

  function go(path: string) {
    setSheetOpen(false)
    navigate(path)
  }

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 md:hidden">
        <nav
          className="pointer-events-auto relative flex items-stretch border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
          aria-label="Hovedmenu"
        >
          {tabs.slice(0, 2).map((t) => (
            <TabLink key={t.to} to={t.to} label={t.label} Icon={t.icon} />
          ))}
          <div className="flex w-16 shrink-0 items-center justify-center" />
          {tabs.slice(2).map((t) => (
            <TabLink key={t.to} to={t.to} label={t.label} Icon={t.icon} />
          ))}
        </nav>

        <button
          type="button"
          aria-label="Hurtig handling"
          onClick={() => setSheetOpen(true)}
          className="pointer-events-auto absolute left-1/2 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-300/50 ring-4 ring-white transition active:scale-95"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 18px)' }}
        >
          <PlusIcon className="h-6 w-6" />
        </button>
      </div>

      {sheetOpen ? (
        <div
          className="fixed inset-0 z-40 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Hurtige handlinger"
        >
          <button
            type="button"
            aria-label="Luk"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setSheetOpen(false)}
          />
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] shadow-2xl"
          >
            <div className="mx-auto h-1 w-10 rounded-full bg-slate-200" />
            <h2 className="mt-4 text-center text-sm font-semibold text-slate-900">
              Ny handling
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <SheetTile
                Icon={CameraIcon}
                label="Scan bilag"
                onClick={() => go('/app/vouchers/scan')}
              />
              <SheetTile
                Icon={DocumentAddIcon}
                label="Ny faktura"
                onClick={() => go('/app/invoices/new')}
              />
            </div>
            <div className="mt-3 grid gap-2">
              <SheetRow
                Icon={PercentIcon}
                label="Moms-rapport"
                onClick={() => go('/app/vat')}
              />
              <SheetRow
                Icon={UsersIcon}
                label="Inviter medlem"
                onClick={() => go('/app/members')}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

function TabLink({
  to,
  label,
  Icon,
}: {
  to: string
  label: string
  Icon: (p: IconProps) => ReactElement
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        clsx(
          'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium',
          isActive ? 'text-indigo-700' : 'text-slate-500',
        )
      }
    >
      <Icon className="h-5 w-5" />
      <span>{label}</span>
    </NavLink>
  )
}

function SheetTile({
  Icon,
  label,
  onClick,
}: {
  Icon: (p: IconProps) => ReactElement
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-indigo-700 transition active:scale-[0.98]"
    >
      <Icon className="h-6 w-6" />
      <span className="text-sm font-semibold">{label}</span>
    </button>
  )
}

function SheetRow({
  Icon,
  label,
  onClick,
}: {
  Icon: (p: IconProps) => ReactElement
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left text-indigo-700 transition active:scale-[0.99]"
    >
      <Icon className="h-5 w-5" />
      <span className="text-sm font-semibold">{label}</span>
    </button>
  )
}
