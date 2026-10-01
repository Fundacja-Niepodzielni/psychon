/**
 * Reguła okruszka w nagłówku ekranu nowej ramki panelu — jedna dla wszystkich
 * ekranów, liczona z menu ramki (te same grupy i pozycje, które szablon
 * `PowlokaPanelu` rysuje w menu bocznym), nie z ekranu po ekranie.
 *
 * 1. Ekran, którego pozycja menu stoi w grupie „Codziennie”, nie ma okruszka
 *    (pulpit, Sprawy, Dyżury do decyzji, Uczestnicy, zgłoszenia) — chyba że
 *    jest ekranem szczegółu, patrz 2.
 * 2. Każdy inny ekran ma okruszek „korzeń › [rodzic ›] bieżąca”. Ekran
 *    szczegółu (ścieżka głębiej niż adres pozycji menu) ma go zawsze, także
 *    gdy jego lista stoi w „Codziennie”.
 * 3. Korzeń zależy od roli: administracja zaczyna od „Administracja” (łącze
 *    do `/admin`), uczestnik i prowadzący od sekcji, bez korzenia roli.
 * 4. Okruszek z jedną pozycją nie powstaje nigdy (dublowałby `h1`).
 * 5. Nazwy w okruszku to nazwy pozycji menu, nie nazwy z ekranu.
 * 6. Ekran bez własnej pozycji w menu, który ma w rejestrze menu rodzica
 *    (`podstrony` pozycji-rodzica), jest zwykłą podstroną z pkt 2: łańcuch
 *    „korzeń › rodzic › bieżąca”, a jego szczegół „korzeń › rodzic › ekran ›
 *    bieżąca”. Rodzic stoi w grupie „Codziennie”, ale podstrona okruszek ma
 *    zawsze — pkt 1 dotyczy tylko ekranów z własną pozycją menu.
 *
 * Moduł jest czysty (bez Reacta i bez routera): ścieżkę i menu dostarcza
 * kontekst ramki (`KontekstRamki.tsx`).
 */

/** Podstrona bez własnej pozycji w menu — jej rodzicem jest pozycja, która ją niesie w `podstrony`. */
export interface PodstronaMenuOkruszka {
  etykieta: string;
  href: string;
}

/** Pozycja menu ramki — tyle, ile potrzeba do ułożenia okruszka. */
export interface PozycjaMenuOkruszka {
  etykieta: string;
  href: string;
  /**
   * Pozycja bieżąca dla ścieżki (rozstrzyga rejestr menu: korzeń sekcji tylko
   * dokładnie). `"sekcja"` — rodzic bieżącej podstrony; okruszek liczy wtedy
   * z `podstrony`, nie z tej pozycji.
   */
  biezaca?: boolean | "sekcja";
  /** Podstrony bez własnej pozycji w menu, które mają tę pozycję za rodzica (rejestr menu). */
  podstrony?: PodstronaMenuOkruszka[];
}

/** Grupa menu ramki (np. „Codziennie”, „Program”, „Rozliczenie”). */
export interface GrupaMenuOkruszka {
  naglowek: string;
  pozycje: PozycjaMenuOkruszka[];
}

/** Pozycja okruszków podana przez ekran (`okruszki`) albo złożona przez regułę. */
export interface PozycjaOkruszka {
  etykieta: string;
  href?: string;
}

/** Grupa menu, której ekrany nie mają okruszka (poza ekranami szczegółu). */
export const GRUPA_BEZ_OKRUSZKA = "Codziennie";

/** Korzeń okruszka administracji: etykieta i łącze do pulpitu sekcji. */
export const KORZEN_ADMINISTRACJI: Required<PozycjaOkruszka> = { etykieta: "Administracja", href: "/admin" };

function bezKonca(sciezka: string): string {
  return sciezka.length > 1 ? sciezka.replace(/\/+$/, "") : sciezka;
}

function klucz(etykieta: string): string {
  return etykieta.trim().toLocaleLowerCase("pl");
}

/** Korzeń okruszka dla ścieżki: tylko administracja ma korzeń roli. */
function korzenDlaSciezki(sciezka: string): Required<PozycjaOkruszka> | null {
  const { href } = KORZEN_ADMINISTRACJI;
  return sciezka === href || sciezka.startsWith(`${href}/`) ? KORZEN_ADMINISTRACJI : null;
}

