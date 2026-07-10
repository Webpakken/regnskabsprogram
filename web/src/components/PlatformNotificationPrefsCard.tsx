import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppProvider'
import { NotificationToggleRow } from '@/components/NotificationToggleRow'
import type { Database } from '@/types/database'

type PrefRow = Database['public']['Tables']['notification_preferences']['Row']

// Alle til/fra-felter, så en upsert ikke nulstiller kundens øvrige valg.
const ALL_PREF_KEYS = [
  'support_replies',
  'member_invites',
  'invoice_sent',
  'invoice_reminders',
  'subscription_updates',
  'platform_new_companies',
  'platform_new_support',
  'platform_new_subscriptions',
] as const

type PrefKey = (typeof ALL_PREF_KEYS)[number]
type Prefs = Record<PrefKey, boolean>

const DEFAULT_PREFS: Prefs = {
  support_replies: true,
  member_invites: true,
  invoice_sent: true,
  invoice_reminders: true,
  subscription_updates: true,
  platform_new_companies: true,
  platform_new_support: true,
  platform_new_subscriptions: true,
}

// De platform-relevante notifikationer for ejer/staff.
const PLATFORM_ROWS: { id: PrefKey; title: string; body: string }[] = [
  {
    id: 'platform_new_companies',
    title: 'Nye virksomheder',
    body: 'Få besked når en ny virksomhed opretter sig på platformen.',
  },
  {
    id: 'platform_new_support',
    title: 'Nye support-sager',
    body: 'Få besked når en kunde skriver til support eller en chat eskaleres.',
  },
  {
    id: 'platform_new_subscriptions',
    title: 'Nye abonnementer',
    body: 'Få besked når en kunde starter et betalt abonnement.',
  },
]

/** Til/fra pr. platform-notifikationstype for ejer/staff. Auto-gemmer pr. toggle. */
export function PlatformNotificationPrefsCard() {
  const { user } = useApp()
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!user) {
        setLoading(false)
        return
      }
      const { data, error: loadErr } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()
      if (cancelled) return
      if (loadErr) setError(loadErr.message)
      const row = data as PrefRow | null
      setPrefs(row ? { ...DEFAULT_PREFS, ...pickPrefs(row) } : DEFAULT_PREFS)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [user])

  async function toggle(key: PrefKey, value: boolean) {
    if (!user) return
    const next = { ...prefs, [key]: value }
    setPrefs(next)
    setError(null)
    const { error: saveErr } = await supabase
      .from('notification_preferences')
      .upsert({ user_id: user.id, ...next })
    if (saveErr) {
      setError(saveErr.message)
      setPrefs((p) => ({ ...p, [key]: !value })) // rul tilbage ved fejl
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Notifikationstyper</h2>
        <p className="text-sm text-slate-600">Vælg hvad du vil have push om. Gemmes automatisk.</p>
      </div>
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      <div className="space-y-2">
        {PLATFORM_ROWS.map((r) => (
          <NotificationToggleRow
            key={r.id}
            id={r.id}
            title={r.title}
            body={r.body}
            checked={prefs[r.id]}
            disabled={loading}
            onChange={(next) => void toggle(r.id, next)}
          />
        ))}
      </div>
    </section>
  )
}

function pickPrefs(row: PrefRow): Partial<Prefs> {
  const out: Partial<Prefs> = {}
  for (const k of ALL_PREF_KEYS) {
    const v = (row as Record<string, unknown>)[k]
    if (typeof v === 'boolean') out[k] = v
  }
  return out
}
