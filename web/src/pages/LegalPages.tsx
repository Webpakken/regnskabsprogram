import { Link } from 'react-router-dom'
import { MarketingShell, useMarketingPublicSettings } from '@/components/MarketingShell'

function LegalBody({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
      <div className="space-y-6 text-sm leading-relaxed text-slate-700">{children}</div>
      <p className="mt-10 text-xs text-slate-500">
        Sidst opdateret: april 2026. Kontakt os ved spørgsmål — vi opdaterer dokumenterne løbende.
      </p>
    </main>
  )
}

function ContactBlock() {
  const pub = useMarketingPublicSettings()
  const email = pub?.contact_email?.trim() || 'support@bilago.dk'
  return (
    <p>
      Skriv til{' '}
      <a href={`mailto:${email}`} className="font-medium text-indigo-600 hover:text-indigo-800">
        {email}
      </a>
      .
    </p>
  )
}

export function HandelsbetingelserPage() {
  return (
    <MarketingShell pageTitle="Handelsbetingelser">
      <LegalBody>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Handelsbetingelser</h1>
        <p>
          Disse betingelser gælder mellem dig (&quot;kunden&quot;) og Bilago (&quot;vi&quot;, &quot;os&quot;) ved brug af
          tjenesten bilago.dk og tilhørende produkter (herefter &quot;Tjenesten&quot;).
        </p>
        <h2 className="pt-2 text-base font-semibold text-slate-900">1. Tjenesten</h2>
        <p>
          Bilago leverer software til fakturering, bilag, moms m.m. Funktioner og tilgængelighed kan udvikles over
          tid. Vi tilstræber høj oppetid men garanterer ikke uafbrudt drift.
        </p>
        <h2 className="pt-2 text-base font-semibold text-slate-900">2. Abonnement og betaling</h2>
        <p>
          Adgang til visse dele af Tjenesten kræver aktivt abonnement efter gældende priser. Betaling sker via den
          udbyder (fx Stripe), vi linker til fra kontoen. Opsigelse sker efter de fremgår i produktet eller på
          fakturaen for abonnementet.
        </p>
        <h2 className="pt-2 text-base font-semibold text-slate-900">3. Dit ansvar og data</h2>
        <p>
          Du er ansvarlig for indhold, du lægger ind (fakturaer, bilag m.m.) og for at overholde gældende lovgivning.
          Du må ikke misbruge Tjenesten. Du ejer dine egne data; vi behandler dem som beskrevet i privatlivspolitikken
          og — for B2B-kunder — i databehandleraftalen.
        </p>
        <h2 className="pt-2 text-base font-semibold text-slate-900">4. Immaterielle rettigheder</h2>
        <p>
          Bilago og licensgivere tilhører al software, design og varemærker. Du får en tidsbegrænset, ikke-eksklusiv
          ret til at bruge Tjenesten i henhold til dit abonnement.
        </p>
        <h2 className="pt-2 text-base font-semibold text-slate-900">5. Ansvarsbegrænsning</h2>
        <p>
          Tjenesten leveres &quot;som den er&quot;. I det omfang loven tillader det, er vi ikke erstatningsansvarlige
          for indirekte tab, driftstab eller tab af data. Dit brug af regnskabs- og skattemæssig rådgivning sker på
          eget ansvar.
        </p>
        <h2 className="pt-2 text-base font-semibold text-slate-900">6. Lov og værneting</h2>
        <p>
          Dansk ret finder anvendelse. Eventuelle tvister søges løst i mindelighed; i øvrigt kan sager indbringes for
          domstolene i Danmark.
        </p>
        <ContactBlock />
      </LegalBody>
    </MarketingShell>
  )
}

export function PrivatlivspolitikPage() {
  return (
    <MarketingShell pageTitle="Privatlivspolitik">
      <LegalBody>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Privatlivspolitik</h1>
        <p>
          Vi respekterer dit privatliv. Denne politik beskriver, hvordan Bilago behandler personoplysninger i
          forbindelse med bilago.dk og Tjenesten.
        </p>
        <h2 className="pt-2 text-base font-semibold text-slate-900">1. Dataansvarlig</h2>
        <p>
          For oplysninger om kontoindehavere og besøgende på marketing-sider fungerer Bilago som dataansvarlig.
        </p>
        <ContactBlock />
        <h2 className="pt-2 text-base font-semibold text-slate-900">2. Hvilke oplysninger?</h2>
        <ul className="list-inside list-disc space-y-2">
          <li>Kontodata: navn, e-mail, virksomhedsoplysninger, du selv indtaster.</li>
          <li>Drift: logfiler, tekniske hændelser og sikkerhedsrelateret information.</li>
          <li>Betalingsdata behandles af betalingsudbyder; vi lagrer ikke fulde kortnumre.</li>
        </ul>
        <h2 className="pt-2 text-base font-semibold text-slate-900">3. Formål og retsgrundlag</h2>
        <p>
          Vi behandler data for at levere og forbedre Tjenesten, opfylde kontrakt (art. 6(1)(b) GDPR), opfylde
          retlige forpligtelser (art. 6(1)(c)) og, hvor relevant, berettiget interesse i sikkerhed og analyse (art.
          6(1)(f)).
        </p>
        <h2 className="pt-2 text-base font-semibold text-slate-900">4. Databehandlere</h2>
        <p>
          Vi anvender underleverandører (fx hosting og betaling). De må kun behandle data efter vores instruks og
          under passende sikkerhed.
        </p>
        <h2 className="pt-2 text-base font-semibold text-slate-900">5. Opbevaring</h2>
        <p>
          Vi opbevarer oplysninger, så længe det er nødvendigt for formålet eller som loven kræver (fx bogførings- og
          hvidvaskregler kan påvirke opbevaring af transaktionsdata).
        </p>
        <h2 className="pt-2 text-base font-semibold text-slate-900">6. Dine rettigheder</h2>
        <p>
          Du har efter GDPR bl.a. ret til indsigt, berigtigelse, sletning, begrænsning og dataportabilitet, samt ret
          til at gøre indsigelse mod visse behandlinger. Du kan klage til Datatilsynet.
        </p>
      </LegalBody>
    </MarketingShell>
  )
}

