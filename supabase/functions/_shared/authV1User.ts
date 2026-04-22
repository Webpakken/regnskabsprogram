/**
 * Hent bruger via Supabase Auth HTTP API (server validerer JWT inkl. ES256).
 * `createClient(…).auth.getUser()` parser token lokalt i supabase-js og fejler ofte med
 * «Unsupported JWT algorithm ES256» når projektet bruger asymmetriske nøgler.
 */
export type AuthV1User = {
  id: string
  email?: string | null
}

export type AuthV1Result =
  | { ok: true; user: AuthV1User }
  | { ok: false; error: 'unauthorized' }

export async function fetchAuthV1User(
  supabaseUrl: string,
  anonKey: string,
  authorization: string,
): Promise<AuthV1Result> {
  const base = supabaseUrl.replace(/\/$/, '')
  const res = await fetch(`${base}/auth/v1/user`, {
    headers: {
      Authorization: authorization,
      apikey: anonKey,
    },
  })
  if (!res.ok) {
    return { ok: false, error: 'unauthorized' }
  }
  const j = (await res.json()) as { id?: string; email?: string | null }
  if (!j.id) {
    return { ok: false, error: 'unauthorized' }
  }
  return { ok: true, user: { id: j.id, email: j.email } }
}
