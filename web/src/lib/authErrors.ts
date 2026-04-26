/**
 * Oversæt Supabase auth-fejlbeskeder til dansk.
 * Supabase returnerer engelsk tekst i `error.message`; vi mapper de mest almindelige
 * varianter til brugervenlige danske tekster og falder ellers tilbage til originalen.
 */
export function translateAuthErrorDa(message: string | null | undefined): string {
  if (!message) return 'Ukendt fejl. Prøv igen.'
  const lower = message.toLowerCase()

  if (lower.includes('invalid login') || lower.includes('invalid credentials')) {
    return 'E-mail eller adgangskode er forkert. Tjek begge dele eller brug "Glemt adgangskode?".'
  }
  if (lower.includes('email not confirmed')) {
    return 'Din e-mail er ikke bekræftet endnu. Tjek din indbakke for bekræftelseslinket.'
  }
  if (lower.includes('user already registered') || lower.includes('already exists')) {
    return 'Der findes allerede en konto med denne e-mail.'
  }
  if (lower.includes('rate limit')) {
    return 'For mange forsøg lige nu. Prøv igen om lidt.'
  }
  if (lower.includes('password should be at least') || lower.includes('password is too short')) {
    return 'Adgangskoden er for kort.'
  }
  if (lower.includes('new password should be different')) {
    return 'Den nye adgangskode skal være forskellig fra den gamle.'
  }
  if (lower.includes('user not found')) {
    return 'Der findes ingen konto med denne e-mail.'
  }
  if (lower.includes('token has expired') || lower.includes('invalid token')) {
    return 'Linket er udløbet eller ugyldigt. Bed om et nyt link.'
  }
  if (lower.includes('network') || lower.includes('failed to fetch')) {
    return 'Kunne ikke kontakte serveren. Tjek din internetforbindelse.'
  }
  return message
}
