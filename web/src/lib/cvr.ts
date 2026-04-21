/** Danske CVR: 8 cifre. Returnerer kun cifre eller null hvis tomt/ugyldigt. */
export function normalizeCvrDigits(input: string): string | null {
  const digits = input.replace(/\D/g, '')
  if (digits.length === 0) return null
  return digits
}

export function isValidDkCvr(digits: string | null): boolean {
  if (!digits) return true
  return /^\d{8}$/.test(digits)
}

/** Kort fejltekst hvis brugeren har indtastet noget, men ikke præcis 8 cifre. */
export function cvrValidationHint(digits: string | null, hadInput: boolean): string | null {
  if (!hadInput) return null
  if (!digits) return null
  if (digits.length !== 8) return 'CVR skal være præcis 8 cifre (eller lad feltet være tomt).'
  return null
}

export function isPostgresUniqueViolation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  if (err.code === '23505') return true
  return /duplicate key|unique constraint/i.test(err.message ?? '')
}
