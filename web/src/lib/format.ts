export function formatDkk(cents: number, currency = 'DKK') {
  return new Intl.NumberFormat('da-DK', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100)
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat('da-DK', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso))
}

export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat('da-DK', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso))
}

/** Dato uden klokkeslæt; `YYYY-MM-DD` tolkes som kalenderdag (undgår UTC-midnat → forkert tid). */
export function formatDateOnly(iso: string) {
  const d = iso.slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return new Intl.DateTimeFormat('da-DK', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(`${d}T12:00:00`))
  }
  return formatDate(iso)
}
