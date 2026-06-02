import { supabase } from '@/lib/supabase'

const STORAGE_KEY = 'bilago:last_heartbeat'
// Skriv højst ét heartbeat pr. 10 min pr. enhed — nok til "Sidste aktivitet"
// uden at spamme databasen ved hver navigation/tab-focus.
const THROTTLE_MS = 10 * 60 * 1000

/**
 * Opdaterer profiles.last_seen_at for den indloggede bruger, så login og
 * almindelig brug tæller som aktivitet på Medlemmer-siden. Fire-and-forget og
 * throttled via localStorage; må ikke blokere app-loadet.
 */
export function recordHeartbeat(userId: string): void {
  if (!userId) return
  try {
    if (typeof window !== 'undefined') {
      const last = window.localStorage.getItem(STORAGE_KEY)
      if (last && Date.now() - Number(last) < THROTTLE_MS) return
      window.localStorage.setItem(STORAGE_KEY, String(Date.now()))
    }
  } catch {
    // localStorage utilgængelig (fx privat tilstand) — skriv heartbeat alligevel.
  }
  void supabase
    .from('profiles')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', userId)
}
