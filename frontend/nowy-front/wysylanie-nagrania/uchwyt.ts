import type { GrupaTras } from "@/lib/api/h08-tematy";
import { zlecWgranieNagrania, type ZlecenieWgrania } from "@/nowy-front/lekcja-edycja/dane";
import { zlecWgranieNagraniaProwadzacego } from "@/nowy-front/rola-kursu/trasy-prowadzacego";
import { szacujPozostalyCzas } from "@/nowy-front/lekcja-edycja/nagranie";
import { odczytajPrzesuniecie, utworzWgranie, wyslijKawalki } from "@/nowy-front/lekcja-edycja/tus";
import { czyWpisWazny, czytajWpis, odciskPliku, tenSamPlik, usunWpis, zapiszWpis, type WpisWysylania } from "./pamiec";

/**
 * Uchwyt wysyłania nagrania. Żyje poza drzewem ekranów — w module, nie w
 * komponencie — więc przejście między ekranami panelu (kurs, inna lekcja,
 * lista kursów) nie odmontowuje go i nie przerywa wysyłania. Ekrany tylko go
 * czytają: pasek u góry ramy, wiersz lekcji na ekranie kursu i karta
 * „Nagranie” na stronie lekcji pokazują ten sam stan.
 *
 * Naraz trwa najwyżej jedno wysyłanie. Przerwane wysyłanie (zamknięta karta
 * przeglądarki, błąd sieci, „Przerwij wysyłanie”) da się dokończyć tym samym
 * plikiem: uchwyt prosi serwer o nowe pozwolenie, pyta dostawcę, ile bajtów
 * już ma, i wysyła resztę.
 */

export interface LekcjaWysylania {
  id: number;
  tytul: string;
  /** Adres strony lekcji w panelu. */
  adres: string;
  /** Grupa tras zlecenia wgrania; bez niej — trasa administracji. */
  grupa?: GrupaTras;
}

interface PlikWysylania {
  lekcja: LekcjaWysylania;
  nazwa: string;
  rozmiar: number;
  wyslano: number;
  /** Lekcja miała nagranie, zanim zaczęło się wysyłanie nowego; `null`, gdy nie wiadomo. */
  zastepuje: boolean | null;
}

export type StanWysylania =
  | { rodzaj: "brak" }
  | ({ rodzaj: "wysylanie"; zostaloSekund: number | null } & PlikWysylania)
  | ({ rodzaj: "przerwane"; innyPlik: boolean } & PlikWysylania)
  /** Plik jest u dostawcy w całości; nagranie czeka na przetworzenie. */
  | { rodzaj: "wyslane"; lekcja: LekcjaWysylania; zastepuje: boolean | null };

/**
 * `nowe` — wybór pliku w lekcji bez przerwanego wysyłania; `dokoncz` — wybór
 * pliku do dokończenia (inny plik to odmowa); `od-nowa` — osoba świadomie
 * wysyła inny plik od zera.
 */
export type TrybWysylania = "nowe" | "dokoncz" | "od-nowa";

export type WynikWysylania =
  | { rodzaj: "wyslane" }
  | { rodzaj: "przerwane" }
  | { rodzaj: "inny-plik" }
  /** Trwa już wysyłanie nagrania — tej albo innej lekcji. */
  | { rodzaj: "zajete"; lekcja: LekcjaWysylania }
  /** Wysyłanie się nie zaczęło: serwer albo dostawca odmówił. */
  | { rodzaj: "odmowa"; blad: unknown };

/** Pozwolenie z serwera; `resumed: true` znaczy, że serwer oddał to samo nagranie co poprzednio. */
type Pozwolenie = ZlecenieWgrania & { resumed?: boolean };

export interface ZaleznosciUchwytu {
  zlec: (idLekcji: number, tytul: string) => Promise<Pozwolenie>;
  /** Zlecenie wgrania z trasy prowadzącego — dla lekcji z `grupa: "instructor"`. */
  zlecProwadzacego?: (idLekcji: number, tytul: string) => Promise<Pozwolenie>;
  magazyn: () => Storage | null;
  teraz: () => number;
}

const BRAK: StanWysylania = { rodzaj: "brak" };

function przerwaneZWpisu(wpis: WpisWysylania, innyPlik = false): StanWysylania {
  return {
    rodzaj: "przerwane",
    lekcja: { id: wpis.idLekcji, tytul: wpis.tytulLekcji, adres: wpis.adresLekcji },
    nazwa: wpis.nazwa,
    rozmiar: wpis.rozmiar,
    wyslano: wpis.wyslano,
    zastepuje: null,
    innyPlik,
  };
}

