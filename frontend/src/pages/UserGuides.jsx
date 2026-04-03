const gettingStartedSteps = [
  {
    number: '1',
    title: 'Opprett eller sjekk kontoene dine',
    text: 'Start med å opprette kontoene du vil følge opp, for eksempel brukskonto, sparekonto eller kredittkort.',
  },
  {
    number: '2',
    title: 'Last opp transaksjoner',
    text: 'Gå til Transaksjoner og importer CSV-filer fra banken. Se Guide 2 for hvordan du laster ned og klargjør CSV-filen før opplasting.',
  },
  {
    number: '3',
    title: 'Kategoriser og legg til regler',
    text: 'Se gjennom transaksjonene og koble dem til riktige kategorier. Legg til søkeord under kategoriene for å få automatisk kategorisering senere.',
  },
  {
    number: '4',
    title: 'Sett opp budsjett og mål',
    text: 'Definer hvor mye du ønsker å bruke eller spare per måned, og opprett mål som gir retning for økonomien din.',
  },
  {
    number: '5',
    title: 'Følg utviklingen i dashboard og formue',
    text: 'Bruk dashboardet til å følge forbruket ditt og Formue-siden til å se hvordan eiendeler og gjeld utvikler seg over tid.',
  },
]

const csvGuideSteps = [
  {
    number: '1',
    title: 'Logg inn i nettbanken',
    text: 'Gå til banken din og åpne kontoen eller kredittkortet du vil hente transaksjoner fra.',
  },
  {
    number: '2',
    title: 'Finn eksport av transaksjoner',
    text: 'Se etter valg som Eksporter, Last ned transaksjoner eller CSV. Velg CSV-format hvis banken tilbyr flere formater. Hvis banken ikke tilbyr CSV direkte, eksporter i et annet mulig format og lagre filen som CSV lokalt på maskinen før opplasting.',
  },
  {
    number: '3',
    title: 'Velg riktig periode',
    text: 'Velg perioden du vil importere. Hvis du allerede har importert eldre transaksjoner, velg bare nye transaksjoner for å unngå unødvendige duplikater.',
  },
  {
    number: '4',
    title: 'Lagre filen på maskinen',
    text: 'Last ned filen og husk hvilken konto filen tilhører, for eksempel brukskonto, sparekonto eller Mastercard.',
  },
  {
    number: '5',
    title: 'Åpne Transaksjoner i Sparebuddy',
    text: 'Gå til siden Transaksjoner og velg riktig konto før du laster opp filen.',
  },
  {
    number: '6',
    title: 'Last opp CSV-filen',
    text: 'Trykk på opplastingsfeltet, velg CSV-filen fra maskinen og vent til importen er ferdig.',
  },
  {
    number: '7',
    title: 'Kontroller resultatet',
    text: 'Se gjennom de nye transaksjonene. Hvis noe er ukategorisert, kan du koble transaksjonen til en kategori eller legge til en regel for fremtidige importer.',
  },
]

const settingsGuideSteps = [
  {
    number: '1',
    title: 'Åpne Innstillinger',
    text: 'Gå til Innstillinger i menyen til venstre for å administrere profil, passord, familieinvitasjoner og kjente personer.',
  },
  {
    number: '2',
    title: 'Oppdater navn og e-post',
    text: 'Hold profilinformasjonen oppdatert slik at andre brukere ser riktig navn når du deler mål, transaksjoner og formuesposter.',
  },
  {
    number: '3',
    title: 'Bytt passord ved behov',
    text: 'Bruk passordfeltet hvis du vil endre innloggingen din. Etter endring må du logge inn på nytt.',
  },
  {
    number: '4',
    title: 'Inviter familiebrukere',
    text: 'Opprett en invitasjon for den nye brukeren. Sparebuddy lager en invitasjonskode som den nye brukeren bruker når kontoen opprettes.',
  },
  {
    number: '5',
    title: 'Se kjente personer',
    text: 'Når en invitert bruker har opprettet konto og aktivert invitasjonen, dukker vedkommende opp under Kjente personer og blir enklere å dele med.',
  },
]

