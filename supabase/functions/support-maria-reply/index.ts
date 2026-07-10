import { serveWithSentry } from '../_shared/sentry.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { fetchAuthV1User } from '../_shared/authV1User.ts'
import {
  generateMariaReply,
  loadMariaConfig,
  loadPlanFacts,
  mariaConfigured,
  type Turn,
} from '../_shared/maria.ts'

/**
 * Maria svarer i en support-ticket-tråd. Kaldes af kunden lige efter deres
 * besked er indsat. Maria svarer synkront som en staff-besked markeret is_ai,
 * så SupportPage viser den som "Maria". Fejler den, eskaleres til et menneske.
 *
 * Returnerer { answered, escalated, wants_human } så klienten kan afgøre om
 * medarbejdere skal pushes (via support-push-customer-notify).
 */

// Hårdt dagligt loft på antal Maria-svar i support (platform-bredt), så AI-forbruget aldrig løber løbsk.
const MARIA_DAILY_CAP = Number(Deno.env.get('MARIA_DAILY_CAP') ?? 800)
// Genaktivér Maria hvis kunden skriver igen efter længere pause, selv efter et menneske overtog.
const RESET_AFTER_MS = 30 * 60 * 1000

const ROLE_LABEL: Record<string, string> = {
  owner: 'Ejer',
  manager: 'Administrator',
  bookkeeper: 'Bogholder',
  accountant: 'Revisor',
}

serveWithSentry('support-maria-reply', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401)
  const auth = await fetchAuthV1User(supabaseUrl, anon, authHeader)
  if (!auth.ok) return jsonResponse({ error: 'Unauthorized' }, 401)

  let ticketId: string
  try {
    const j = (await req.json()) as { ticket_id?: string }
    ticketId = (j.ticket_id ?? '').trim()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }
  if (!ticketId) return jsonResponse({ error: 'Missing ticket_id' }, 400)

  const admin = createClient(supabaseUrl, serviceKey)

  // Hent ticket og verificér at kalderen er medlem af virksomheden.
  const { data: ticket } = await admin
    .from('support_tickets')
    .select('id, company_id, ai_enabled, wants_human')
    .eq('id', ticketId)
    .maybeSingle()
  if (!ticket) return jsonResponse({ error: 'Ticket not found' }, 404)

  const { data: member } = await admin
    .from('company_members')
    .select('user_id, role')
    .eq('company_id', ticket.company_id)
    .eq('user_id', auth.user.id)
    .maybeSingle()
  if (!member) return jsonResponse({ error: 'Forbidden' }, 403)

  // Maria slået fra globalt (ingen API-nøgle eller kill-switch)? Så skal et menneske svare.
  const mariaCfg = await loadMariaConfig(admin)
  if (!mariaConfigured() || !mariaCfg.enabled) {
    return jsonResponse({ answered: false, escalated: false, wants_human: !!ticket.wants_human })
  }

  // Hent trådens historik (til Maria + til reset-beregning).
  const { data: history } = await admin
    .from('support_messages')
    .select('user_id, body, is_staff, is_ai, created_at')
    .eq('ticket_id', ticketId)
    .order('created_at')
    .limit(40)
  const msgs = history ?? []
  if (msgs.length === 0) {
    return jsonResponse({ answered: false, escalated: false, wants_human: !!ticket.wants_human })
  }

  // Seneste besked skal være fra kunden (ikke staff), ellers svarer Maria ikke.
  const last = msgs[msgs.length - 1]
  if (last.is_staff) {
    return jsonResponse({ answered: false, escalated: false, wants_human: !!ticket.wants_human })
  }

  // Ny henvendelse efter pause → Maria svarer først igen, selv hvis et menneske
  // tidligere overtog eller kunden var i kø.
  let aiEnabled = ticket.ai_enabled !== false
  let wantsHuman = ticket.wants_human === true
  const prev = msgs.length >= 2 ? msgs[msgs.length - 2] : null
  const idleMs = prev ? Date.now() - new Date(prev.created_at).getTime() : 0
  if (idleMs > RESET_AFTER_MS && (!aiEnabled || wantsHuman)) {
    aiEnabled = true
    wantsHuman = false
    await admin
      .from('support_tickets')
      .update({ ai_enabled: true, wants_human: false })
      .eq('id', ticketId)
  }

  if (!aiEnabled) {
    // Et menneske håndterer tråden → Maria blander sig ikke.
    return jsonResponse({ answered: false, escalated: false, wants_human: wantsHuman })
  }

  // Rate-limit: max 5 Maria-svar/min pr. ticket, max 40 pr. ticket, plus dagligt platform-loft.
  const since = new Date(Date.now() - 60 * 1000).toISOString()
  const dailySince = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const [recent, total, daily] = await Promise.all([
    admin.from('support_messages').select('id', { count: 'exact', head: true }).eq('ticket_id', ticketId).eq('is_ai', true).gte('created_at', since),
    admin.from('support_messages').select('id', { count: 'exact', head: true }).eq('ticket_id', ticketId).eq('is_ai', true),
    admin.from('support_messages').select('id', { count: 'exact', head: true }).eq('is_ai', true).gte('created_at', dailySince),
  ])
  const rateLimited = (recent.count ?? 0) >= 5 || (total.count ?? 0) >= 40
  const globalCap = (daily.count ?? 0) >= MARIA_DAILY_CAP

  let escalated = false
  if (globalCap) {
    escalated = true
  } else if (!rateLimited) {
    const turns: Turn[] = msgs.map((m) => ({
      role: (m.is_staff ? 'assistant' : 'user') as 'user' | 'assistant',
      text: m.body as string,
    }))

    const facts = await loadPlanFacts(admin)
    const userInfo = await buildUserInfo(admin, auth.user.id, ticket.company_id, member.role)

    const reply = await generateMariaReply(turns, facts, userInfo, mariaCfg.training)
    if (reply) {
      await admin.from('support_messages').insert({
        ticket_id: ticketId,
        user_id: null,
        body: reply,
        is_staff: true,
        is_ai: true,
      })
      await admin.from('support_tickets').update({ updated_at: new Date().toISOString() }).eq('id', ticketId)
      return jsonResponse({ answered: true, escalated: false, wants_human: wantsHuman })
    }
    // Fejl/quota → overdrag til et menneske.
    escalated = true
  }

  // Maria kunne ikke hjælpe (loft, rate-limit eller fejl) → sæt i kø til et menneske,
  // med en venlig holdebesked, så kunden aldrig står tilbage uden svar.
  if (escalated && !wantsHuman) {
    wantsHuman = true
    await admin.from('support_tickets').update({ wants_human: true }).eq('id', ticketId)
    await admin.from('support_messages').insert({
      ticket_id: ticketId,
      user_id: null,
      body: 'Tak for din besked! Jeg henter en medarbejder, som vender tilbage til dig hurtigst muligt.',
      is_staff: true,
      is_ai: true,
    })
  }

  return jsonResponse({ answered: false, escalated, wants_human: wantsHuman })
})

