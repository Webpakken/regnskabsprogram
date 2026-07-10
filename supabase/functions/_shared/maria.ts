/**
 * Maria — Bilagos AI-supportassistent (server-only, deles af chat- og support-flader).
 *
 * Kalder Anthropic Messages API direkte (samme mønster som voucher-extract).
 * Læser ANTHROPIC_API_KEY fra edge-secrets. Returnerer altid null ved manglende
 * nøgle, tom historik eller fejl, så chatten aldrig går ned pga. AI.
 */

export const MARIA_NAME = 'Maria'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const ANTHROPIC_MODEL = 'claude-sonnet-5'

export function mariaConfigured(): boolean {
  return !!Deno.env.get('ANTHROPIC_API_KEY')
}

const SUPPORT_SYSTEM = `Du er "Maria", en venlig AI-supportassistent hos Bilago.

Om produktet:
Bilago er en dansk, enkel regnskabs- og bogføringsapp til små virksomheder — enkeltmandsvirksomheder, ApS'er, freelancere og konsulenter. Alt samles ét sted: fakturaer, bilag (kvitteringer), moms, bank og påmindelser. Bilago lever op til den nye bogføringslov: bilag gemmes digitalt og opfylder kravene til opbevaring og dokumentation. Data hostes i EU (GDPR), og hver virksomheds data er adskilt.

Moduler (svar konkret ud fra dette):
- Fakturaer: opret, send og følg betaling på fakturaer. Du kan angive kundens EAN til elektronisk fakturering. Ved oprettelse/redigering af en kunde kan du slå virksomheden op på CVR, så navn og adresse udfyldes automatisk.
- Bilag (kvitteringer): upload et billede af en kvittering/faktura, og Bilago læser automatisk beløb, dato, forhandler og moms via OCR-scanning (AI). Du kan rette felterne bagefter. Bilag kan grupperes på events/projekter på tværs af kategorier.
- Moms: under "Moms" ser du salg (udgående fakturaer) og køb (bilag) i den valgte periode og får overblik over momstilsvar. Tallene bygger på dine registrerede fakturaer og bilag.
- Bank: forbind banken (via Aiia/PSD2) og afstem posteringer mod dine bilag og fakturaer.
- Medlemmer: invitér din bogholder, revisor eller medejer ind i virksomheden.
- Automatiske påmindelser: send automatiske betalingspåmindelser efter regler, så du ikke selv skal rykke for ubetalte fakturaer.
- Support: skriv til support direkte i appen.

Kom godt i gang: opret en konto, indtast virksomhedsoplysninger via CVR-opslag, og du er i gang med det samme. Man kan skifte fra et andet regnskabsprogram uden ventetid.

Priser og prøveperiode: De aktuelle planer og priser står i afsnittet "Aktuelle planer og priser" nedenfor — brug dem direkte når kunden spørger. Alle nye brugere får 30 dages gratis prøveperiode uden at tilføje betalingskort. Der er INGEN binding: man betaler månedligt og kan opsige når som helst. Fremgår en oplysning ikke af listen nedenfor, så henvis til bilago.dk/priser.

Sådan svarer du:
- Skriv MEGET kort, konkret og venligt på dansk. Standard: 1-3 sætninger. Ingen fyld, ingen indledninger.
- Start din FØRSTE besked i samtalen med en kort hilsen: "Hej". Kender du brugerens fornavn (se "Om brugeren" hvis den findes), så skriv "Hej {fornavn}". Gentag IKKE hilsenen i opfølgende svar.
- Kommentér ikke på spørgsmålet ("godt spørgsmål", "spændende" o.l.) — gå direkte til svaret.
- Besvar kun spørgsmål om Bilago og bogføring/regnskab i appen.
- SVAR SELV, SELVSIKKERT. Du kender produktet (se moduler ovenfor). Besvar funktionelle spørgsmål ("hvordan opretter jeg en faktura?", "kan Bilago læse mine kvitteringer?", "hvor ser jeg momsen?") direkte og entydigt. Sig ALDRIG "for at få det præcise svar…", "det kræver måske et manuelt trin" eller "jeg anbefaler at tale med et menneske" om HVORDAN produktet virker. Gæt aldrig — men svar altid på det, du ved.
- Bed ALDRIG kunden om selv at tjekke priser, planer eller funktioner — du har oplysningerne, så svar direkte (fx den præcise pris pr. måned).
- Formatér med markdown: brug **fed** til modul- og knap-navne. Indeholder svaret trin, så skriv dem som en kort NUMMERERET liste med ét trin pr. linje.
- Giv ALDRIG konkret skatte-, revisions- eller juridisk rådgivning. Forklar gerne hvordan Bilago hjælper (fx momsoversigten), men henvis til revisor/SKAT ved egentlige skatte-/revisionsspørgsmål.
- Opfind ALDRIG funktioner, priser eller regler.
- PLAN: Nævn ALDRIG hvilken plan kunden er på, og annoncér ikke prøveperiode eller plan uopfordret. Undtagelse: Hvis den KONKRETE funktion kunden spørger om ikke er i deres nuværende plan (se "Om brugeren" + planerne), så sig kort at funktionen kræver [den rette plan], og at man kan opgradere under **Abonnement**. Ellers svarer du bare på funktionen uden at nævne plan.
- MENNESKE: Tilbyd KUN "Tal med et menneske"-knappen ved konto-/faktura-/betalings-specifikke sager, en fejl/bug, eller noget der slet ikke fremgår af din viden — ALDRIG som erstatning for et funktionelt svar du selv kan give.`

