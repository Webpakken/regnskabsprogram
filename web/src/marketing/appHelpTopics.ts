import { marketingFaqs } from '@/marketing/marketingData'

export type AppHelpTopic = {
  id: string
  title: string
  body: string
  /** Ekstra ord til søgning (emner der ikke står ordret i titel/tekst). */
  searchExtra?: string
}

/**
 * Emner i appens «Hjælp & svar» — samme indhold som marketing-FAQ, plus korte emnetitler som i produktet.
 */
export const appHelpTopics: AppHelpTopic[] = [
  {
    id: 'bogforing',
    title: 'Bogføringsloven (kort)',
    body: marketingFaqs[0].a,
    searchExtra: 'lov bogføring bilag opbevaring dokumentation',
  },
  {
    id: 'cvr',
    title: 'CVR-opslag på kunder',
    body: 'Når du opretter eller retter en kunde, kan du slå virksomheden op på CVR, så navn og adresse udfyldes automatisk. Samme mønster ved oprettelse af virksomhed i Bilago.',
    searchExtra: 'cvr virksomhed kunde adresse',
  },
  {
    id: 'skift',
    title: 'Skifte fra andet system',
    body: marketingFaqs[1].a,
    searchExtra: 'skifte regnskab system flytte',
  },
  {
    id: 'revisor',
    title: 'Revisor: download alle bilag og fakturaer',
    body: 'Inviter din revisor under «Medlemmer» med rollen Revisor — den giver læseadgang og eksport, men ikke adgang til at ændre virksomhedens opsætning. Revisoren går derefter til Indstillinger → Eksport og henter alle bilag og fakturaer som én ZIP-fil. Du kan også selv hente ZIP-filen samme sted, fx til arkiv, eller hvis revisoren ikke skal have en bruger i Bilago.',
    searchExtra: 'revisor bogholder eksport export zip download arkiv årsregnskab aflevere materiale',
  },
  {
    id: 'binding',
    title: 'Binding',
    body: marketingFaqs[2].a,
    searchExtra: 'opsige opsigelse måned',
  },
  {
    id: 'pris',
    title: 'Pris og introtilbud',
    body: marketingFaqs[3].a,
    searchExtra: 'koster abonnement kr md',
  },
  {
    id: 'prove',
    title: 'Gratis prøveperiode',
    body: marketingFaqs[4].a,
    searchExtra: 'gratis prøve dage kort',
  },
  {
    id: 'moms',
    title: 'Moms i Bilago',
    body: 'Under «Moms» i menuen kan du se salg (udgående fakturaer) og køb (bilag) i den valgte periode og få overblik over momstilsvar. Tallene bygger på dine registrerede fakturaer og bilag.',
    searchExtra: 'moms skat kvartal angivelse køb salg momstilsvar',
  },
  {
    id: 'ean',
    title: 'EAN og fakturaoplysninger',
    body: 'På fakturaer kan du angive kundens EAN, hvis de kræver det til elektronisk fakturering. Kontakt support, hvis du er i tvivl om, hvordan jeres kunder vil have fakturaen leveret.',
    searchExtra: 'ean elektronisk faktura fakturering',
  },
]
