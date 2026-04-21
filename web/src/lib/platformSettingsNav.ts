import type { EmailTemplateKey } from '@/lib/emailTemplateDefaults'

export const PUBLIC_SETTINGS_LINKS = [
  { to: '/platform/settings/public/kontakt', label: 'Kontakt og links' },
  { to: '/platform/settings/public/aabning', label: 'Åbningstider' },
  { to: '/platform/settings/public/pris', label: 'Pris' },
] as const

export const SMTP_PROFILE_IDS = ['marketing', 'platform', 'transactional'] as const
export type SmtpNavProfileId = (typeof SMTP_PROFILE_IDS)[number]

/** Matcher platform_smtp_profiles.id */
export const SMTP_SIDEBAR_LABELS: Record<SmtpNavProfileId, string> = {
  marketing: 'Nyhedsbrev og opdateringer',
  platform: 'Support og system',
  transactional: 'Faktura og kundemails',
}

export const EMAIL_TEMPLATE_NAV: {
  slug: string
  key: EmailTemplateKey
  label: string
}[] = [
  { slug: 'velkomst-ny-bruger', key: 'welcome_new_user', label: 'Velkomst — ny bruger' },
  { slug: 'nulstil-adgangskode', key: 'password_reset', label: 'Nulstil adgangskode' },
  {
    slug: 'invitation-til-virksomhed',
    key: 'company_member_invite',
    label: 'Invitation til virksomhed',
  },
  { slug: 'sendt-faktura-til-kunde', key: 'invoice_sent', label: 'Sendt faktura til kunde' },
]

export function emailTemplateSlugToKey(slug: string | undefined): EmailTemplateKey | null {
  if (!slug) return null
  const row = EMAIL_TEMPLATE_NAV.find((e) => e.slug === slug)
  return row?.key ?? null
}

export function isSmtpProfileId(id: string): id is SmtpNavProfileId {
  return SMTP_PROFILE_IDS.includes(id as SmtpNavProfileId)
}

/** Synlig sidetitel og kort undertitel til platform-indstillinger (matcher sidebaren). */
export function getPlatformSettingsPageMeta(pathname: string): {
  title: string
  subtitle: string
} {
  for (const l of PUBLIC_SETTINGS_LINKS) {
    if (pathname === l.to) {
      const subtitle =
        l.to.endsWith('/kontakt')
          ? 'Kontaktinfo og links på forsiden og i sidens fod.'
          : l.to.endsWith('/aabning')
            ? 'Åbningstider vist til besøgende.'
            : 'Priser og tekster i prissektionen på forsiden.'
      return { title: l.label, subtitle }
    }
  }
  const smtp = /^\/platform\/settings\/smtp\/([^/]+)\/?$/.exec(pathname)
  if (smtp?.[1] && isSmtpProfileId(smtp[1])) {
    return {
      title: SMTP_SIDEBAR_LABELS[smtp[1]],
      subtitle: 'Konfigurer udgående mail for denne SMTP-profil.',
    }
  }
  const email = /^\/platform\/settings\/emails\/([^/]+)\/?$/.exec(pathname)
  if (email?.[1]) {
    const row = EMAIL_TEMPLATE_NAV.find((e) => e.slug === email[1])
    if (row) {
      return {
        title: row.label,
        subtitle: 'Rediger HTML-skabelon og emnelinje.',
      }
    }
  }
  return {
    title: 'Indstillinger',
    subtitle: 'Vælg en undersektion i menuen til venstre.',
  }
}