const sharingGuideSteps = [
  {
    number: '1',
    title: 'Del fra riktig side',
    text: 'Du kan dele mål fra Mål, transaksjoner fra Transaksjoner og eiendeler eller gjeld fra Formue.',
  },
  {
    number: '2',
    title: 'Velg hvem du vil dele med',
    text: 'Velg en kjent person eller søk etter brukeren du vil dele med. Nye delinger opprettes som forespørsler.',
  },
  {
    number: '3',
    title: 'Mottakeren får et varsel',
    text: 'Den andre brukeren ser forespørselen under Varsler og må godta eller avslå før delingen blir aktiv.',
  },
  {
    number: '4',
    title: 'Avslag krever forklaring',
    text: 'Hvis mottakeren avslår, må vedkommende skrive en kort forklaring. Forklaringen vises til den som sendte forespørselen.',
  },
  {
    number: '5',
    title: 'Bruk Mellom oss som oversikt',
    text: 'Når delingen er aktiv, finner begge brukere samlet oversikt over delte ting, forespørsler og skyldig beløp på siden Mellom oss.',
  },
]

const goalsGuideSteps = [
  {
    number: '1',
    title: 'Velg riktig måltype',
    text: 'Du kan opprette sparemål, gjeldsmål eller mål for å redusere utgifter i en kategori.',
  },
  {
    number: '2',
    title: 'Sett periode og målbeløp',
    text: 'Velg startmåned, sluttdato og hvor mye du vil oppnå totalt. Du kan også angi en plan per måned.',
  },
  {
    number: '3',
    title: 'Koble målet til konto, gjeld eller kategori',
    text: 'Sparemål og gjeldsmål kan kobles til registrerte formuesposter. Utgiftsmål kan kobles til en kategori.',
  },
  {
    number: '4',
    title: 'Juster eksisterende mål',
    text: 'Bruk Juster-knappen hvis du vil oppdatere navn, beløp, måneder, deling eller koblinger på et mål du allerede har opprettet.',
  },
  {
    number: '5',
    title: 'Del mål ved behov',
    text: 'Mål kan deles med andre brukere. Delingen blir ikke aktiv før mottakeren godtar forespørselen.',
  },
]

const assetsGuideSteps = [
  {
    number: '1',
    title: 'Registrer første verdi',
    text: 'Gå til Formue og registrer en eiendel eller gjeldspost med navn, type, verdi og dato.',
  },
  {
    number: '2',
    title: 'Bruk Oppdater verdi for historikk',
    text: 'Når saldoen eller gjelden endrer seg, bruk Oppdater verdi i stedet for å overskrive posten. Da bygges historikken opp over tid.',
  },
  {
    number: '3',
    title: 'Se utvikling over tid',
    text: 'Grafen viser eiendeler, gjeld eller nettoformue over tid. Du kan bytte serie og velge tidsperiode.',
  },
  {
    number: '4',
    title: 'Bruk historikk på enkeltposter',
    text: 'Trykk på en post for å se utviklingen i akkurat den kontoen eller gjelden og kontrollere tidligere registreringer.',
  },
  {
    number: '5',
    title: 'Del formuesposter når det er relevant',
    text: 'Hvis en konto eller gjeld er felles, kan du dele den med en annen bruker slik at begge kan følge utviklingen.',
  },
]

