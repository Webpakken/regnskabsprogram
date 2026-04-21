/** Synk med supabase/functions/_shared/emailTemplateConfig.ts (standardtekster). */
export type EmailTemplateKey =
  | 'welcome_new_user'
  | 'password_reset'
  | 'company_member_invite'
  | 'invoice_sent'

export type EmailTemplateBlock = {
  enabled: boolean
  subject: string
  html: string
}

export const EMAIL_TEMPLATE_LABELS: Record<
  EmailTemplateKey,
  { title: string; description: string; placeholders: string }
> = {
  welcome_new_user: {
    title: 'Velkomst — ny bruger',
    description: 'Sendes efter tilmelding når session oprettes med det samme (ikke ved e-mail-bekræftelse).',
    placeholders: '{{user_name}}, {{login_url}}',
  },
  password_reset: {
    title: 'Nulstil adgangskode',
    description:
      'Når slået til: link genereres af Bilago og sendes via jeres SMTP. Slået fra: Supabase Auth’s standardmail.',
    placeholders: '{{user_email}}, {{reset_link}}',
  },
  company_member_invite: {
    title: 'Invitation til virksomhed',
    description: 'Sendes når en ejer inviterer en e-mail til virksomheden.',
    placeholders: '{{company_name}}, {{role_label}}, {{invitee_email}}, {{signup_url}}',
  },
  invoice_sent: {
    title: 'Sendt faktura til kunde',
    description:
      'Sendes når en faktura markeres som sendt og kunden har e-mail. Afsendernavn = virksomhedens navn (transactional SMTP). PDF vedhæftes hvis virksomheden har «Vedhæft faktura» slået til under Indstillinger (standard: ja).',
    placeholders:
      '{{customer_name}}, {{invoice_number}}, {{gross_amount}}, {{due_date}}, {{company_name}}, {{notes_block}}',
  },
}

export const DEFAULT_EMAIL_TEMPLATES: Record<EmailTemplateKey, EmailTemplateBlock> = {
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

export function mergeEmailTemplates(
  db: unknown,
): Record<EmailTemplateKey, EmailTemplateBlock> {
  const out = structuredClone(
    DEFAULT_EMAIL_TEMPLATES,
  ) as Record<EmailTemplateKey, EmailTemplateBlock>
  if (!db || typeof db !== 'object') return out
  const o = db as Record<string, Partial<EmailTemplateBlock>>
  const keys: EmailTemplateKey[] = [
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
