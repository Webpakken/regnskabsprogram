import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

type SubBody = {
  endpoint?: string
  keys?: { p256dh?: string; auth?: string }
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

  const base = supabaseUrl.replace(/\/$/, '')
  const authRes = await fetch(`${base}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: anon },
  })
  if (!authRes.ok) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }
  const authUser = (await authRes.json()) as { id?: string }
  if (!authUser.id) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  let body: { subscription?: SubBody }
  try {
    body = (await req.json()) as { subscription?: SubBody }
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }
  const sub = body.subscription
  if (!sub?.endpoint?.trim() || !sub.keys?.p256dh || !sub.keys?.auth) {
    return jsonResponse({ error: 'Missing subscription' }, 400)
  }

  const sb = createClient(supabaseUrl, anon, {
    global: { headers: { Authorization: authHeader } },
  })

  const { error } = await sb.from('push_subscriptions').upsert(
    {
      user_id: authUser.id,
      endpoint: sub.endpoint.trim(),
      subscription: sub as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,endpoint' },
  )

  if (error) {
    return jsonResponse({ error: error.message }, 400)
  }
  return jsonResponse({ ok: true })
})
