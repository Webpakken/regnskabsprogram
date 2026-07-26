/**
 * Læs et bilag (kvittering, faktura, gebyrnotat) via Claude Sonnet 5 vision.
 *
 * Klient sender base64-billede; vi kalder Anthropic Messages API med tool-use
 * for at tvinge struktureret JSON-output. System-prompten caches via prompt
 * caching (ephemeral, 5-min TTL) så følgende kald i samme session er billigere.
 *
 * Modelvalg: Sonnet 5 læser høj-opløsning (op til 2576 px lang kant) og tænker
 * adaptivt. Haiku 4.5 capper ved 1568 px og gættede for ofte forkert på beløb
 * og datoer i tætte kvitteringer.
 *
 * Auth: kræver Supabase JWT — så kun loggede brugere kan brænde Anthropic-credits.
 */
import { serveWithSentry } from '../_shared/sentry.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { fetchAuthV1User } from '../_shared/authV1User.ts'

const ANTHROPIC_MODEL = 'claude-sonnet-5'
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

/**
 * Skal rumme både adaptive thinking-tokens og selve tool-kaldet. Sættes
 * rundhåndet — vi betaler kun for det der faktisk genereres, men et for lavt
 * loft afkorter svaret midt i JSON'en og gør hele udlæsningen ubrugelig.
 */
const MAX_TOKENS = 8000

// Tilladte MIME-typer som Anthropic vision accepterer.
const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
])

