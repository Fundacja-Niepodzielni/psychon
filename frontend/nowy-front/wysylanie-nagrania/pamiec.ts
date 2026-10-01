/**
 * To, co przeglądarka pamięta o niedokończonym wysyłaniu nagrania — tyle, ile
 * trzeba, żeby po wybraniu tego samego pliku dokończyć wysyłanie od miejsca,
 * w którym stanęło, i żeby powiedzieć osobie, której lekcji to dotyczy.
 *
 * Wpis NIGDY nie niesie pozwolenia na wysyłkę: ani podpisu, ani terminu jego
 * ważności, ani identyfikatorów nagrania i biblioteki. Pozwolenie wydaje
 * serwer od nowa przy każdym dokończeniu. Zapis buduje wpis wyłącznie z pól z
 * listy `POLA_WPISU`, więc pole spoza listy nie trafi do pamięci nawet wtedy,
 * gdy wołający poda je przez pomyłkę.
 */

export const KLUCZ_PAMIECI = "psychon.wysylanie-nagrania";

/** Po tym czasie od rozpoczęcia wysyłania wpis jest nieważny: wysyłanie zaczyna się od zera. */
export const WAZNOSC_WPISU_MS = 6 * 60 * 60 * 1000;

/** Odcisk pliku: po nim rozpoznajemy, że osoba wybrała ten sam plik. */
export interface OdciskPliku {
  nazwa: string;
  rozmiar: number;
  /** Data modyfikacji pliku, w milisekundach. */
  zmieniono: number;
}

export interface WpisWysylania extends OdciskPliku {
  idLekcji: number;
  /** Tytuł i adres strony lekcji — do zdania „Wysyłanie przerwane: …” i odnośnika „Dokończ”. */
  tytulLekcji: string;
  adresLekcji: string;
  /** Adres wgrania u dostawcy nagrań. */
  adresWgrania: string;
  /** Ile bajtów dostawca potwierdził — do zdania „Wysyłanie stanęło przy …”. */
  wyslano: number;
  /** Chwila rozpoczęcia wysyłania, w milisekundach. */
  zapisano: number;
}

/** Jedyne pola, które trafiają do pamięci przeglądarki. */
export const POLA_WPISU = [
  "idLekcji",
  "tytulLekcji",
  "adresLekcji",
  "adresWgrania",
  "nazwa",
  "rozmiar",
  "zmieniono",
  "wyslano",
  "zapisano",
] as const satisfies ReadonlyArray<keyof WpisWysylania>;

const POLA_LICZBOWE: ReadonlyArray<keyof WpisWysylania> = ["idLekcji", "rozmiar", "zmieniono", "wyslano", "zapisano"];

export function odciskPliku(plik: Pick<File, "name" | "size" | "lastModified">): OdciskPliku {
  return { nazwa: plik.name, rozmiar: plik.size, zmieniono: plik.lastModified };
}

/** Ten sam plik = ta sama nazwa, ten sam rozmiar i ta sama data modyfikacji. */
export function tenSamPlik(a: OdciskPliku, b: OdciskPliku): boolean {
  return a.nazwa === b.nazwa && a.rozmiar === b.rozmiar && a.zmieniono === b.zmieniono;
}

/** Wpis jest ważny krócej niż sześć godzin od rozpoczęcia wysyłania. */
export function czyWpisWazny(wpis: Pick<WpisWysylania, "zapisano">, teraz: number): boolean {
  const wiek = teraz - wpis.zapisano;
  return wiek >= 0 && wiek < WAZNOSC_WPISU_MS;
}

function poprawnyWpis(dane: unknown): WpisWysylania | null {
  if (typeof dane !== "object" || dane === null) return null;
  const pola = dane as Record<string, unknown>;
  for (const pole of POLA_WPISU) {
    const wartosc = pola[pole];
    const liczbowe = POLA_LICZBOWE.includes(pole);
    if (liczbowe ? typeof wartosc !== "number" || !Number.isFinite(wartosc) || wartosc < 0 : typeof wartosc !== "string") {
      return null;
    }
  }
  const wpis = Object.fromEntries(POLA_WPISU.map((pole) => [pole, pola[pole]])) as unknown as WpisWysylania;
  return wpis.wyslano <= wpis.rozmiar ? wpis : null;
}

export function usunWpis(magazyn: Storage | null): void {
  try {
    magazyn?.removeItem(KLUCZ_PAMIECI);
  } catch {
    // Pamięć przeglądarki niedostępna — nie ma czego usuwać.
  }
}

/** Zapisuje wpis; do pamięci trafiają wyłącznie pola z `POLA_WPISU`. */
export function zapiszWpis(magazyn: Storage | null, wpis: WpisWysylania): void {
  const tylkoDozwolone = Object.fromEntries(POLA_WPISU.map((pole) => [pole, wpis[pole]]));
  try {
    magazyn?.setItem(KLUCZ_PAMIECI, JSON.stringify(tylkoDozwolone));
  } catch {
    // Pamięć przeglądarki niedostępna albo pełna — wysyłanie trwa, tylko nie da się go potem dokończyć.
  }
}

/**
 * Ważny wpis z pamięci albo `null`. Wpis uszkodzony albo starszy niż sześć
 * godzin jest przy okazji usuwany — osoba nie jest o niego pytana.
 */
export function czytajWpis(magazyn: Storage | null, teraz: number): WpisWysylania | null {
  let surowy: string | null = null;
  try {
    surowy = magazyn?.getItem(KLUCZ_PAMIECI) ?? null;
  } catch {
    return null;
  }
  if (surowy === null) return null;
  let wpis: WpisWysylania | null = null;
  try {
    wpis = poprawnyWpis(JSON.parse(surowy));
  } catch {
    wpis = null;
  }
  if (wpis === null || !czyWpisWazny(wpis, teraz)) {
    usunWpis(magazyn);
    return null;
  }
  return wpis;
}