// Danske labels for feature-nøgler (samme som billing_features).
const FEATURE_LABELS: Record<string, string> = {
  invoices: 'Fakturaer',
  vouchers: 'Bilag',
  voucher_projects: 'Events/projekter på bilag',
  bank: 'Bank',
  vat: 'Moms',
  members: 'Medlemmer',
  invoice_automation: 'Automatiske påmindelser',
  ocr_scans: 'OCR-scanning',
  support: 'Support',
}

export type PlanRow = {
  name: string
  description?: string | null
  monthly_price_cents: number
  features?: Array<{ key: string; enabled: boolean; limit_value: number | null }> | null
}

/** Formatér de aktuelle planer til Marias kontekst (dansk). */
export function formatPlansForPrompt(plans: PlanRow[]): string {
  return plans
    .map((p) => {
      const kr = Math.round((p.monthly_price_cents ?? 0) / 100).toLocaleString('da-DK')
      const priceLabel = (p.monthly_price_cents ?? 0) === 0 ? 'gratis' : `${kr} kr/md`
      const feats = (p.features ?? [])
        .filter((f) => f.enabled)
        .map((f) => {
          const label = FEATURE_LABELS[f.key] ?? f.key
          return f.limit_value != null ? `${label} (op til ${f.limit_value})` : label
        })
        .join(', ')
      const desc = p.description ? ` (${p.description})` : ''
      return `- ${p.name}${desc}: ${priceLabel}.${feats ? ` Inkluderer: ${feats}.` : ''}`
    })
    .join('\n')
}

export type Turn = { role: 'user' | 'assistant'; text: string }

/**
 * Genererer Marias svar ud fra samtalens historik.
 * Returnerer null hvis AI ikke er konfigureret, historikken er tom/ugyldig,
 * eller kaldet fejler — så flowet aldrig går ned pga. AI.
 */
export async function generateMariaReply(
  history: Turn[],
  facts?: string,
  userInfo?: string,
  /** Redigerbar oplæring (retningslinjer + videns-base) fra loadMariaConfig(). */
  training?: string,
): Promise<string | null> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return null

  const messages = history
    .filter((t) => t.text.trim().length > 0)
    .map((t) => ({ role: t.role, content: t.text }))
  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    return null
  }

  let system = SUPPORT_SYSTEM
  if (training) system += `\n\n${training}`
  if (facts) system += `\n\nAktuelle planer og priser:\n${facts}`
  if (userInfo) system += `\n\nOm brugeren i denne chat:\n${userInfo}`

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages,
      }),
    })
    if (!res.ok) {
      console.warn('[maria] Anthropic API fejl', res.status, (await res.text()).slice(0, 300))
      return null
    }
    const json = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>
    }
    const text = (json.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('')
      .trim()
    return text || null
  } catch (e) {
    console.error('[maria] kunne ikke generere svar:', e)
    return null
  }
}

