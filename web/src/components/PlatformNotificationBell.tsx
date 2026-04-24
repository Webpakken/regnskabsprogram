import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import {
  usePlatformAdminNotifications,
  type PlatformNotifEvent,
} from '@/hooks/usePlatformAdminNotifications'

function BellIcon({ className }: { className?: string }) {
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
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </svg>
  )
}

function CompanyIcon({ className }: { className?: string }) {
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
      <rect x="4" y="3" width="16" height="18" rx="1.5" />
      <path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2M10 21v-3h4v3" />
    </svg>
  )
}

function CardIcon({ className }: { className?: string }) {
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
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
    </svg>
  )
}

function ChatIcon({ className }: { className?: string }) {
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
    </svg>
  )
}

function relativeTimeDa(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return ''
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'lige nu'
  if (min < 60) return `${min} min siden`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} t siden`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d} dag${d === 1 ? '' : 'e'} siden`
  return new Date(iso).toLocaleDateString('da-DK', {
    day: 'numeric',
    month: 'short',
  })
}

function pathForEvent(ev: PlatformNotifEvent): string {
  switch (ev.kind) {
    case 'company':
      return '/platform/companies'
    case 'subscription':
      return '/platform/companies'
    case 'support':
      return '/platform/support'
  }
}

function iconForEvent(ev: PlatformNotifEvent) {
  switch (ev.kind) {
    case 'company':
      return CompanyIcon
    case 'subscription':
      return CardIcon
    case 'support':
      return ChatIcon
  }
}

export function PlatformNotificationBell({
  variant = 'sidebar',
}: {
  variant?: 'sidebar' | 'mobile'
}) {
  const { counts, events, markSeen } = usePlatformAdminNotifications()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const total = counts.total
  const isSidebar = variant === 'sidebar'

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={total > 0 ? `${total} nye notifikationer` : 'Notifikationer'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          'relative inline-flex h-9 w-9 items-center justify-center rounded-lg transition',
          isSidebar
            ? 'text-slate-300 hover:bg-slate-800 hover:text-white'
            : 'text-slate-700 hover:bg-slate-100',
        )}
      >
        <BellIcon className="h-5 w-5" />
        {total > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white shadow-sm">
            {total > 99 ? '99+' : total}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Notifikationer"
          className={clsx(
            'absolute z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl',
            isSidebar ? 'left-0' : 'right-0',
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <span className="text-sm font-semibold">Notifikationer</span>
            {total > 0 ? (
              <button
                type="button"
                onClick={() => void markSeen('all')}
                className="rounded-md px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
              >
                Marker alt som læst
              </button>
            ) : null}
          </div>

          <div className="grid grid-cols-3 gap-px bg-slate-100">
            <SummaryTile
              icon={<CompanyIcon className="h-4 w-4 text-indigo-600" />}
              label="Virksomheder"
              count={counts.companies}
            />
            <SummaryTile
              icon={<CardIcon className="h-4 w-4 text-emerald-600" />}
              label="Betalinger"
              count={counts.subscriptions}
            />
            <SummaryTile
              icon={<ChatIcon className="h-4 w-4 text-rose-600" />}
              label="Support"
              count={counts.support}
            />
          </div>

          <div className="max-h-80 overflow-y-auto">
            {events.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">
                Ingen aktivitet endnu.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {events.map((ev) => {
                  const Icon = iconForEvent(ev)
                  return (
                    <li key={`${ev.kind}-${ev.ref_id}-${ev.occurred_at}`}>
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false)
                          navigate(pathForEvent(ev))
                        }}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50"
                      >
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-900">
                            {ev.label}
                          </span>
                          {ev.sublabel ? (
                            <span className="block truncate text-xs text-slate-500">
                              {ev.sublabel}
                            </span>
                          ) : null}
                          <span className="mt-0.5 block text-[11px] text-slate-400">
                            {relativeTimeDa(ev.occurred_at)}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function SummaryTile({
  icon,
  label,
  count,
}: {
  icon: React.ReactNode
  label: string
  count: number
}) {
  return (
    <div className="bg-white px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold text-slate-900">{count}</div>
    </div>
  )
}
