/** SMTP-profil til faktura- og kundemails. */
export const TRANSACTIONAL_SMTP_PROFILE_ID = 'transactional' as const

/**
 * Ved udsendelse: brug `companies.name` som From-navn (ikke `platform_smtp_profiles.from_name`).
 */
export function invoiceMailFromName(companyName: string | null | undefined): string {
  const t = companyName?.trim()
  return t && t.length > 0 ? t : 'Faktura'
}