/**
 * Henter de aktive planer + feature-liste fra databasen og formaterer dem til
 * Marias kontekst. Tager en service-role Supabase-klient. Returnerer undefined
 * hvis intet kan hentes (Maria svarer så uden pris-fakta).
 */
// deno-lint-ignore no-explicit-any
export async function loadPlanFacts(admin: any): Promise<string | undefined> {
  try {
    const a = admin
    const { data: plans } = await a
      .from('billing_plans')
      .select('id, name, description, monthly_price_cents')
      .eq('active', true)
      .order('sort_order')
    if (!plans || plans.length === 0) return undefined

    const { data: features } = await a
      .from('billing_features')
      .select('id, key')
      .eq('active', true)
    const { data: planFeatures } = await a
      .from('billing_plan_features')
      .select('plan_id, feature_id, enabled, limit_value')

    const featureKeyById = new Map<string, string>(
      (features ?? []).map((f: { id: string; key: string }) => [f.id, f.key]),
    )
    const byPlan = new Map<
      string,
      Array<{ key: string; enabled: boolean; limit_value: number | null }>
    >()
    for (const pf of planFeatures ?? []) {
      const key = featureKeyById.get(pf.feature_id)
      if (!key) continue
      const arr = byPlan.get(pf.plan_id) ?? []
      arr.push({ key, enabled: pf.enabled, limit_value: pf.limit_value })
      byPlan.set(pf.plan_id, arr)
    }

    const rows: PlanRow[] = plans.map(
      (p: { id: string; name: string; description: string | null; monthly_price_cents: number }) => ({
        name: p.name,
        description: p.description,
        monthly_price_cents: p.monthly_price_cents,
        features: byPlan.get(p.id) ?? [],
      }),
    )
    return formatPlansForPrompt(rows)
  } catch (e) {
    console.warn('[maria] kunne ikke hente planer:', e)
    return undefined
  }
}

export type MariaConfig = {
  /** Global kill-switch. false → Maria svarer ikke (mennesker overtager). */
  enabled: boolean
  /** Formateret oplæring (retningslinjer + videns-base) til systemprompten. */
  training: string | undefined
}

/**
 * Henter Marias redigerbare oplæring (maria_settings + maria_knowledge) som
 * platform-staff vedligeholder. Best effort — fejler den, svarer Maria på sin
 * indbyggede kerne-prompt (enabled=true som standard).
 */
// deno-lint-ignore no-explicit-any
export async function loadMariaConfig(admin: any): Promise<MariaConfig> {
  try {
    const { data: settings } = await admin
      .from('maria_settings')
      .select('enabled, response_guidelines')
      .eq('id', 1)
      .maybeSingle()

    if (settings && settings.enabled === false) {
      return { enabled: false, training: undefined }
    }

    const { data: entries } = await admin
      .from('maria_knowledge')
      .select('title, content')
      .eq('active', true)
      .order('sort_order')

    const sections: string[] = []
    const guidelines = (settings?.response_guidelines ?? '').trim()
    if (guidelines) {
      sections.push(`Ekstra retningslinjer fra Bilago-teamet (følg dem nøje):\n${guidelines}`)
    }
    if (entries && entries.length > 0) {
      const kb = (entries as Array<{ title: string; content: string }>)
        .map((e) => `### ${e.title}\n${e.content}`)
        .join('\n\n')
      sections.push(`Produktviden fra Bilago-teamet (brug den til at svare konkret):\n${kb}`)
    }

    return { enabled: true, training: sections.length ? sections.join('\n\n') : undefined }
  } catch (e) {
    console.warn('[maria] kunne ikke hente oplæring:', e)
    return { enabled: true, training: undefined }
  }
}
