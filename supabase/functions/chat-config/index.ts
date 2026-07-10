import { serveWithSentry } from '../_shared/sentry.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

/**
 * Online-status + offline-besked til Maria-widgeten. Maria (AI) svarer altid,
 * men "online" afspejler om et menneske er tilgængeligt (dansk kontortid).
 */

// Er der en medarbejder på nu? Man-fre 9-16 dansk tid.
function humansOnline(): boolean {
  try {
    const parts = new Intl.DateTimeFormat('da-DK', {
      timeZone: 'Europe/Copenhagen',
      weekday: 'short',
      hour: 'numeric',
      hour12: false,
    }).formatToParts(new Date())
    const weekday = parts.find((p) => p.type === 'weekday')?.value ?? ''
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
    const isWeekend = /lør|søn/i.test(weekday)
    return !isWeekend && hour >= 9 && hour < 16
  } catch {
    return true
  }
}

serveWithSentry('chat-config', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)

  let supportHours: string | null = null
  try {
    const { data } = await admin
      .from('platform_public_settings')
      .select('support_hours')
      .eq('id', 1)
      .maybeSingle()
    supportHours = data?.support_hours?.trim() || null
  } catch {
    /* ignorér */
  }

  const online = humansOnline()
  const offlineMessage = online
    ? ''
    : supportHours
      ? `Vores team er offline lige nu. Åbningstider: ${supportHours}. Maria hjælper dig imens.`
      : 'Vores team er offline lige nu, men Maria hjælper dig med det samme.'

  return jsonResponse({ online, offlineMessage })
})
