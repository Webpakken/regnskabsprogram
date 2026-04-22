/** Dansk tids — samme oplevelse uanset brugerens browser. */
export const APP_TIMEZONE = 'Europe/Copenhagen' as const

const dk = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('da-DK', { timeZone: APP_TIMEZONE, ...opts })

/** Dato (YYYY-MM-DD) i København for et tidspunkt (standard: nu). */
export function copenhagenYmd(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/** Nuværende kalenderår i København. */
export function copenhagenYear(d: Date = new Date()): number {
  return parseInt(copenhagenYmd(d).slice(0, 4), 10)
}

/** Nuværende YYYY-MM i København (moms-«denne måned»). */
export function copenhagenYearMonth(d: Date = new Date()): string {
  return copenhagenYmd(d).slice(0, 7)
}

/**
 * Sidste n kalenderdage inkl. i dag, som YYYY-MM-DD (København),
 * bruges bl.a. til faktura-oversigt og grafer.
 */
export function copenhagenLastNDaysInclusive(n: number): { from: string; to: string } {
  const to = copenhagenYmd()
  const [y, m, d] = to.split('-').map(Number)
  const toNoon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  const fromNoon = new Date(toNoon)
  fromNoon.setUTCDate(fromNoon.getUTCDate() - (n - 1))
  const from = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(fromNoon)
  return { from, to }
}

/** Alle YYYY-MM-DD fra from til to (inkl.) i rækkefølge, baseret på CPH-midddags-instanter. */
export function eachCopenhagenYmdInRange(from: string, to: string): string[] {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  let cur = new Date(Date.UTC(fy, fm - 1, fd, 12, 0, 0))
  const end = new Date(Date.UTC(ty, tm - 1, td, 12, 0, 0))
  const out: string[] = []
  while (cur <= end) {
    out.push(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: APP_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(cur),
    )
    cur = new Date(cur)
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return out
}

function parseForDisplay(iso: string): Date {
  const d = iso.slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(d) && iso.length <= 10) {
    const [y, m, day] = d.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, day, 12, 0, 0))
  }
  return new Date(iso)
}

export function formatDkk(cents: number, currency = 'DKK') {
  return new Intl.NumberFormat('da-DK', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100)
}

/** Marketing: 9900 → «99 kr./md» */
export function formatKrPerMonth(cents: number): string {
  const kr = Math.round(cents / 100)
  return `${kr} kr./md`
}

export function formatDate(iso: string) {
  return dk({
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(parseForDisplay(iso))
}

export function formatDateTime(iso: string) {
  return dk({
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parseForDisplay(iso))
}

/**
 * Dato uden klokkeslæt. Ren `YYYY-MM-DD` tolkes som kalenderdag og vises i København
 * (undgår UTC-midnat → skæv dag for brugere uden for DK).
 */
export function formatDateOnly(iso: string) {
  const d = iso.slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split('-').map(Number)
    return dk({ year: 'numeric', month: 'short', day: 'numeric' }).format(
      new Date(Date.UTC(y, m - 1, day, 12, 0, 0)),
    )
  }
  return formatDate(iso)
}

/** Dato uden tid med langt månedsnavn (faktura-PDF). */
export function formatDateLongNoTime(iso: string) {
  const d = iso.slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split('-').map(Number)
    return new Intl.DateTimeFormat('da-DK', {
      timeZone: APP_TIMEZONE,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date(Date.UTC(y, m - 1, day, 12, 0, 0)))
  }
  return new Intl.DateTimeFormat('da-DK', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(parseForDisplay(iso))
}