const SYSTEM_PROMPT = `Du er en specialiseret udlæser af danske bilag — kvitteringer, fakturaer, indbetalingskort, gebyrnotater og bank-bilag.

Læs bilaget og udtræk de strukturerede felter via værktøjet \`submit_bilag_extraction\`. Følg disse regler:

1. **Beløb i øre (cents):** danske bilag bruger komma som decimal og punktum som tusind-separator. "1.500,00 DKK" er 1500 kroner = 150000 øre. Returnér ALTID beløb i øre (gang kroner med 100 og rund til heltal).

2. **Total (\`total_cents\`):** det endelige beløb der skal betales. Pas på at IKKE forveksle subtotal/momsgrundlag med totalen. Foretræk linjer mærket: "TOTAL", "I alt", "AT BETALE", "TIL BETALING", "Gebyr i alt", "BELØB I ALT", "SAMLET", "BETALT", "Sum". På kvitteringer står totalen nederst, efter varelinjerne — vælg den, ikke et delbeløb længere oppe. Ignorér "Kontant", "Kort", "Byttepenge", "Returneret" og "Modtaget", som er betalingsopgørelse og ikke totalen. Er der både et beløb før og efter rabat, vælg det der faktisk blev betalt.

3. **Forhandler (\`merchant\`):** typisk det fremtrædende navn/logo i toppen. Hvis logoet er stiliseret og du er i tvivl, kig efter "Velkommen til X", "Faktura fra X", eller selve firmanavnet over CVR-linjen. Strip parenteser med butiks-/branch-koder, fx "F24 (8132)" → "F24".

4. **Dato (\`expense_date\`):** ISO-format yyyy-mm-dd. Danske bilag skriver **altid dag før måned** (dd.mm.yyyy, dd-mm-yyyy, dd/mm-yy) — "05.07.2026" er 5. juli, ikke 7. maj. Læs aldrig et dansk bilag som mm/dd. Tocifrede årstal er 20xx. Hvis flere datoer: foretræk fakturadato/transaktionsdato over forfaldsdato, leveringsdato og udskriftsdato. En bilagsdato ligger i fortiden eller i dag — lander du på en fremtidig dato, har du sandsynligvis læst en forfaldsdato eller byttet dag og måned om.

5. **Moms (\`vat_cents\`, \`vat_rate\`):** dansk standard er 25%. Hvis bilaget tydeligt viser momsbeløb og momssats, returnér begge. For momsfri bilag (typisk bankgebyrer, fonde, foreningsindbetalinger): \`vat_rate: 0\`, \`vat_cents: 0\`. Hvis usikker, returnér \`null\`.

6. **Linjer (\`line_items\`):** maks 25 linjer. Beskrivelse + beløb i øre. Spring totaler/subtotaler/momslinjer over.

7. **Betalingsoplysninger:** hvis bilaget er en faktura, regning eller et indbetalingskort, udtræk hvordan der skal betales.

   - **FIK/GIK-indbetalingskort:** nederst står en OCR-linje på formen \`+NN<betalingsid+kreditornummer<\`, fx \`+71<0000000000123456+12345678<\`. \`NN\` er kortarten (01, 04, 15, 71, 73 eller 75). Returnér hele linjen i \`fik_line\` **uden mellemrum**, og læg kortart, betalingsid og kreditornummer i hvert sit felt. Kreditornummeret er altid 8 cifre. Betalingsid er op til 16 cifre (15 cifre plus et kontrolciffer) og er tomt på kortart 01. Læs cifrene ét ad gangen — et enkelt forkert ciffer sender pengene det forkerte sted hen, så sæt hellere \`fik_line: null\` end at gætte.
   - **Bankoverførsel:** "Reg.nr. 1234 Konto 5678901234", "Reg. 1234 – 5678901234" eller "Bank: 1234 5678901234". Reg.nr. er 4 cifre; kontonr. er op til 10 cifre. Fjern mellemrum og bindestreger.
   - **IBAN:** danske IBAN er \`DK\` + 2 kontrolcifre + 14 cifre (18 tegn i alt). Returnér uden mellemrum.
   - **MobilePay:** boksnummer, typisk 5-6 cifre.
   - \`payment_method\` sættes til den metode bilaget primært lægger op til. Er der både FIK-linje og kontonummer, foretræk \`"fik"\`. Findes ingen betalingsoplysninger (fx en almindelig butikskvittering der allerede er betalt), returnér \`null\` i alle betalingsfelter.
   - \`payment_reference\`: den tekst modtageren beder om i posteringsteksten — typisk fakturanummer, kundenummer eller ordrenummer.
   - \`due_date\`: forfaldsdato/betalingsfrist i ISO-format. Dette er IKKE det samme som \`expense_date\`.

8. **Konfidens (\`confidence\`):** 0.0-1.0 vurdering af din samlede tillid til ekstraktionen. Sæt lavt (<0.5) hvis billedet er sløret, beskåret eller du gætter væsentlige felter.

9. **\`uncertain_fields\`:** navngiv de felter du er i tvivl om, fx \`["total_cents", "expense_date"]\`. Brugeren får dem markeret til manuel kontrol. Er du sikker på det hele, returnér en tom liste.

10. **Returnér \`null\` for felter du ikke kan læse med rimelig sikkerhed.** Hellere ærligt null end gæt — brugeren kan udfylde manuelt. Et forkert beløb eller en forkert dato koster brugeren mere tid end et tomt felt, fordi den forkerte værdi ser rigtig ud og derfor ikke bliver opdaget.

**Før du kalder værktøjet, læs beløb, datoer og kontonumre igen på billedet ciffer for ciffer** og kontrollér at de matcher det du er ved at returnere. Tjek særligt at du ikke har forvekslet 1/7, 3/8, 5/6 eller 0/8, og at du har læst tusind-separator og decimalkomma rigtigt.

Returnér ALDRIG plain text — kald altid værktøjet \`submit_bilag_extraction\`.`