export function utworzUchwyt(zaleznosci: ZaleznosciUchwytu) {
  let stan: StanWysylania = BRAK;
  let wczytano = false;
  let kontroler: AbortController | null = null;
  const sluchacze = new Set<() => void>();
  // Kopia wpisu na czas życia strony: gdy pamięć przeglądarki jest niedostępna, wysyłanie
  // da się dokończyć przynajmniej do przeładowania dokumentu.
  let kopiaWpisu: WpisWysylania | null = null;

  function zapisz(wpis: WpisWysylania) {
    kopiaWpisu = { ...wpis };
    zapiszWpis(zaleznosci.magazyn(), wpis);
  }

  function usun() {
    kopiaWpisu = null;
    usunWpis(zaleznosci.magazyn());
  }

  function czytaj(): WpisWysylania | null {
    const teraz = zaleznosci.teraz();
    const zPamieci = czytajWpis(zaleznosci.magazyn(), teraz);
    if (zPamieci !== null) return zPamieci;
    if (kopiaWpisu !== null && !czyWpisWazny(kopiaWpisu, teraz)) kopiaWpisu = null;
    return kopiaWpisu === null ? null : { ...kopiaWpisu };
  }

  function ustaw(nowy: StanWysylania) {
    stan = nowy;
    for (const sluchacz of sluchacze) sluchacz();
  }

  /** Pierwszy odczyt w przeglądarce: niedokończone wysyłanie z pamięci staje się stanem „przerwane”. */
  function wczytaj() {
    if (wczytano) return;
    wczytano = true;
    const wpis = czytaj();
    if (wpis !== null) stan = przerwaneZWpisu(wpis);
  }

  async function wyslij(
    plik: File,
    lekcja: LekcjaWysylania,
    tryb: TrybWysylania,
    opcje: { zastepuje?: boolean } = {},
  ): Promise<WynikWysylania> {
    wczytaj();
    if (stan.rodzaj === "wysylanie") return { rodzaj: "zajete", lekcja: stan.lekcja };
    if (plik.size === 0) return { rodzaj: "odmowa", blad: new Error("Plik nagrania jest pusty.") };

    const zapamietany = czytaj();
    const wpisLekcji = zapamietany !== null && zapamietany.idLekcji === lekcja.id ? zapamietany : null;
    const odcisk = odciskPliku(plik);
    const tenSam = wpisLekcji !== null && tenSamPlik(wpisLekcji, odcisk);

    if (tryb === "dokoncz" && wpisLekcji !== null && !tenSam) {
      ustaw(przerwaneZWpisu(wpisLekcji, true));
      return { rodzaj: "inny-plik" };
    }

    // Wpis, z którego da się jeszcze dokończyć wysyłanie; `null` = nie ma czego dokańczać.
    let doWznowienia: WpisWysylania | null = tryb !== "od-nowa" && tenSam ? wpisLekcji : null;
    const poprzedni = stan;
    const zastepuje =
      opcje.zastepuje ?? (poprzedni.rodzaj !== "brak" && poprzedni.lekcja.id === lekcja.id ? poprzedni.zastepuje : null);
    const wspolne = { lekcja, nazwa: plik.name, rozmiar: plik.size, zastepuje };
    const wlasny = new AbortController();
    kontroler = wlasny;
    ustaw({ rodzaj: "wysylanie", ...wspolne, wyslano: doWznowienia?.wyslano ?? 0, zostaloSekund: null });

    let pozwolenie: Pozwolenie;
    try {
      const zlec = lekcja.grupa === "instructor" ? zaleznosci.zlecProwadzacego : zaleznosci.zlec;
      // Lekcja prowadzącego nigdy nie idzie trasą administracji.
      if (zlec === undefined) throw new Error("Brak trasy zlecenia wgrania prowadzącego.");
      pozwolenie = await zlec(lekcja.id, lekcja.tytul);
    } catch (blad) {
      if (kontroler !== wlasny) return { rodzaj: "przerwane" };
      kontroler = null;
      ustaw(poprzedni.rodzaj === "przerwane" ? { ...poprzedni, innyPlik: false } : BRAK);
      return { rodzaj: "odmowa", blad };
    }
    if (kontroler !== wlasny) return { rodzaj: "przerwane" };

    try {
      let adresWgrania: string | null = null;
      let przesuniecie = 0;
      if (doWznowienia !== null && pozwolenie.resumed === true) {
        const uDostawcy = await odczytajPrzesuniecie(doWznowienia.adresWgrania, pozwolenie, plik.size, wlasny.signal);
        if (uDostawcy !== null) {
          adresWgrania = doWznowienia.adresWgrania;
          przesuniecie = uDostawcy;
        }
      }
      if (adresWgrania === null) {
        // Od zera: serwer wydał nowe nagranie albo dostawca nie zna już poprzedniego wgrania.
        doWznowienia = null;
        usun();
        adresWgrania = await utworzWgranie(plik, pozwolenie, lekcja.tytul, wlasny.signal);
      }
      doWznowienia = {
        idLekcji: lekcja.id,
        tytulLekcji: lekcja.tytul,
        adresLekcji: lekcja.adres,
        adresWgrania,
        ...odcisk,
        wyslano: przesuniecie,
        zapisano: doWznowienia?.zapisano ?? zaleznosci.teraz(),
      };
      zapisz(doWznowienia);

      const odBajtu = przesuniecie;
      const poczatek = zaleznosci.teraz();
      const trwaly = doWznowienia;
      await wyslijKawalki(
        plik,
        adresWgrania,
        pozwolenie,
        przesuniecie,
        (postep) => {
          if (kontroler !== wlasny) return;
          trwaly.wyslano = postep.wyslano;
          zapisz(trwaly);
          // Tempo liczy się z bajtów wysłanych teraz, nie z tych, które dostawca miał już wcześniej.
          const zostalo = szacujPozostalyCzas(postep.wyslano - odBajtu, postep.razem - odBajtu, zaleznosci.teraz() - poczatek);
          ustaw({ rodzaj: "wysylanie", ...wspolne, wyslano: postep.wyslano, zostaloSekund: zostalo });
        },
        wlasny.signal,
      );
      if (kontroler !== wlasny) return { rodzaj: "przerwane" };
      usun();
      kontroler = null;
      ustaw({ rodzaj: "wyslane", lekcja, zastepuje });
      return { rodzaj: "wyslane" };
    } catch (blad) {
      // Wysyłanie porzucone (lekcja usunięta): stan i pamięć są już wyczyszczone.
      if (kontroler !== wlasny) return { rodzaj: "przerwane" };
      kontroler = null;
      if (doWznowienia === null) {
        ustaw(BRAK);
        return { rodzaj: "odmowa", blad };
      }
      ustaw({ rodzaj: "przerwane", ...wspolne, wyslano: doWznowienia.wyslano, innyPlik: false });
      return { rodzaj: "przerwane" };
    }
  }

  return {
    subskrybuj(sluchacz: () => void): () => void {
      sluchacze.add(sluchacz);
      return () => {
        sluchacze.delete(sluchacz);
      };
    },
    stan(): StanWysylania {
      wczytaj();
      return stan;
    },
    wyslij,
    /** Przerywa trwające wysyłanie; da się je potem dokończyć tym samym plikiem. */
    przerwij(): void {
      kontroler?.abort();
    },
    /** Zapomina o wysyłaniu nagrania tej lekcji (np. lekcja została usunięta): przerywa je i czyści pamięć. */
    porzuc(idLekcji: number): void {
      wczytaj();
      if (stan.rodzaj === "brak" || stan.lekcja.id !== idLekcji) return;
      const trwajacy = kontroler;
      kontroler = null;
      trwajacy?.abort();
      usun();
      ustaw(BRAK);
    },
    /** Ekran lekcji przeczytał już stan nagrania z serwera — uchwyt nie ma nic więcej do pokazania. */
    zamknijWyslane(idLekcji: number): void {
      if (stan.rodzaj === "wyslane" && stan.lekcja.id === idLekcji) ustaw(BRAK);
    },
  };
}

export type UchwytWysylania = ReturnType<typeof utworzUchwyt>;

function pamiecPrzegladarki(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Jedyny uchwyt aplikacji. */
export const uchwytWysylania: UchwytWysylania = utworzUchwyt({
  zlec: (idLekcji, tytul) => zlecWgranieNagrania(idLekcji, tytul),
  zlecProwadzacego: (idLekcji, tytul) => zlecWgranieNagraniaProwadzacego(idLekcji, tytul),
  magazyn: pamiecPrzegladarki,
  teraz: () => Date.now(),
});

export const BRAK_WYSYLANIA = BRAK;
