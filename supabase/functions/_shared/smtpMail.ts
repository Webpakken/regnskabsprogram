import nodemailer from 'npm:nodemailer@6.9.15'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

type ProfileRow = {
  host: string | null
  port: number | null
  user_name: string | null
  smtp_password: string | null
  from_email: string | null
  from_name: string | null
}

export async function loadSmtpProfile(
  admin: SupabaseClient,
  profileId: 'transactional' | 'platform' | 'marketing',
): Promise<{ profile: ProfileRow; error?: string }> {
  const { data: profile, error } = await admin
    .from('platform_smtp_profiles')
    .select('host, port, user_name, smtp_password, from_email, from_name')
    .eq('id', profileId)
    .maybeSingle()
  if (error) return { profile: {} as ProfileRow, error: error.message }
  if (!profile) return { profile: {} as ProfileRow, error: 'Ukendt SMTP-profil' }
  const host = profile.host?.trim()
  const port = profile.port
  const user = profile.user_name?.trim()
  const pass = profile.smtp_password
  const fromEmail = profile.from_email?.trim()
  if (!host || port == null || !user || !pass || !fromEmail) {
    return {
      profile: profile as ProfileRow,
      error:
        'SMTP er ikke konfigureret fuldt (host, port, bruger, adgangskode, afsender-e-mail).',
    }
  }
  return { profile: profile as ProfileRow }
}

export async function sendSmtpHtml(opts: {
  profile: ProfileRow
  fromName: string
  to: string
  subject: string
  html: string
  attachments?: Array<{ filename: string; content: Uint8Array }>
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const { profile, fromName, to, subject, html, attachments } = opts
  const host = profile.host?.trim()
  const port = profile.port
  const user = profile.user_name?.trim()
  const pass = profile.smtp_password
  const fromEmail = profile.from_email?.trim()
  if (!host || port == null || !user || !pass || !fromEmail) {
    return { ok: false, message: 'Manglende SMTP-konfiguration' }
  }
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  })
  try {
    await transporter.sendMail({
      from: { name: fromName, address: fromEmail },
      to,
      subject,
      html,
      attachments:
        attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
        })) ?? undefined,
    })
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: msg }
  }
}