export function CookiepolitikPage() {
  return (
    <MarketingShell pageTitle="Cookiepolitik">
      <LegalBody>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Cookiepolitik</h1>
        <p>
          Når du besøger bilago.dk, kan der sættes cookies eller anvendes tilsvarende teknologi i browseren (fx
          localStorage til præferencer).
        </p>
        <h2 className="pt-2 text-base font-semibold text-slate-900">1. Nødvendige</h2>
        <p>
          Nødvendige cookies sørger for login, sikkerhed og grundlæggende funktion. De kan ikke fravælges, hvis du
          vil bruge Tjenesten.
        </p>
        <h2 className="pt-2 text-base font-semibold text-slate-900">2. Valgfrie</h2>
        <p>
          Valgfrie cookies (fx til analyse eller forbedring af produktet) kræver dit samtykke. Du kan til enhver tid
          ændre dit valg via cookie-banneret, når det vises.
        </p>
        <h2 className="pt-2 text-base font-semibold text-slate-900">3. Tredjeparter</h2>
        <p>
          Hvis vi indlejrer tjenester fra tredjemand (fx betaling eller support), kan deres cookies gælde efter deres
          egne politikker — vi henviser til deres dokumentation.
        </p>
        <p className="pt-2">
          Læs også{' '}
          <Link to="/privatlivspolitik" className="font-medium text-indigo-600 hover:text-indigo-800">
            privatlivspolitikken
          </Link>
          .
        </p>
        <ContactBlock />
      </LegalBody>
    </MarketingShell>
  )
}

export function DatabehandleraftalePage() {
  return (
    <MarketingShell pageTitle="Databehandleraftale">
      <LegalBody>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Databehandleraftale (DPA)</h1>
        <p>
          Når du som virksomhed bruger Bilago til at behandle personoplysninger om dine egne kunder eller
          medarbejdere i Tjenesten, er du typisk dataansvarlig, og Bilago er databehandler. Denne side beskriver de
          væsentlige forpligtelser i det forhold.
        </p>
        <h2 className="pt-2 text-base font-semibold text-slate-900">1. Instruks</h2>
        <p>
          Vi behandler kun personoplysninger efter dine dokumenterede instrukser gennem brugen af produktet, medmindre
          anden behandling kræves ved EU- eller medlemsstatslig ret.
        </p>
        <h2 className="pt-2 text-base font-semibold text-slate-900">2. Fortrolighed og sikkerhed</h2>
        <p>
          Personer, der behandler data under vores ansvar, er underlagt fortrolighed. Vi implementerer passende
          tekniske og organisatoriske foranstaltninger (fx adgangskontrol, kryptering hvor relevant, logning).
        </p>
        <h2 className="pt-2 text-base font-semibold text-slate-900">3. Underdatabehandlere</h2>
        <p>
          Vi kan anvende underdatabehandlere (fx cloud-udbyder). Vi sikrer, at de er bundet af skriftlige aftaler med
          tilsvarende beskyttelse. Væsentlige ændringer underrettes efter aftale eller som beskrevet i produktet.
        </p>
        <h2 className="pt-2 text-base font-semibold text-slate-900">4. Assistance og sletning</h2>
        <p>
          Vi bistår dig med at opfylde anmodninger fra registrerede, i det omfang det er muligt. Efter ophør af
          aftalen sletter eller returnerer vi data efter jeres valg og gældende krav.
        </p>
        <h2 className="pt-2 text-base font-semibold text-slate-900">5. Overførsel uden for EU/EØS</h2>
        <p>
          Hvis data behandles uden for EU/EØS, sikrer vi passende garantier i henhold til GDPR (fx EU&apos;s
          standardkontraktbestemmelser), medmindre undtagelse gælder.
        </p>
        <ContactBlock />
      </LegalBody>
    </MarketingShell>
  )
}
