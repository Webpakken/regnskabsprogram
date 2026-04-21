import type { NavigateFunction } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

/**
 * Log ud og land på forsiden. Skal gå til /?forside=1 før signOut, ellers sender
 * LandingPage stadig loggede brugere til /home; efter signOut ryddes query.
 */
export async function logoutToLanding(navigate: NavigateFunction) {
  navigate('/?forside=1', { replace: true })
  await supabase.auth.signOut()
  navigate('/', { replace: true })
}
