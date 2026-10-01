import { RecordList, type KolumnaRecordList } from "@/design-system/organizmy/RecordList/RecordList";
import { FORMY_SPRAW, jednostka, TEKST_BRAK_SPRAW, TYTUL_LISTY, type WidokPulpitu } from "./widok";

interface WlasciwosciListySpraw {
  widok: WidokPulpitu;
  naNieprawidlowyAdres: (tresc: string) => void;
  naOdswiez: () => void;
}

/** Kolumny listy spraw: kolejka (pod nazwą adnotacja), stan, liczba spraw do prawej, akcja na końcu. */
export const KOLUMNY_KOLEJEK: KolumnaRecordList[] = [
  { nazwa: "Kolejka", rodzaj: "tekst" },
  { nazwa: "Stan", rodzaj: "stan" },
  { nazwa: "Liczba", rodzaj: "liczba" },
  { nazwa: "Akcja", rodzaj: "akcja" },
];

function plakietkaWiersza(liczba: number) {
  return liczba > 0
    ? { wariant: "warn" as const, tekst: "czeka na decyzję" }
    : { wariant: "neutral" as const, tekst: "brak spraw" };
}

/**
 * Lista „Co czeka na decyzję” — `RecordList` w kolumnach. Wiersz z akcją niesie
 * „Otwórz” z adresem z odpowiedzi serwera; wiersz kolejki, której administracja
 * nie otwiera, nie ma akcji wcale (ani odnośnika, ani przycisku nieaktywnego) i
 * pokazuje adnotację pod nazwą. Liczby wierszy i suma „Razem” stoją w jednej
 * kolumnie; sumę liczy organizm z tych samych wierszy.
 */
export function ListaSpraw({ widok, naNieprawidlowyAdres, naOdswiez }: WlasciwosciListySpraw) {
  return (
    <RecordList
      tytul={TYTUL_LISTY}
      stopienNaglowka={2}
      jednostkaSumy={(liczba) => jednostka(liczba, FORMY_SPRAW)}
      kolumny={KOLUMNY_KOLEJEK}
      wiersze={
        widok.brakSpraw
          ? []
          : widok.wiersze.map((wiersz) => {
              const wspolne = {
                id: wiersz.id,
                tytul: wiersz.nazwa,
                podpowiedz: wiersz.podlinia ?? undefined,
                plakietka: plakietkaWiersza(wiersz.liczba),
                wartosc: wiersz.liczba,
              };
              if (!wiersz.otwierany) return wspolne;
              return {
                ...wspolne,
                akcja: {
                  etykieta: "Otwórz",
                  etykietaDostepna: `Otwórz: ${wiersz.nazwa}`,
                  ...(wiersz.link
                    ? { href: wiersz.link }
                    : {
                        onKliknij: () =>
                          naNieprawidlowyAdres("Adres tych spraw z odpowiedzi serwera jest nieprawidłowy."),
                      }),
                },
              };
            })
      }
      pusty={{
        naglowek: TEKST_BRAK_SPRAW,
        tresc: "Nic nie czeka na decyzję administracji. Nowe sprawy pojawią się tutaj.",
        przycisk: { etykieta: "Odśwież", onClick: naOdswiez },
      }}
    />
  );
}