const EXTRACTION_TOOL = {
  name: 'submit_bilag_extraction',
  description: 'Indsend strukturerede felter udtrukket fra bilaget.',
  input_schema: {
    type: 'object',
    properties: {
      merchant: {
        type: ['string', 'null'],
        description: 'Forretningsnavn/forhandler. Strippet for branch-koder.',
      },
      total_cents: {
        type: ['integer', 'null'],
        description: 'Endelige beløb at betale, i øre (1500 kr = 150000).',
      },
      vat_cents: {
        type: ['integer', 'null'],
        description: 'Moms-beløb i øre. Null hvis ukendt.',
      },
      net_cents: {
        type: ['integer', 'null'],
        description: 'Netto-beløb (eks. moms) i øre. Null hvis ukendt.',
      },
      vat_rate: {
        type: ['number', 'null'],
        description: 'Momssats i procent (0 eller 25). Null hvis ukendt eller blandet.',
      },
      expense_date: {
        type: ['string', 'null'],
        description: 'Dato i ISO-format yyyy-mm-dd.',
      },
      currency: {
        type: ['string', 'null'],
        description: 'ISO 4217 valutakode (fx "DKK"). Null hvis ikke angivet.',
      },
      line_items: {
        type: 'array',
        description: 'Varelinjer (maks 25). Tom liste hvis ingen.',
        items: {
          type: 'object',
          properties: {
            description: { type: 'string' },
            amount_cents: { type: 'integer' },
          },
          required: ['description', 'amount_cents'],
        },
      },
      payment_method: {
        type: ['string', 'null'],
        enum: ['fik', 'bank_transfer', 'iban', 'mobilepay', null],
        description:
          'Primær betalingsmetode bilaget lægger op til. Null hvis bilaget ikke skal betales (fx butikskvittering).',
      },
      fik_line: {
        type: ['string', 'null'],
        description:
          'Hele FIK/GIK-linjen uden mellemrum, fx "+71<000000000012345678+12345678<". Null hvis der ikke er et indbetalingskort.',
      },
      fik_card_type: {
        type: ['string', 'null'],
        description: 'Kortart, to cifre: "01", "04", "15", "71", "73" eller "75".',
      },
      fik_creditor_no: {
        type: ['string', 'null'],
        description: 'Kreditornummer, 8 cifre — feltet efter "+" i FIK-linjen.',
      },
      fik_payment_id: {
        type: ['string', 'null'],
        description:
          'Betalingsid, op til 16 cifre — feltet mellem "<" og "+". Null på kortart 01.',
      },
      bank_reg_no: {
        type: ['string', 'null'],
        description: 'Registreringsnummer, 4 cifre. Kun cifre, ingen mellemrum.',
      },
      bank_account_no: {
        type: ['string', 'null'],
        description: 'Kontonummer, op til 10 cifre. Kun cifre, ingen mellemrum eller bindestreger.',
      },
      iban: {
        type: ['string', 'null'],
        description: 'IBAN uden mellemrum, fx "DK5000400440116243".',
      },
      payment_reference: {
        type: ['string', 'null'],
        description:
          'Tekst der skal med i posteringsteksten — fakturanr., kundenr. eller ordrenr.',
      },
      due_date: {
        type: ['string', 'null'],
        description: 'Forfaldsdato/betalingsfrist i ISO-format yyyy-mm-dd. Ikke bilagsdatoen.',
      },
      confidence: {
        type: 'number',
        description: 'Samlet konfidens 0.0-1.0.',
      },
      uncertain_fields: {
        type: 'array',
        description:
          'Navne på felter du er i tvivl om, fx ["total_cents", "expense_date"]. Tom liste hvis alt er sikkert.',
        items: { type: 'string' },
      },
      notes: {
        type: ['string', 'null'],
        description: 'Forbehold eller observationer (fx "sløret total", "blandede momssatser").',
      },
    },
    required: ['merchant', 'total_cents', 'expense_date', 'confidence'],
  },
} as const

type ExtractionResult = {
  merchant: string | null
  total_cents: number | null
  vat_cents: number | null
  net_cents: number | null
  vat_rate: number | null
  expense_date: string | null
  currency: string | null
  line_items: Array<{ description: string; amount_cents: number }>
  payment_method: 'fik' | 'bank_transfer' | 'iban' | 'mobilepay' | null
  fik_line: string | null
  fik_card_type: string | null
  fik_creditor_no: string | null
  fik_payment_id: string | null
  bank_reg_no: string | null
  bank_account_no: string | null
  iban: string | null
  payment_reference: string | null
  due_date: string | null
  confidence: number
  uncertain_fields: string[]
  notes: string | null
}

/**
 * Betalingsid fylder op til 16 cifre: 15 cifres identifikation plus et
 * mod10-kontrolciffer. Kortart 01 har intet betalingsid, derfor `{0,16}`.
 */
const FIK_LINE_RE = /^\+(\d{2})<(\d{0,16})\+(\d{8})</
const FIK_PAYMENT_ID_FULL_LENGTH = 16
const FIK_CARD_TYPES = new Set(['01', '04', '15', '71', '73', '75'])

