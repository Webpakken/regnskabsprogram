/**
 * Læs et bilag (kvittering, faktura, gebyrnotat) via Claude Haiku 4.5 vision.
 *
 * Klient sender base64-billede; vi kalder Anthropic Messages API med tool-use
 * for at tvinge struktureret JSON-output. System-prompten caches via prompt
 * caching (ephemeral, 5-min TTL) så følgende kald i samme session er billigere.
 *
 * Auth: kræver Supabase JWT — så kun loggede brugere kan brænde Anthropic-credits.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { fetchAuthV1User } from '../_shared/authV1User.ts'

const ANTHROPIC_MODEL = 'claude-haiku-4-5'
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

// Tilladte MIME-typer som Anthropic vision accepterer.
const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
])

const SYSTEM_PROMPT = `Du er en specialiseret udlæser af danske bilag — kvitteringer, fakturaer, kvitteringer, gebyrnotater og bank-bilag.

Læs bilaget og udtræk de strukturerede felter via værktøjet \`submit_bilag_extraction\`. Følg disse regler:

1. **Beløb i øre (cents):** danske bilag bruger komma som decimal og punktum som tusind-separator. "1.500,00 DKK" er 1500 kroner = 150000 øre. Returnér ALTID beløb i øre (gang kroner med 100 og rund til heltal).

2. **Total (\`total_cents\`):** det endelige beløb der skal betales. Pas på at IKKE forveksle subtotal/momsgrundlag med totalen. Foretræk linjer mærket: "TOTAL", "I alt", "AT BETALE", "TIL BETALING", "Gebyr i alt", "BELØB I ALT", "SAMLET", "BETALT", "Sum". Hvis bilaget viser flere beløb, vælg det øverste eller mest fremtrædende totale beløb.

3. **Forhandler (\`merchant\`):** typisk det fremtrædende navn/logo i toppen. Hvis logoet er stiliseret og du er i tvivl, kig efter "Velkommen til X", "Faktura fra X", eller selve firmanavnet over CVR-linjen. Strip parenteser med butiks-/branch-koder, fx "F24 (8132)" → "F24".

4. **Dato (\`expense_date\`):** ISO-format yyyy-mm-dd. Hvis bilaget har dansk format (dd.mm.yyyy eller dd-mm-yyyy), oversæt det. Hvis flere datoer: foretræk fakturadato/transaktionsdato over forfaldsdato.

5. **Moms (\`vat_cents\`, \`vat_rate\`):** dansk standard er 25%. Hvis bilaget tydeligt viser momsbeløb og momssats, returnér begge. For momsfri bilag (typisk bankgebyrer, fonde, foreningsindbetalinger): \`vat_rate: 0\`, \`vat_cents: 0\`. Hvis usikker, returnér \`null\`.

6. **Linjer (\`line_items\`):** maks 25 linjer. Beskrivelse + beløb i øre. Spring totaler/subtotaler/momslinjer over.

7. **Konfidens (\`confidence\`):** 0.0-1.0 vurdering af din samlede tillid til ekstraktionen. Sæt lavt (<0.5) hvis billedet er sløret, beskåret eller du gætter væsentlige felter.

8. **Returnér \`null\` for felter du ikke kan læse med rimelig sikkerhed.** Hellere ærligt null end gæt — brugeren kan udfylde manuelt.

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
      confidence: {
        type: 'number',
        description: 'Samlet konfidens 0.0-1.0.',
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
  confidence: number
  notes: string | null
}

serve(async (req: Request) => {
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
    max_tokens: 1024,
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
    console.warn('Intet tool_use-svar fra Anthropic', JSON.stringify(json).slice(0, 500))
    return jsonResponse({ error: 'AI-tjenesten returnerede ikke et gyldigt svar.' }, 502)
  }

  return jsonResponse({
    ok: true,
    source: 'claude-haiku-vision',
    result: toolUse.input,
    usage: json.usage,
  })
})
