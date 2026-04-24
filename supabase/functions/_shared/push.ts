export function normalizeVapidSubject(raw?: string | null) {
  const value = raw?.trim()
  if (!value) return 'mailto:support@bilago.dk'
  if (value.includes(':')) return value
  if (value.includes('@')) return `mailto:${value}`
  return value
}
