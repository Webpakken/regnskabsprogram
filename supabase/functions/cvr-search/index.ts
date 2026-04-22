import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { fetchAuthV1User } from '../_shared/authV1User.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

/**
 * Gratis CVR-opslag via apicvr.dk (open source, data fra CVR).
 * Dokumentation: https://apicvr.dk/docs
 *
 * Tidligere: rest.cvrapi.dk (kræver betalt token). apicvr.dk kræver ikke nøgle
 * og kan kaldes fra denne Edge Function uden CORS-problemer.
 */
const APICVR = 'https://apicvr.dk/api/v1'

type CvrCompany = { vat: number; name: string; email: string | null }

function mapApicvr(raw: Record<string, unknown>): CvrCompany | null {
  if (raw.error) return null
  const vatRaw = raw.vat
  const name = String(raw.name ?? '').trim()
  if (!name || vatRaw == null) return null
  const vat =
    typeof vatRaw === 'number' ? vatRaw : Number(vatRaw)
  if (!Number.isFinite(vat)) return null
  const emailRaw = raw.email
  const email =
    emailRaw != null && String(emailRaw).trim() !== ''
      ? String(emailRaw).trim()
      : null
  return { vat, name, email }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const auth = await fetchAuthV1User(supabaseUrl, anon, authHeader)
  if (!auth.ok) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  let body: { q?: string }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }

  const q = (body.q ?? '').trim()
  if (q.length < 2) {
    return jsonResponse({ companies: [] as CvrCompany[] })
  }

  const onlyDigits = q.replace(/\D/g, '')
  const nonDigitChars = q.replace(/[0-9\s.\-]/g, '')
  const looksLikeCvr =
    onlyDigits.length === 8 &&
    (nonDigitChars === '' || nonDigitChars.toUpperCase() === 'DK')

  let url: string
  if (looksLikeCvr) {
    url = `${APICVR}/${onlyDigits}`
  } else {
    url = `${APICVR}/search/company/${encodeURIComponent(q)}`
  }

  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Bilago-CVR-Search/1.0',
    },
  })

  const text = await res.text()
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    console.error('apicvr: invalid JSON', res.status, text.slice(0, 200))
    return jsonResponse(
      { error: 'CVR-kilde svarer uventet', companies: [] as CvrCompany[] },
      502,
    )
  }

  if (!res.ok) {
    const err = (data as { error?: string })?.error
    if (res.status === 404 || err === 'NOT_FOUND') {
      return jsonResponse({ companies: [] as CvrCompany[] })
    }
    console.error('apicvr HTTP', res.status, text.slice(0, 300))
    return jsonResponse(
      { error: 'CVR-opslag fejlede', companies: [] as CvrCompany[] },
      502,
    )
  }

  if (
    data &&
    typeof data === 'object' &&
    'error' in data &&
    (data as { error: string }).error === 'NOT_FOUND'
  ) {
    return jsonResponse({ companies: [] as CvrCompany[] })
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

  return jsonResponse({ companies })
})
