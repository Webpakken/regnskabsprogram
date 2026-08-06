import type { CompanyRole } from '@/types/database'

export type SettingsNavItem = {
  to: string
  label: string
  /** Beskrivelse på Indstillinger-menusiden (mobil). */
  body: string
  /** Hvis sat, vises kun for denne entity_type. */
  onlyFor?: 'virksomhed' | 'forening'
  /** Revisorer har kun læseadgang og styrer ikke virksomhedens opsætning. */
  hideForAccountant?: boolean
}

export const settingsNav: SettingsNavItem[] = [
  {
    to: '/app/settings/general',
    label: 'Generelt',
    body: 'Virksomhedens stamdata, adresse og grundlæggende oplysninger.',
    hideForAccountant: true,
  },
  {
    to: '/app/settings/invoice',
    label: 'Faktura',
    body: 'Fakturaoplysninger, logo, kontonumre og automatiske påmindelser.',
    hideForAccountant: true,
  },
  {
    to: '/app/settings/vat',
    label: 'Moms',
    body: 'Momsperiode og satser.',
    onlyFor: 'virksomhed',
    hideForAccountant: true,
  },
  {
    to: '/app/settings/notifications',
    label: 'Notifikationer',
    body: 'Push-beskeder og valg af hvilke hændelser du vil have besked om.',
    hideForAccountant: true,
  },
  {
    to: '/app/settings/subscription',
    label: 'Abonnement',
    body: 'Status på abonnement, prøveperiode og betaling.',
    hideForAccountant: true,
  },
  {
    to: '/app/members',
    label: 'Medlemmer',
    body: 'Brugere med adgang til virksomheden, roller og invitationer.',
  },
  {
    to: '/app/settings/export',
    label: 'Eksport',
    body: 'Download alle bilag og fakturaer som ZIP — fx til revisor eller arkiv.',
  },
]

/** Underpunkter i Indstillinger, filtreret efter virksomhedstype og rolle. */
export function visibleSettingsNavFor(
  entityType: 'virksomhed' | 'forening',
  role: CompanyRole | null,
): SettingsNavItem[] {
  return settingsNav.filter(
    (item) =>
      (!item.onlyFor || item.onlyFor === entityType) &&
      !(item.hideForAccountant && role === 'accountant'),
  )
}