export default function UserGuides() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">User guides</h1>
        <p className="text-sm text-gray-500 mt-1">
          Enkle steg-for-steg guider som hjelper brukeren i gang med Sparebuddy.
        </p>
      </div>

      <div className="space-y-8">
        <GuideSection
          badge="Guide 1"
          title="Velkommen til Sparebuddy"
          description="Velkommen til Sparebuddy. Vi hjelper deg å få kontroll på privatøkonomien. Start her hvis du er ny i løsningen."
          steps={gettingStartedSteps}
        />

        <GuideSection
          badge="Guide 2"
          title="Hvordan laste opp CSV-fil fra banken"
          description="Bruk denne guiden når du vil hente transaksjoner fra banken og importere dem til Sparebuddy."
          steps={csvGuideSteps}
          footer={(
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5">
              <h3 className="text-base font-semibold text-gray-900 mb-3">Hvordan CSV-filen bør være strukturert</h3>
              <p className="text-sm text-gray-600 leading-6 mb-4">
                Sparebuddy støtter bankfiler der hver rad representerer én transaksjon, og der dato, tekst og beløp eller inn/ut-beløp finnes som egne kolonner.
              </p>
              <div className="grid gap-3 text-sm text-gray-700">
                <p><span className="font-semibold">Typiske kolonner som fungerer:</span> `Dato`, `Forklaring` eller `Forklaringstekst`, samt `Beløp` eller egne kolonner for `Inn` og `Ut`.</p>
                <p><span className="font-semibold">Kortfiler støttes også:</span> for eksempel eksport med kolonner som `Beløpet gjelder`, `Inn` og `Ut`.</p>
                <p><span className="font-semibold">Viktig:</span> behold én transaksjon per rad og ikke slå sammen kolonner manuelt før opplasting.</p>
                <p><span className="font-semibold">Hvis du lagrer om filen selv:</span> bruk CSV-format, behold kolonneoverskrifter og sørg for at datoer og beløp fortsatt ligger i egne kolonner.</p>
              </div>
            </div>
          )}
        />

        <GuideSection
          badge="Guide 3"
          title="Hvordan bruke Innstillinger"
          description="Bruk denne guiden for å administrere profilen din, oppdatere passord og invitere nye familiemedlemmer."
          steps={settingsGuideSteps}
        />

        <GuideSection
          badge="Guide 4"
          title="Hvordan dele med andre brukere"
          description="Slik fungerer delingsforespørsler, varsler og oversikten på Mellom oss."
          steps={sharingGuideSteps}
        />

        <GuideSection
          badge="Guide 5"
          title="Hvordan sette opp og følge mål"
          description="Bruk målsiden for å planlegge sparing, nedbetaling av gjeld og reduksjon av forbruk."
          steps={goalsGuideSteps}
        />

        <GuideSection
          badge="Guide 6"
          title="Hvordan følge eiendeler og gjeld over tid"
          description="Slik bruker du Formue-siden til å bygge historikk, se utvikling og dele relevante poster."
          steps={assetsGuideSteps}
        />
      </div>
    </div>
  )
}

export function WelcomeGuideCard({ onComplete, loading = false }) {
  return (
    <div className="w-full max-w-2xl max-h-[85vh] rounded-3xl border border-gray-200 bg-white shadow-2xl overflow-hidden flex flex-col">
      <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-green-50 via-emerald-50 to-white">
        <p className="text-xs uppercase tracking-[0.18em] text-green-700 font-semibold mb-2">Velkommen</p>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Velkommen til Sparebuddy</h2>
        <p className="text-sm text-gray-600 max-w-xl leading-6">
          Vi hjelper deg å få kontroll på privatøkonomien. Følg stegene under for å komme i gang på en ryddig måte.
        </p>
      </div>

      <div className="px-6 py-5 space-y-4 overflow-y-auto">
        {gettingStartedSteps.map(step => (
          <GuideStep key={step.number} {...step} compact />
        ))}
      </div>

      <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-gray-500">
          Du finner denne guiden igjen senere under <span className="font-semibold text-gray-700">User guides</span>.
        </p>
        <button
          type="button"
          onClick={onComplete}
          disabled={loading}
          className="rounded-xl bg-green-600 px-5 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
        >
          {loading ? 'Lagrer...' : 'Kom i gang'}
        </button>
      </div>
    </div>
  )
}

function GuideSection({ badge, title, description, steps, footer = null }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-green-50 to-emerald-50">
        <p className="text-xs uppercase tracking-[0.18em] text-green-700 font-semibold mb-2">{badge}</p>
        <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-600 mt-2">{description}</p>
      </div>

      <div className="p-6 grid gap-6">
        {steps.map(step => (
          <GuideStep key={step.number} {...step} />
        ))}
      </div>

      {footer && <div className="px-6 pb-6">{footer}</div>}
    </section>
  )
}

function GuideStep({ number, title, text, compact = false }) {
  return (
    <div className={`flex items-start ${compact ? 'gap-3' : 'gap-4'}`}>
      <div className={`${compact ? 'w-8 h-8 text-xs' : 'w-9 h-9 text-sm'} shrink-0 rounded-full bg-green-600 text-white flex items-center justify-center font-semibold`}>
        {number}
      </div>
      <div>
        <h3 className={`${compact ? 'text-sm' : 'text-base'} font-semibold text-gray-900 mb-1`}>{title}</h3>
        <p className={`${compact ? 'text-xs leading-5' : 'text-sm leading-6'} text-gray-600`}>{text}</p>
      </div>
    </div>
  )
}