function digitsOnly(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const d = value.replace(/\D/g, '')
  return d.length > 0 ? d : null
}

/**
 * Modulus 10 med vægtene 1-2-1-2 fra højre (Luhn). Sidste ciffer i et
 * FIK-betalingsid er kontrolciffer, så en fejllæst ciffer fanges her.
 */
function passesMod10(digits: string): boolean {
  let sum = 0
  let double = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48
    if (double) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    double = !double
  }
  return sum % 10 === 0
}

/**
 * Rens og valider betalingsfelterne før de sendes til klienten.
 *
 * Et forkert kontonummer er værre end intet kontonummer: brugeren kopierer det
 * direkte i netbanken uden at kontrollere. Felter der ikke har et gyldigt
 * format nulstilles derfor, og et betalingsid der ikke består mod10-kontrollen
 * markeres som usikkert, så UI'et kan bede brugeren tjekke det efter.
 */
function normalizePaymentFields(raw: ExtractionResult): ExtractionResult {
  const out: ExtractionResult = {
    ...raw,
    uncertain_fields: Array.isArray(raw.uncertain_fields) ? [...raw.uncertain_fields] : [],
  }

  // FIK-linjen er autoritativ: udled kortart/betalingsid/kreditornr fra den,
  // så delfelterne ikke kan komme i modstrid med linjen brugeren kopierer.
  const compactLine =
    typeof raw.fik_line === 'string' ? raw.fik_line.replace(/\s+/g, '') : ''
  const m = FIK_LINE_RE.exec(compactLine)
  if (m && FIK_CARD_TYPES.has(m[1])) {
    // Genopbyg fra capture-grupperne: regexet er ikke ankret i højre ende, så
    // compactLine kan have hale-tegn med som ikke hører til linjen.
    out.fik_line = `+${m[1]}<${m[2]}+${m[3]}<`
    out.fik_card_type = m[1]
    out.fik_payment_id = m[2] || null
    out.fik_creditor_no = m[3]
    // Kun fuldlange betalingsid (16 cifre) mod10-kontrolleres — det er der
    // kontrolcifferet sidder. Fejl markeres, men linjen kasseres ikke: modellen
    // kan have læst rigtigt på en korttype vi ikke kender kontrolreglen for.
    if (
      out.fik_payment_id?.length === FIK_PAYMENT_ID_FULL_LENGTH &&
      !passesMod10(out.fik_payment_id)
    ) {
      console.warn('FIK-betalingsid fejler mod10 — markeret som usikkert')
      if (!out.uncertain_fields.includes('fik_line')) out.uncertain_fields.push('fik_line')
    }
  } else {
    if (compactLine) {
      console.warn('Kasserer FIK-linje med ugyldigt format', compactLine.slice(0, 40))
    }
    out.fik_line = null
    out.fik_card_type = null
    out.fik_payment_id = null
    out.fik_creditor_no = null
  }

  const reg = digitsOnly(raw.bank_reg_no)
  out.bank_reg_no = reg && reg.length === 4 ? reg : null
  const acct = digitsOnly(raw.bank_account_no)
  out.bank_account_no = acct && acct.length <= 10 ? acct : null

  const iban =
    typeof raw.iban === 'string' ? raw.iban.replace(/\s+/g, '').toUpperCase() : ''
  out.iban = /^DK\d{16}$/.test(iban) ? iban : null

  out.due_date =
    typeof raw.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.due_date)
      ? raw.due_date
      : null

  // Metoden skal afspejle det der faktisk overlevede valideringen.
  if (out.fik_line) out.payment_method = 'fik'
  else if (out.bank_reg_no && out.bank_account_no) out.payment_method = 'bank_transfer'
  else if (out.iban) out.payment_method = 'iban'
  else if (out.payment_method !== 'mobilepay') out.payment_method = null

  return out
}

