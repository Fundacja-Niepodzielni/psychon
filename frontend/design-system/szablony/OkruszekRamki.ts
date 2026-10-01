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
 *
 * Moduł jest czysty (bez Reacta i bez routera): ścieżkę i menu dostarcza
 * kontekst ramki (`KontekstRamki.tsx`).
 */

/** Pozycja menu ramki — tyle, ile potrzeba do ułożenia okruszka. */
export interface PozycjaMenuOkruszka {
  etykieta: string;
  href: string;
  /** Pozycja bieżąca dla ścieżki (rozstrzyga rejestr menu: korzeń sekcji tylko dokładnie). */
  biezaca?: boolean;
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
  /** Okruszki podane przez ekran: łącza pośrednie i ostatnia pozycja (bieżąca). */
  okruszki: PozycjaOkruszka[];
  tytul: string;
}

/**
 * Okruszek ekranu nowej ramki albo pusta lista, gdy ekran nie ma go mieć.
 * Ostatnia pozycja listy jest bieżąca; wcześniejsze mają łącza.
 */
export function okruszekRamki({ menu, sciezka, okruszki, tytul }: DaneOkruszka): PozycjaOkruszka[] {
  const s = bezKonca(sciezka);

  // Pozycja menu dopasowana do ścieżki: bieżąca wg rejestru, przy kilku — najdłuższy adres.
  let dopasowana: { pozycja: PozycjaMenuOkruszka; grupa: GrupaMenuOkruszka } | null = null;
  for (const grupa of menu) {
    for (const pozycja of grupa.pozycje) {
      if (!pozycja.biezaca) continue;
      if (!dopasowana || pozycja.href.length > dopasowana.pozycja.href.length) dopasowana = { pozycja, grupa };
    }
  }

  const adresPozycji = dopasowana ? bezKonca(dopasowana.pozycja.href) : null;
  const szczegol = adresPozycji !== null && s !== adresPozycji && s.startsWith(`${adresPozycji}/`);

  if (dopasowana && !szczegol && dopasowana.grupa.naglowek === GRUPA_BEZ_OKRUSZKA) return [];

  const ostatniaEkranu = okruszki.length > 0 ? okruszki[okruszki.length - 1].etykieta : tytul;
  // Lista bez łączy dalej: bieżąca to nazwa pozycji menu (rejestr), na szczególe — ostatnia pozycja ekranu.
  const biezaca = dopasowana && !szczegol ? dopasowana.pozycja.etykieta : ostatniaEkranu;

  const lancuch: PozycjaOkruszka[] = [];
  // Łącze trafia do łańcucha raz: bez powtórzeń po nazwie i po adresie.
  const dodajLacze = (etykieta: string, href: string) => {
    const powtorzone = lancuch.some((w) => klucz(w.etykieta) === klucz(etykieta) || w.href === href);
    if (!powtorzone) lancuch.push({ etykieta, href });
  };
  const korzen = korzenDlaSciezki(s);
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
