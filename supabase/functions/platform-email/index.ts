import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { escapeHtml } from '../_shared/emailLayout.ts'
import { loadSmtpProfile, sendSmtpHtml } from '../_shared/smtpMail.ts'
import {
  mergeEmailTemplates,
  renderFinalEmail,
  type TemplateKey,
} from '../_shared/emailTemplateConfig.ts'
import { resolveAppPublicUrl } from '../_shared/appUrl.ts'

function formatDkk(cents: number): string {
  return new Intl.NumberFormat('da-DK', {
    style: 'currency',
    currency: 'DKK',
  }).format(cents / 100)
}

const APP_TIMEZONE = 'Europe/Copenhagen'

function formatDaDate(iso: string): string {
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso.slice(0, 10))) {
      const d8 = iso.slice(0, 10)
      const [y, m, day] = d8.split('-').map(Number)
      const t = new Date(Date.UTC(y, m - 1, day, 12, 0, 0))
      return new Intl.DateTimeFormat('da-DK', {
        timeZone: APP_TIMEZONE,
        dateStyle: 'long',
      }).format(t)
    }
    return new Intl.DateTimeFormat('da-DK', {
      timeZone: APP_TIMEZONE,
      dateStyle: 'long',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Ejer',
  manager: 'Administrator',
  bookkeeper: 'Bogholder',
  accountant: 'Revisor',
}

const MAX_INVOICE_PDF_BASE64_CHARS = 8_000_000

function base64ToUint8Array(b64: string): Uint8Array | null {
  try {
    const binary = atob(b64.replace(/\s/g, ''))
    const out = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

type Kind =
  | 'welcome_new_user'
  | 'company_member_invite'
  | 'invoice_sent'
  | 'invoice_reminder'
  | 'invoice_dunning'

serve(async (req) => {
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
  const authUser = (await authRes.json()) as {
    id?: string
    email?: string
    user_metadata?: { full_name?: string }
  }
  if (!authUser.id || !authUser.email?.trim()) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const userId = authUser.id
  const userEmail = authUser.email.trim()

  let body: {
    kind?: Kind
    company_id?: string
    invitee_email?: string
    role?: string
    invoice_id?: string
    invoice_pdf_base64?: string
  }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }

  const kind = body.kind
  if (
    kind !== 'welcome_new_user' &&
    kind !== 'company_member_invite' &&
    kind !== 'invoice_sent' &&
    kind !== 'invoice_reminder' &&
    kind !== 'invoice_dunning'
  ) {
    return jsonResponse({ error: 'Ugyldig kind' }, 400)
  }

  const admin = createClient(supabaseUrl, serviceKey)

  const { data: pub } = await admin
    .from('platform_public_settings')
    .select('email_templates')
    .eq('id', 1)
    .maybeSingle()

  const templates = mergeEmailTemplates(pub?.email_templates)

  const smtpPlatform = await loadSmtpProfile(admin, 'platform')
  const smtpTx = smtpPlatform.error
    ? await loadSmtpProfile(admin, 'transactional')
    : null
  const smtpSystem = smtpPlatform.error == null ? smtpPlatform : smtpTx
  if (!smtpSystem || smtpSystem.error) {
    return jsonResponse(
      { error: smtpPlatform.error ?? smtpTx?.error ?? 'SMTP ikke konfigureret' },
      503,
    )
  }

  if (kind === 'welcome_new_user') {
    const { data: profile } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .maybeSingle()
    const userName =
      profile?.full_name?.trim() ||
      authUser.user_metadata?.full_name?.trim() ||
      userEmail.split('@')[0] ||
      'du'

    const rendered = renderFinalEmail('welcome_new_user', templates, {
      user_name: userName,
      login_url: `${resolveAppPublicUrl()}/login`,
    })
    if (!rendered) {
      return jsonResponse({ ok: true, skipped: true })
    }
    const fromName = smtpSystem.profile.from_name?.trim() || 'Bilago'
    const send = await sendSmtpHtml({
      profile: smtpSystem.profile,
      fromName,
      to: userEmail,
      subject: rendered.subject,
      html: rendered.html,
    })
    if (!send.ok) return jsonResponse({ error: send.message }, 502)
    return jsonResponse({ ok: true })
  }

  if (kind === 'company_member_invite') {
    const companyId = (body.company_id ?? '').trim()
    const inviteeEmail = (body.invitee_email ?? '').trim().toLowerCase()
    const role = (body.role ?? 'bookkeeper').trim()
    if (!companyId || !inviteeEmail) {
      return jsonResponse({ error: 'Mangler company_id eller invitee_email' }, 400)
    }

    const { data: mem } = await admin
      .from('company_members')
      .select('role')
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .maybeSingle()

    if (!mem || mem.role !== 'owner') {
      return jsonResponse({ error: 'Kun ejer kan invitere' }, 403)
    }

    const { data: company } = await admin
      .from('companies')
      .select('name')
      .eq('id', companyId)
      .maybeSingle()

    const rendered = renderFinalEmail('company_member_invite', templates, {
      company_name: company?.name?.trim() || 'Virksomhed',
      role_label: ROLE_LABELS[role] ?? role,
      invitee_email: inviteeEmail,
      signup_url: `${resolveAppPublicUrl()}/signup`,
    })
    if (!rendered) {
      return jsonResponse({ ok: true, skipped: true })
    }

    const fromName = smtpSystem.profile.from_name?.trim() || 'Bilago'
    const send = await sendSmtpHtml({
      profile: smtpSystem.profile,
      fromName,
      to: inviteeEmail,
      subject: rendered.subject,
      html: rendered.html,
    })
    if (!send.ok) return jsonResponse({ error: send.message }, 502)
    return jsonResponse({ ok: true })
  }

  const invoiceId = (body.invoice_id ?? '').trim()
  if (!invoiceId) {
    return jsonResponse({ error: 'Mangler invoice_id' }, 400)
  }

  const { data: inv } = await admin
    .from('invoices')
    .select(
      'id, company_id, invoice_number, customer_name, customer_email, gross_cents, due_date, notes, status',
    )
    .eq('id', invoiceId)
    .maybeSingle()

  if (!inv) {
    return jsonResponse({ error: 'Faktura ikke fundet' }, 404)
  }

  const { data: mem } = await admin
    .from('company_members')
    .select('role')
    .eq('company_id', inv.company_id)
    .eq('user_id', userId)
    .maybeSingle()

  if (
    !mem ||
    !['owner', 'manager', 'bookkeeper'].includes(mem.role ?? '')
  ) {
    return jsonResponse({ error: 'Ingen adgang' }, 403)
  }

  const to = inv.customer_email?.trim()
  if (!to) {
    return jsonResponse({ ok: true, skipped: true, reason: 'no_customer_email' })
  }

  const { data: company } = await admin
    .from('companies')
    .select('name, invoice_attach_pdf_to_email')
    .eq('id', inv.company_id)
    .maybeSingle()

  const companyName = company?.name?.trim() || 'Virksomhed'
  const attachPdfSetting = company?.invoice_attach_pdf_to_email !== false
  const notesRaw = inv.notes?.trim() ?? ''
  const notesBlock = notesRaw
    ? `<p style="margin:12px 0 0;color:#475569;font-size:14px;line-height:1.5;">${escapeHtml(notesRaw).replace(/\n/g, '<br/>')}</p>`
    : ''

  const invoiceNum = String(inv.invoice_number ?? '').trim()
  const templateKey: Extract<TemplateKey, 'invoice_sent' | 'invoice_reminder' | 'invoice_dunning'> =
    kind === 'invoice_reminder'
      ? 'invoice_reminder'
      : kind === 'invoice_dunning'
        ? 'invoice_dunning'
        : 'invoice_sent'
  const rendered = renderFinalEmail(
    templateKey,
    templates,
    {
      customer_name: inv.customer_name?.trim() || 'Kunde',
      invoice_number: invoiceNum,
      /** Danske pladsholdere i manuelt redigerede skabeloner */
      faktura_nummer: invoiceNum,
      fakturanummer: invoiceNum,
      gross_amount: formatDkk(Number(inv.gross_cents ?? 0)),
      due_date: formatDaDate(String(inv.due_date)),
      company_name: companyName,
      notes_block: notesBlock,
    },
    new Set(['notes_block']),
  )

  if (!rendered) {
    return jsonResponse({ ok: true, skipped: true })
  }

  const tx = await loadSmtpProfile(admin, 'transactional')
  if (tx.error || !tx.profile) {
    return jsonResponse({ error: tx.error ?? 'Transactional SMTP mangler' }, 503)
  }

  let pdfAttachment: { filename: string; content: Uint8Array } | undefined
  if (attachPdfSetting) {
    const raw = typeof body.invoice_pdf_base64 === 'string' ? body.invoice_pdf_base64.trim() : ''
    if (raw.length > 0 && raw.length <= MAX_INVOICE_PDF_BASE64_CHARS) {
      const bytes = base64ToUint8Array(raw)
      if (bytes && bytes.length > 0) {
        const safeNum = (invoiceNum || 'faktura').replace(/[^\w.\-]+/g, '_')
        pdfAttachment = {
          filename: `faktura-${safeNum}.pdf`,
          content: bytes,
        }
      }
    }
  }

  const send = await sendSmtpHtml({
    profile: tx.profile,
    fromName: companyName,
    to,
    subject: rendered.subject,
    html: rendered.html,
    attachments: pdfAttachment ? [pdfAttachment] : undefined,
  })
  if (!send.ok) return jsonResponse({ error: send.message }, 502)
  return jsonResponse({ ok: true })
})