serveWithSentry('voucher-extract', async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  // Auth: kræver gyldigt Supabase JWT
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse({ error: 'Ikke logget ind' }, 401)
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const auth = await fetchAuthV1User(supabaseUrl, anonKey, authHeader)
  if (!auth.ok) {
    return jsonResponse({ error: 'Ikke logget ind' }, 401)
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY mangler i secrets')
    return jsonResponse({ error: 'AI-bilagslæsning er ikke konfigureret.' }, 503)
  }

  let body: { image_base64?: string; image_mime_type?: string }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }

  const imageBase64 = (body.image_base64 ?? '').trim()
  const mimeType = (body.image_mime_type ?? 'image/jpeg').trim()
  if (!imageBase64) {
    return jsonResponse({ error: 'image_base64 mangler' }, 400)
  }
  if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
    return jsonResponse(
      { error: `Ikke-understøttet billedformat: ${mimeType}. Brug JPEG, PNG, GIF eller WebP.` },
      400,
    )
  }

  // Sanity-check: base64 over ~10MB er sandsynligvis et problem (Anthropic-grænse er 5MB pr billede).
  if (imageBase64.length > 14_000_000) {
    return jsonResponse(
      { error: 'Billedet er for stort. Nedskaler til <5MB før upload.' },
      413,
    )
  }

  const anthropicReq = {
    model: ANTHROPIC_MODEL,
    max_tokens: MAX_TOKENS,
    // Adaptiv tænkning lader modellen bruge ekstra tokens på de bilag der er
    // svære at læse, og springe den over på de nemme.
    thinking: { type: 'adaptive' },
    // `xhigh` er det anbefalede niveau til de sværeste opgaver på Sonnet 5;
    // `high` er default og ville altså ikke ændre noget.
    output_config: { effort: 'xhigh' },
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: 'tool', name: EXTRACTION_TOOL.name },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mimeType, data: imageBase64 },
          },
          { type: 'text', text: 'Udlæs bilaget og indsend felterne via værktøjet.' },
        ],
      },
    ],
  }

  let anthropicRes: Response
  try {
    anthropicRes = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify(anthropicReq),
    })
  } catch (e) {
    console.error('Anthropic fetch fejlede', e)
    return jsonResponse({ error: 'Kunne ikke kontakte AI-tjenesten.' }, 502)
  }

  if (!anthropicRes.ok) {
    const text = await anthropicRes.text()
    console.warn('Anthropic API fejl', anthropicRes.status, text.slice(0, 500))
    if (anthropicRes.status === 429) {
      return jsonResponse({ error: 'AI-tjenesten er overbelastet — prøv igen om lidt.' }, 429)
    }
    return jsonResponse({ error: 'AI-bilagslæsning fejlede.' }, 502)
  }

  const json = (await anthropicRes.json()) as {
    content?: Array<{ type: string; name?: string; input?: ExtractionResult }>
    stop_reason?: string
    usage?: {
      input_tokens?: number
      output_tokens?: number
      cache_creation_input_tokens?: number
      cache_read_input_tokens?: number
    }
  }

  const toolUse = json.content?.find(
    (b) => b.type === 'tool_use' && b.name === EXTRACTION_TOOL.name,
  )
  if (!toolUse?.input) {
    // stop_reason skiller de to årsager fra hinanden: 'max_tokens' betyder at
    // tænkningen åd budgettet og afkortede tool-kaldet (hæv MAX_TOKENS),
    // 'refusal' at sikkerhedsfiltret afviste billedet. Uden den er de ens i loggen.
    console.warn(
      'Intet tool_use-svar fra Anthropic',
      `stop_reason=${json.stop_reason ?? 'ukendt'}`,
      `output_tokens=${json.usage?.output_tokens ?? '?'}`,
      JSON.stringify(json).slice(0, 500),
    )
    if (json.stop_reason === 'max_tokens') {
      return jsonResponse(
        { error: 'Bilaget var for komplekst at læse færdigt. Prøv at beskære billedet.' },
        502,
      )
    }
    return jsonResponse({ error: 'AI-tjenesten returnerede ikke et gyldigt svar.' }, 502)
  }

  return jsonResponse({
    ok: true,
    source: 'claude-sonnet-vision',
    result: normalizePaymentFields(toolUse.input),
    usage: json.usage,
  })
})
