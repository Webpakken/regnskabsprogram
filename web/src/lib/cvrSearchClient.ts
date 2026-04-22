/**
 * Direkte CVR-opslag mod apicvr.dk fra browseren (GET).
 * apicvr.dk svarer med CORS pr. Origin — virker fra bilago.dk og localhost.
 * Edge Function `cvr-search` er stadig anbefalet (auth på serveren); denne sti bruges som fallback.
 *
 * @see https://apicvr.dk/docs
 */
const APICVR = 'https://apicvr.dk/api/v1'

export type CvrCompany = { vat: number; name: string; email: string | null }

function mapApicvr(raw: Record<string, unknown>): CvrCompany | null {
  if (raw.error) return null
  const vatRaw = raw.vat
  const name = String(raw.name ?? '').trim()
  if (!name || vatRaw == null) return null
  const vat = typeof vatRaw === 'number' ? vatRaw : Number(vatRaw)
  if (!Number.isFinite(vat)) return null
  const emailRaw = raw.email
  const email =
    emailRaw != null && String(emailRaw).trim() !== ''
      ? String(emailRaw).trim()
      : null
  return { vat, name, email }
}

/** Søg virksomheder (navn eller 8-cifret CVR) — samme logik som Edge Function `cvr-search`. */
export async function searchCvrFromApicvr(q: string): Promise<CvrCompany[]> {
  const trimmed = q.trim()
  if (trimmed.length < 2) return []

  const onlyDigits = trimmed.replace(/\D/g, '')
  const nonDigitChars = trimmed.replace(/[0-9\s.\-]/g, '')
  const looksLikeCvr =
    onlyDigits.length === 8 &&
    (nonDigitChars === '' || nonDigitChars.toUpperCase() === 'DK')

  const url = looksLikeCvr
    ? `${APICVR}/${onlyDigits}`
    : `${APICVR}/search/company/${encodeURIComponent(trimmed)}`

  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  })

  const text = await res.text()
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('CVR-kilden returnerede ikke JSON')
  }

  if (!res.ok) {
    const err = (data as { error?: string })?.error
    if (res.status === 404 || err === 'NOT_FOUND') {
      return []
    }
    throw new Error(`CVR-opslag fejlede (${res.status})`)
  }

  if (
    data &&
    typeof data === 'object' &&
    'error' in data &&
    (data as { error: string }).error === 'NOT_FOUND'
  ) {
    return []
  }

  const companies: CvrCompany[] = []

  if (looksLikeCvr) {
    const row = mapApicvr(data as Record<string, unknown>)
    if (row) companies.push(row)
  } else if (Array.isArray(data)) {
    for (const item of data) {
      if (item && typeof item === 'object') {
        const row = mapApicvr(item as Record<string, unknown>)
        if (row) companies.push(row)
      }
      if (companies.length >= 20) break
    }
  }

  return companies
}
