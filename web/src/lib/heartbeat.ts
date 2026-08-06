import { supabase } from '@/lib/supabase'

// Nøglen er pr. bruger: ellers ville en anden brugers heartbeat på samme enhed
// (fx ejer → revisor kort efter) throttle den nye bruger, så vedkommende stod
// som «Ingen aktivitet endnu» i op til 10 minutter.
const storageKeyFor = (userId: string) => `bilago:last_heartbeat:${userId}`
// Skriv højst ét heartbeat pr. 10 min pr. bruger/enhed — nok til "Sidste aktivitet"
// uden at spamme databasen ved hver navigation/tab-focus.
const THROTTLE_MS = 10 * 60 * 1000

/**
 * Opdaterer profiles.last_seen_at for den indloggede bruger, så login og
 * almindelig brug tæller som aktivitet på Medlemmer-siden. Fire-and-forget og
 * throttled via localStorage; må ikke blokere app-loadet.
 */
export function recordHeartbeat(userId: string): void {
  if (!userId) return
  const storageKey = storageKeyFor(userId)
  let stamped = false
  try {
    if (typeof window !== 'undefined') {
      const last = window.localStorage.getItem(storageKey)
      if (last && Date.now() - Number(last) < THROTTLE_MS) return
      window.localStorage.setItem(storageKey, String(Date.now()))
      stamped = true
    }
  } catch {
    // localStorage utilgængelig (fx privat tilstand) — skriv heartbeat alligevel.
  }
  // .then() er nødvendig: supabase-builderen er lazy og sender først requesten
  // når den awaites/thenes — uden dette blev last_seen_at aldrig skrevet.
  void supabase
    .from('profiles')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', userId)
    .then(({ error }) => {
      if (!error) return
      // Fjern throttle-stemplet så næste app-load prøver igen i stedet for at
      // vente 10 min på et heartbeat der aldrig kom igennem.
      if (stamped) {
        try {
          window.localStorage.removeItem(storageKey)
        } catch {
          // ignoreres
        }
      }
      console.warn('Kunne ikke opdatere last_seen_at', error)
    })
}