// Kort kontekst om kunden (navn, rolle, virksomhed, plan) til personligt + tilpasset svar.
// deno-lint-ignore no-explicit-any
async function buildUserInfo(admin: any, userId: string, companyId: string, role: string): Promise<string | undefined> {
  try {
    const [{ data: prof }, { data: company }] = await Promise.all([
      admin.from('profiles').select('full_name').eq('id', userId).maybeSingle(),
      admin.from('companies').select('name').eq('id', companyId).maybeSingle(),
    ])
    const firstName = (prof?.full_name ?? '').trim().split(/\s+/)[0]

    // Aktuel plan (bedste indsats).
    let planName: string | null = null
    const { data: sub } = await admin
      .from('subscriptions')
      .select('billing_plan_id')
      .eq('company_id', companyId)
      .maybeSingle()
    if (sub?.billing_plan_id) {
      const { data: plan } = await admin
        .from('billing_plans')
        .select('name')
        .eq('id', sub.billing_plan_id)
        .maybeSingle()
      planName = plan?.name ?? null
    }

    const lines = [
      firstName ? `Fornavn: ${firstName}` : null,
      `Rolle i virksomheden: ${ROLE_LABEL[role] ?? role}`,
      company?.name ? `Virksomhed: ${company.name}` : null,
      `Virksomhedens plan: ${planName ?? 'Prøveperiode/gratis'}`,
    ].filter(Boolean)
    return lines.length ? lines.join('\n') : undefined
  } catch {
    return undefined
  }
}
