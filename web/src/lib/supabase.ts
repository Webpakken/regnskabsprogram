import { createClient } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const anon = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

/** Sandt når begge er sat — ellers virker auth/database ikke (typisk glemt env på hosting). */
export const isSupabaseConfigured = Boolean(url && anon)

if (!isSupabaseConfigured) {
  console.warn(
    'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY mangler — sæt dem i hosting (samme som .env.local).',
  )
}

export const supabase = createClient(url ?? '', anon ?? '')
