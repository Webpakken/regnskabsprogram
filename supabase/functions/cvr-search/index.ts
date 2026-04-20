import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

const CVR_BASE = 'https://rest.cvrapi.dk/v2/dk'

type CvrCompany = { vat: number; name: string; email: string | null }

function mapCompany(raw: Record<string, unknown>): CvrCompany | null {
  const life = raw.life as Record<string, unknown> | undefined
  const contact = raw.contact as Record<string, unknown> | undefined
  const vatRaw = raw.vat
  const name = String(life?.name ?? '').trim()
  if (!name) return null
  const vat =
    typeof vatRaw === 'number'
      ? vatRaw
      : typeof vatRaw === 'string'
        ? Number(vatRaw)
        : Number(vatRaw)
  if (!Number.isFinite(vat)) return null
  const emailRaw = contact?.email
  const email =
    emailRaw != null && String(emailRaw).trim() !== ''
      ? String(emailRaw).trim()
      : null
  return { vat, name, email }
}

function normalizeList(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.filter((x) => x && typeof x === 'object') as Record<
      string,
      unknown
    >[]
  }
  if (data && typeof data === 'object') {
    return [data as Record<string, unknown>]
  }
  return []
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const token = Deno.env.get('CVR_API_TOKEN')?.trim()
  if (!token) {
    return jsonResponse({
      companies: [] as CvrCompany[],
      disabled: true,
      message: 'CVR API er ikke konfigureret på serveren.',
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const userClient = createClient(supabaseUrl, anon, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData.user) {
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

  const auth = 'Basic ' + btoa(`${token}:`)
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: auth,
  }

  const onlyDigits = q.replace(/\D/g, '')
  const nonDigitChars = q.replace(/[0-9\s.\-]/g, '')
  const looksLikeCvr =
    onlyDigits.length === 8 &&
    (nonDigitChars === '' || nonDigitChars.toUpperCase() === 'DK')

  let url: string
  if (looksLikeCvr) {
    url = `${CVR_BASE}/company/${onlyDigits}`
  } else {
    url = `${CVR_BASE}/suggestions/company/${encodeURIComponent(q)}`
  }

  const res = await fetch(url, { headers })

  if (res.status === 404) {
    return jsonResponse({ companies: [] as CvrCompany[] })
  }

  if (!res.ok) {
    const text = await res.text()
    console.error('CVR API error', res.status, text)
    return jsonResponse(
      { error: 'CVR API fejl', companies: [] as CvrCompany[] },
      502,
    )
  }

  let data: unknown
  try {
    data = await res.json()
  } catch {
    return jsonResponse({ companies: [] as CvrCompany[] })
  }

  const rawList = normalizeList(data)
  const companies = rawList
    .map((r) => mapCompany(r))
    .filter((c): c is CvrCompany => c !== null)
    .slice(0, 20)

  return jsonResponse({ companies })
})
