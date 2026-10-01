import { Badge } from "@/design-system/atomy/Badge/Badge";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Hint } from "@/design-system/atomy/Hint/Hint";
import { Num } from "@/design-system/atomy/Num/Num";
import { Text } from "@/design-system/atomy/Text/Text";
import { ListRow } from "@/design-system/molekuly/ListRow/ListRow";
import { RecordList } from "@/design-system/organizmy/RecordList/RecordList";
import { FORMY_SPRAW, jednostka, TEKST_BRAK_SPRAW, TYTUL_LISTY, type WidokPulpitu, type WierszSprawy } from "./widok";
import style from "./PulpitAdministracji.module.css";

interface WlasciwosciListySpraw {
  widok: WidokPulpitu;
  naNieprawidlowyAdres: (tresc: string) => void;
  naOdswiez: () => void;
}

function plakietkaWiersza(liczba: number) {
  return liczba > 0
    ? { wariant: "warn" as const, tekst: "czeka na decyzję" }
    : { wariant: "neutral" as const, tekst: "brak spraw" };
}

/**
 * Wiersz kolejki, której administracja nie otwiera: plakietka, tytuł,
 * adnotacja i liczba — bez akcji (ani odnośnika, ani przycisku nieaktywnego).
 * Od 640 px za liczbą stoi puste, niewidoczne miejsce o rozmiarze akcji
 * „Otwórz” sąsiednich wierszy, żeby liczba stała w ich kolumnie.
 * `ListRow` i `RecordList` wymagają akcji w każdym wierszu, więc ten jeden
 * wiersz składa się z tych samych atomów i ma układ wiersza `ListRow`
 * (`PulpitAdministracji.module.css`, `.wiersz`).
 */
function WierszBezAkcji({ wiersz }: { wiersz: WierszSprawy }) {
  const plakietka = plakietkaWiersza(wiersz.liczba);
  return (
    <div className={style.wiersz} data-wariant="z-licznikiem">
      <div className={style.tresc}>
        <div className={style.naglowek}>
          <span className={style.plakietka}>
            <Badge wariant={plakietka.wariant}>{plakietka.tekst}</Badge>
          </span>
          <Text>{wiersz.nazwa}</Text>
        </div>
        {wiersz.podlinia && <Hint>{wiersz.podlinia}</Hint>}
      </div>
      <div className={style.akcje}>
        <Num wartosc={wiersz.liczba} etykieta={jednostka(wiersz.liczba, FORMY_SPRAW)} />
        {/* Puste miejsce po akcji sąsiednich wierszy: liczba stoi w tej samej kolumnie co ich liczby. Nic w nim nie ma. */}
        <span className={style.miejsceAkcji} aria-hidden="true" />
      </div>
    </div>
  );
}

/**
 * Lista „Co czeka na decyzję”. Wiersze z akcją to `ListRow` (akcja „Otwórz”
 * z adresem z odpowiedzi serwera), wiersz kolejki bez akcji to
 * `WierszBezAkcji`; nagłówek, suma „Razem” i stan pusty jak w `RecordList`,
 * którego używa stan pusty.
 */
export function ListaSpraw({ widok, naNieprawidlowyAdres, naOdswiez }: WlasciwosciListySpraw) {
  if (widok.brakSpraw) {
    return (
      <RecordList
        tytul={TYTUL_LISTY}
        stopienNaglowka={2}
        jednostkaSumy={(liczba) => jednostka(liczba, FORMY_SPRAW)}
        wiersze={[]}
        pusty={{
          naglowek: TEKST_BRAK_SPRAW,
          tresc: "Nic nie czeka na decyzję administracji. Nowe sprawy pojawią się tutaj.",
          przycisk: { etykieta: "Odśwież", onClick: naOdswiez },
        }}
      />
    );
  }

  return (
    <section className={style.sekcja} aria-label={TYTUL_LISTY}>
      <Heading stopien={2}>{TYTUL_LISTY}</Heading>
      <div className={style.lista}>
        {widok.wiersze.map((wiersz) =>
          wiersz.otwierany ? (
            <ListRow
              key={wiersz.id}
              wariant="z-licznikiem"
              tytul={wiersz.nazwa}
              plakietka={plakietkaWiersza(wiersz.liczba)}
              licznik={{ wartosc: wiersz.liczba, etykieta: jednostka(wiersz.liczba, FORMY_SPRAW) }}
              akcja={{
                etykieta: "Otwórz",
                etykietaDostepna: `Otwórz: ${wiersz.nazwa}`,
                ...(wiersz.link
                  ? { href: wiersz.link }
                  : { onKliknij: () => naNieprawidlowyAdres("Adres tych spraw z odpowiedzi serwera jest nieprawidłowy.") }),
              }}
            />
          ) : (
            <WierszBezAkcji key={wiersz.id} wiersz={wiersz} />
          ),
        )}
      </div>
      <div className={style.stopka}>
        <span>Razem</span>
        {/* Liczba z tym samym pustym miejscem po akcji co wiersze (od 640 px): stoi w kolumnie ich liczb, nie przy prawej krawędzi. */}
        <div className={style.liczbaStopki}>
          <Num wartosc={widok.razem} etykieta={jednostka(widok.razem, FORMY_SPRAW)} />
          <span className={style.miejsceAkcji} aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}