interface DaneOkruszka {
  menu: GrupaMenuOkruszka[];
  sciezka: string;
  /**
   * Okruszki podane przez ekran: łącza pośrednie i ostatnia pozycja. Ostatnia
   * jest bieżąca na szczególe i na ekranie poza menu; na liście bieżącą nazywa
   * pozycja menu.
   */
  okruszki: PozycjaOkruszka[];
  tytul: string;
}

/**
 * Okruszek ekranu nowej ramki albo pusta lista, gdy ekran nie ma go mieć.
 * Ostatnia pozycja listy jest bieżąca; wcześniejsze mają łącza.
 */
export function okruszekRamki({ menu, sciezka, okruszki, tytul }: DaneOkruszka): PozycjaOkruszka[] {
  const s = bezKonca(sciezka);

  const lancuch: PozycjaOkruszka[] = [];
  // Łącze trafia do łańcucha raz: bez powtórzeń po nazwie i po adresie.
  const dodajLacze = (etykieta: string, href: string) => {
    const powtorzone = lancuch.some((w) => klucz(w.etykieta) === klucz(etykieta) || w.href === href);
    if (!powtorzone) lancuch.push({ etykieta, href });
  };
  const ostatniaEkranu = okruszki.length > 0 ? okruszki[okruszki.length - 1].etykieta : tytul;
  const korzen = korzenDlaSciezki(s);

  // Podstrona z rodzicem w rejestrze menu (ekran bez własnej pozycji): przy kilku — najdłuższy adres.
  let podstrona: { rodzic: PozycjaMenuOkruszka; ekran: PodstronaMenuOkruszka; adres: string } | null = null;
  for (const grupa of menu) {
    for (const rodzic of grupa.pozycje) {
      for (const ekran of rodzic.podstrony ?? []) {
        const adres = bezKonca(ekran.href);
        if (s !== adres && !s.startsWith(`${adres}/`)) continue;
        if (!podstrona || adres.length > podstrona.adres.length) podstrona = { rodzic, ekran, adres };
      }
    }
  }
  if (podstrona) {
    if (korzen) dodajLacze(korzen.etykieta, korzen.href);
    dodajLacze(podstrona.rodzic.etykieta, podstrona.rodzic.href);
    if (s === podstrona.adres) {
      lancuch.push({ etykieta: podstrona.ekran.etykieta });
    } else {
      dodajLacze(podstrona.ekran.etykieta, podstrona.ekran.href);
      for (const pozycja of okruszki.slice(0, -1)) {
        if (pozycja.href) dodajLacze(pozycja.etykieta, pozycja.href);
      }
      lancuch.push({ etykieta: ostatniaEkranu });
    }
    return lancuch.length > 1 ? lancuch : [];
  }

  // Pozycja menu dopasowana do ścieżki: bieżąca wg rejestru, przy kilku — najdłuższy adres.
  let dopasowana: { pozycja: PozycjaMenuOkruszka; grupa: GrupaMenuOkruszka } | null = null;
  for (const grupa of menu) {
    for (const pozycja of grupa.pozycje) {
      if (pozycja.biezaca !== true) continue;
      if (!dopasowana || pozycja.href.length > dopasowana.pozycja.href.length) dopasowana = { pozycja, grupa };
    }
  }

  const adresPozycji = dopasowana ? bezKonca(dopasowana.pozycja.href) : null;
  const szczegol = adresPozycji !== null && s !== adresPozycji && s.startsWith(`${adresPozycji}/`);

  if (dopasowana && !szczegol && dopasowana.grupa.naglowek === GRUPA_BEZ_OKRUSZKA) return [];

  // Lista bez łączy dalej: bieżąca to nazwa pozycji menu (rejestr), na szczególe — ostatnia pozycja ekranu.
  const biezaca = dopasowana && !szczegol ? dopasowana.pozycja.etykieta : ostatniaEkranu;

  if (korzen) dodajLacze(korzen.etykieta, korzen.href);
  if (dopasowana && szczegol && klucz(dopasowana.pozycja.etykieta) !== klucz(biezaca)) {
    dodajLacze(dopasowana.pozycja.etykieta, dopasowana.pozycja.href);
  }
  // Pośrednie łącza ekranu: bez powtórzeń korzenia i pozycji menu, w kolejności ekranu.
  for (const pozycja of okruszki.slice(0, -1)) {
    if (pozycja.href) dodajLacze(pozycja.etykieta, pozycja.href);
  }
  lancuch.push({ etykieta: biezaca });

  return lancuch.length > 1 ? lancuch : [];
}
