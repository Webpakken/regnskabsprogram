// src/lib/cvrLookup.ts

export type EntityType = 'virksomhed' | 'forening'

export type CvrLookupResult = {
  name?: string
  vat?: number
  address?: string
  zipcode?: string
  city?: string
  /** Numerisk virksomhedsform-kode fra Erhvervsstyrelsen (fx 110, 130, 140). */
  companycode?: number
  /** Tekstbeskrivelse af virksomhedsform (fx "Anpartsselskab", "Frivillig forening"). */
  companydesc?: string
}

export async function lookupCVR(cvr: string): Promise<CvrLookupResult> {
  // CVR API: https://cvrapi.dk/
  const url = `https://cvrapi.dk/api?search=${encodeURIComponent(cvr)}&country=dk`
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'bilago-app/1.0',
    },
  })
  if (!res.ok) throw new Error('CVR slå-op fejlede')
  return res.json()
}

/**
 * Virksomhedsform-koder fra Erhvervsstyrelsen (CVR) der signalerer foreninger eller fonde.
 * Liste baseret på publicerede koder i CVR-registret pr. 2026.
 */
const FORENING_COMPANY_CODES = new Set<number>([
  130, // Forening
  140, // Frivillig forening
  150, // Forening med begrænset ansvar (F.M.B.A.)
  195, // Fond
  285, // Erhvervsdrivende fond
  415, // Almennyttig forening
  420, // Religiøs forening / trossamfund
])

/**
 * Tekst-fragmenter (case-insensitive) i `companydesc` der signalerer forening.
 * Bruges som fallback hvis koden ikke matcher (CVR API'er kan variere).
 */
const FORENING_DESC_FRAGMENTS = ['forening', 'fond', 'trossamfund', 'frivillig']

/** Udled entity_type fra et CVR-opslagsresultat. Default er 'virksomhed'. */
export function detectEntityTypeFromCvr(data: CvrLookupResult | null | undefined): EntityType {
  if (!data) return 'virksomhed'
  if (typeof data.companycode === 'number' && FORENING_COMPANY_CODES.has(data.companycode)) {
    return 'forening'
  }
  const desc = data.companydesc?.toLowerCase() ?? ''
  if (FORENING_DESC_FRAGMENTS.some((fragment) => desc.includes(fragment))) {
    return 'forening'
  }
  return 'virksomhed'
}
