/** Standardtekster til forsiden (#pricing) når DB-felter er tomme */

export type PricingFeatureItem = {
  title: string
  subtitle: string
}

export const PRICING_DEFAULTS = {
  title: 'Én plan. Alt inkluderet.',
  subtitle: 'Ingen bindingsperiode. Opsig når du vil.',
  badge: 'Introtilbud — lås prisen',
  planName: 'Bilago',
  unitLabel: 'kr./md.',
  lockLabel: 'Fast pris så længe du er kunde',
  pitch:
    'Start gratis i 30 dage. Derefter {beløb} – uden binding.',
  /** Bevaret for bagudkompatibilitet; det nye UI bruger featureItems. */
  features: `Fakturering med dansk moms
Bilagshåndtering og digital arkivering
Bank-afstemning og CSV-import
CVR-opslag
Dansk support via mail`,
  featureItems: [
    {
      title: 'Send ubegrænset antal fakturaer',
      subtitle: 'Ingen ekstra omkostninger.',
    },
    {
      title: 'Gem alle dine bilag og kunder ét sted',
      subtitle: 'Alt samlet og let at finde.',
    },
    {
      title: 'Få overblik over moms, bank og regnskab',
      subtitle: 'Automatisér og spar tid i hverdagen.',
    },
    {
      title: 'Klar til dansk bogføringslov',
      subtitle: '5 års digital opbevaring af dine bilag.',
    },
    {
      title: 'Dansk support når du har brug for hjælp',
      subtitle: 'Svar på hverdage – fra rigtige mennesker.',
    },
  ] as PricingFeatureItem[],
  cta: 'Kom i gang gratis',
  footerLeft: 'Sikkert. Trygt. Dansk.',
  footerRight: 'Ingen binding – opsig når som helst.',
} as const

/** Læs et JSONB-felt fra public_settings og mappen til feature-items med fallback. */
export function resolveFeatureItems(raw: unknown): PricingFeatureItem[] {
  if (!Array.isArray(raw)) return [...PRICING_DEFAULTS.featureItems]
  const items: PricingFeatureItem[] = []
  for (const r of raw) {
    if (r && typeof r === 'object') {
      const t = (r as { title?: unknown }).title
      const s = (r as { subtitle?: unknown }).subtitle
      if (typeof t === 'string' && t.trim()) {
        items.push({
          title: t.trim(),
          subtitle: typeof s === 'string' ? s.trim() : '',
        })
      }
    }
  }
  return items.length > 0 ? items : [...PRICING_DEFAULTS.featureItems]
}
