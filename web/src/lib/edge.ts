import { supabase } from '@/lib/supabase'

const fnUrl = (name: string) => {
  const base = import.meta.env.VITE_SUPABASE_URL as string
  return `${base}/functions/v1/${name}`
}

export async function startStripeCheckout(companyId: string) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Ikke logget ind')

  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  const res = await fetch(fnUrl('stripe-checkout'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anon,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ company_id: companyId }),
  })
  const json = (await res.json()) as { url?: string; error?: string }
  if (!res.ok) throw new Error(json.error ?? 'Checkout fejlede')
  if (!json.url) throw new Error('Manglede Stripe URL')
  return json.url
}

export async function startAiiaOAuth(companyId: string) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Ikke logget ind')

  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  const res = await fetch(fnUrl('aiia-oauth-start'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anon,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ company_id: companyId }),
  })
  const json = (await res.json()) as { url?: string; error?: string }
  if (!res.ok) throw new Error(json.error ?? 'Kunne ikke starte bank')
  if (!json.url) throw new Error('Manglede Aiia URL')
  return json.url
}

export async function invokeSmtpTest(
  profileId: 'transactional' | 'platform' | 'marketing',
  options?: { testCompanyName?: string },
) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Ikke logget ind')

  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  const res = await fetch(fnUrl('smtp-test'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anon,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      profile_id: profileId,
      test_company_name: options?.testCompanyName,
    }),
  })
  const json = (await res.json()) as { ok?: boolean; error?: string }
  if (!res.ok) throw new Error(json.error ?? 'SMTP-test fejlede')
  if (!json.ok) throw new Error(json.error ?? 'SMTP-test fejlede')
}
