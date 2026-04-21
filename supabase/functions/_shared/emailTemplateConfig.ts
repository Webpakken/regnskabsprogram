import { applyTemplate, escapeHtml, wrapBilagoEmail } from './emailLayout.ts'

export type TemplateKey =
  | 'welcome_new_user'
  | 'password_reset'
  | 'company_member_invite'
  | 'invoice_sent'

export type TemplateBlock = {
  enabled: boolean
  subject: string
  /** Indhold (uden ydre ramme) — kan bruge {{placeholders}} */
  html: string
}

export const DEFAULT_EMAIL_TEMPLATES: Record<TemplateKey, TemplateBlock> = {
  welcome_new_user: {
    enabled: false,
    subject: 'Velkommen til Bilago',
    html: `<p style="margin:0 0 16px;">Hej {{user_name}},</p>
<p style="margin:0 0 16px;">Tak fordi du har oprettet en konto. Du er klar til at komme i gang med dansk bogføring, fakturaer og bilag — samlet ét sted.</p>
<p style="margin:0 0 20px;">
  <a href="{{login_url}}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;font-size:14px;">Gå til Bilago</a>
</p>
<p style="margin:0;color:#64748b;font-size:14px;">Vi glæder os til at hjælpe dig.</p>`,
  },
  password_reset: {
    enabled: false,
    subject: 'Nulstil adgangskode — Bilago',
    html: `<p style="margin:0 0 16px;">Du har bedt om at nulstille adgangskoden til kontoen <strong>{{user_email}}</strong>.</p>
<p style="margin:0 0 20px;">
  <a href="{{reset_link}}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;font-size:14px;">Vælg ny adgangskode</a>
</p>
<p style="margin:0;color:#64748b;font-size:13px;">Linket udløber efter kort tid. Ignorér denne mail, hvis du ikke selv har anmodet om nulstilling.</p>`,
  },
  company_member_invite: {
    enabled: false,
    subject: 'Du er inviteret til {{company_name}} i Bilago',
    html: `<p style="margin:0 0 16px;">Hej,</p>
<p style="margin:0 0 16px;"><strong>{{company_name}}</strong> har inviteret dig som <strong>{{role_label}}</strong> i Bilago.</p>
<p style="margin:0 0 20px;">Opret en konto med denne e-mail-adresse for at acceptere invitationen:</p>
<p style="margin:0 0 20px;">
  <a href="{{signup_url}}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;font-size:14px;">Opret konto</a>
</p>
<p style="margin:0;color:#64748b;font-size:13px;">Hvis du allerede har en Bilago-konto, kan du logge ind med samme e-mail.</p>`,
  },
  invoice_sent: {
    enabled: false,
    subject: 'Faktura {{invoice_number}} fra {{company_name}}',
    html: `<p style="margin:0 0 16px;">Kære {{customer_name}},</p>
<p style="margin:0 0 16px;">Hermed sendes faktura <strong>{{invoice_number}}</strong> fra <strong>{{company_name}}</strong>.</p>
<table style="width:100%;border-collapse:collapse;margin:16px 0;background:#f8fafc;border-radius:10px;overflow:hidden;">
  <tr><td style="padding:14px 16px;color:#64748b;font-size:13px;">Beløb inkl. moms</td><td style="padding:14px 16px;text-align:right;font-weight:700;color:#0f172a;">{{gross_amount}}</td></tr>
  <tr><td style="padding:14px 16px;color:#64748b;font-size:13px;border-top:1px solid #e2e8f0;">Forfaldsdato</td><td style="padding:14px 16px;text-align:right;border-top:1px solid #e2e8f0;">{{due_date}}</td></tr>
</table>
{{notes_block}}
<p style="margin:16px 0 0;color:#64748b;font-size:13px;">Med venlig hilsen<br/><strong>{{company_name}}</strong></p>`,
  },
}

export function mergeEmailTemplates(db: unknown): Record<TemplateKey, TemplateBlock> {
  const out = structuredClone(DEFAULT_EMAIL_TEMPLATES) as Record<TemplateKey, TemplateBlock>
  if (!db || typeof db !== 'object') return out
  const o = db as Record<string, Partial<TemplateBlock>>
  const keys: TemplateKey[] = [
    'welcome_new_user',
    'password_reset',
    'company_member_invite',
    'invoice_sent',
  ]
  for (const k of keys) {
    const p = o[k]
    if (!p || typeof p !== 'object') continue
    if (typeof p.enabled === 'boolean') out[k].enabled = p.enabled
    if (typeof p.subject === 'string') out[k].subject = p.subject
    if (typeof p.html === 'string') out[k].html = p.html
  }
  return out
}

export function renderFinalEmail(
  key: TemplateKey,
  templates: Record<TemplateKey, TemplateBlock>,
  vars: Record<string, string>,
  rawHtmlKeys?: Set<string>,
): { subject: string; html: string } | null {
  const block = templates[key]
  if (!block.enabled) return null
  const inner = applyTemplate(
    block.html,
    Object.fromEntries(
      Object.entries(vars).map(([k, v]) => [
        k,
        rawHtmlKeys?.has(k) ? v : escapeHtml(v),
      ]),
    ),
  )
  const subject = applyTemplate(
    block.subject,
    Object.fromEntries(
      Object.entries(vars).map(([k, v]) => [k, v.replace(/[\r\n]/g, ' ')]),
    ),
  )
  const html = wrapBilagoEmail(inner, subject)
  return { subject, html }
}
