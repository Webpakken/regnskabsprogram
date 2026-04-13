import { supabase } from '@/lib/supabase'

export async function logActivity(
  companyId: string,
  eventType: string,
  title: string,
  meta?: Record<string, unknown>,
) {
  const { data: u } = await supabase.auth.getUser()
  await supabase.from('activity_events').insert({
    company_id: companyId,
    actor_id: u.user?.id ?? null,
    event_type: eventType,
    title,
    meta: meta ?? null,
  })
}
