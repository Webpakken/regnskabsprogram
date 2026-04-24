import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppProvider'

export type PlatformNotifKind = 'company' | 'subscription' | 'support'
export type PlatformSeenKind = 'companies' | 'subscriptions' | 'support' | 'all'

export type PlatformNotifEvent = {
  kind: PlatformNotifKind
  ref_id: string
  label: string
  sublabel: string | null
  occurred_at: string
}

export type PlatformNotifCounts = {
  companies: number
  subscriptions: number
  support: number
  total: number
}

type Ctx = {
  counts: PlatformNotifCounts
  events: PlatformNotifEvent[]
  loading: boolean
  refresh: () => Promise<void>
  markSeen: (kind: PlatformSeenKind) => Promise<void>
}

const ZERO: PlatformNotifCounts = {
  companies: 0,
  subscriptions: 0,
  support: 0,
  total: 0,
}

const Context = createContext<Ctx | null>(null)

const POLL_MS = 30_000

export function PlatformAdminNotificationsProvider({
  children,
}: {
  children: ReactNode
}) {
  const { platformRole } = useApp()
  const isStaff = platformRole !== null
  const [counts, setCounts] = useState<PlatformNotifCounts>(ZERO)
  const [events, setEvents] = useState<PlatformNotifEvent[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!isStaff) {
      setCounts(ZERO)
      setEvents([])
      return
    }
    setLoading(true)
    const [countsRes, eventsRes] = await Promise.all([
      supabase.rpc('platform_admin_unread_counts'),
      supabase.rpc('platform_admin_recent_events', { p_limit: 8 }),
    ])
    setLoading(false)
    if (!countsRes.error && Array.isArray(countsRes.data) && countsRes.data[0]) {
      const row = countsRes.data[0] as {
        companies_count: number | null
        subscriptions_count: number | null
        support_count: number | null
      }
      const c = Number(row.companies_count ?? 0)
      const s = Number(row.subscriptions_count ?? 0)
      const sup = Number(row.support_count ?? 0)
      setCounts({ companies: c, subscriptions: s, support: sup, total: c + s + sup })
    }
    if (!eventsRes.error && Array.isArray(eventsRes.data)) {
      setEvents(eventsRes.data as PlatformNotifEvent[])
    }
  }, [isStaff])

  const markSeen = useCallback(
    async (kind: PlatformSeenKind) => {
      if (!isStaff) return
      await supabase.rpc('platform_admin_mark_seen', { p_kind: kind })
      await refresh()
    },
    [isStaff, refresh],
  )

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!isStaff) return
    const id = window.setInterval(() => void refresh(), POLL_MS)
    return () => window.clearInterval(id)
  }, [isStaff, refresh])

  // Realtime: refresh hurtigere når der kommer en kundebesked.
  useEffect(() => {
    if (!isStaff) return
    const channel = supabase
      .channel('platform-admin-notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'support_messages' },
        () => void refresh(),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [isStaff, refresh])

  const value = useMemo<Ctx>(
    () => ({ counts, events, loading, refresh, markSeen }),
    [counts, events, loading, refresh, markSeen],
  )

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function usePlatformAdminNotifications(): Ctx {
  const ctx = useContext(Context)
  if (!ctx) {
    throw new Error(
      'usePlatformAdminNotifications uden PlatformAdminNotificationsProvider',
    )
  }
  return ctx
}
