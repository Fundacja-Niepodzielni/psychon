/**
 * Konfiguracja odtwarzacza nagrań osadzanego w ramce: jedno miejsce, z którego
 * biorą i nagłówek ograniczający ramki (`next.config.ts`), i sprawdzenie
 * pochodzenia komunikatów ramki (`design-system/organizmy/RecordingPlayer`).
 *
 * Moduł nie importuje niczego: czyta go zarówno konfiguracja budowy (Node),
 * jak i kod przeglądarki.
 */

/**
 * Wspólny host ramki odtwarzacza — ten sam dla każdego konta u dostawcy. Niczego
 * zależnego od konta (identyfikatora biblioteki, hosta plików) tu nie ma i być
 * nie może: te wartości zna wyłącznie zaplecze i niesie je podpisany adres ramki.
 */
const DOMYSLNE_POCHODZENIE = "https://iframe.mediadelivery.net";

/** Hosty pętli zwrotnej: jedyne, dla których nadpisanie może używać `http:` (próby lokalne). */
const HOSTY_LOKALNE = new Set(["localhost", "127.0.0.1"]);

/**
 * Sprowadza wartość nadpisania do pochodzenia (`schemat://host[:port]`) albo
 * zwraca `null`, gdy wartość nim nie jest. Przechodzi wyłącznie `https:` (oraz
 * `http:` dla pętli zwrotnej) i wyłącznie samo pochodzenie — bez ścieżki,
 * zapytania, danych logowania i znaków wieloznacznych.
 */
export function pochodzenieZWartosci(surowa: string | undefined | null): string | null {
  if (typeof surowa !== "string") return null;
  const wartosc = surowa.trim();
  if (wartosc === "" || /[\s*'";,]/.test(wartosc)) return null;
  let adres: URL;
  try {
    adres = new URL(wartosc);
  } catch {
    return null;
  }
  const lokalny = adres.protocol === "http:" && HOSTY_LOKALNE.has(adres.hostname);
  if (adres.protocol !== "https:" && !lokalny) return null;
  if (adres.username !== "" || adres.password !== "") return null;
  if (wartosc !== adres.origin && wartosc !== `${adres.origin}/`) return null;
  return adres.origin;
}

/**
 * Nadpisanie zmienną konfiguracji budowy. Zapis `process.env.NEXT_PUBLIC_…`
 * musi zostać dosłowny: budowa wstawia w to miejsce wartość, więc przeglądarka
 * i nagłówek z `next.config.ts` dostają tę samą. Budowa, która niczego nie
 * wstawia, zostawia w przeglądarce odwołanie do nieistniejącego `process` —
 * wtedy nadpisania po prostu nie ma.
 */
function nadpisanieZBudowy(): string | undefined {
  try {
    return process.env.NEXT_PUBLIC_VIDEO_PLAYER_ORIGIN;
  } catch {
    return undefined;
  }
}

/**
 * Dozwolone pochodzenie odtwarzacza. JEDYNA wartość, z którą porównywane jest
 * pochodzenie komunikatów ramki, pochodzenie adresu ramki i która trafia do
 * dyrektywy ramek. Błędne nadpisanie nie poszerza niczego: zostaje wartość domyślna.
 */
export const POCHODZENIE_ODTWARZACZA: string = pochodzenieZWartosci(nadpisanieZBudowy()) ?? DOMYSLNE_POCHODZENIE;

/**
 * Pochodzenia filmu powitalnego na ekranie „Zacznij tutaj” — jedynej ramki
 * poza odtwarzaczem nagrań, która wskazuje obcy serwis. Ekran zamienia odnośnik
 * do filmu na adres osadzenia pierwszego z nich; pozostałe dwa to adresy
 * osadzenia, które administracja może wkleić wprost.
 */
export const POCHODZENIA_FILMU_POWITALNEGO: readonly string[] = [
  "https://www.youtube.com",
  "https://www.youtube-nocookie.com",
  "https://player.vimeo.com",
];

/** Wartość dyrektywy ramek: własne pochodzenie, odtwarzacz nagrań, film powitalny. */
export function dyrektywaRamek(pochodzenieOdtwarzacza: string = POCHODZENIE_ODTWARZACZA): string {
  return ["frame-src", "'self'", pochodzenieOdtwarzacza, ...POCHODZENIA_FILMU_POWITALNEGO].join(" ");
}

/** Nagłówek odpowiedzi niosący dyrektywę ramek — wyłącznie ją, bez pozostałych dyrektyw. */
export function naglowekRamek(): { key: string; value: string } {
  return { key: "Content-Security-Policy", value: dyrektywaRamek() };
}

/**
 * Adres ramki przechodzi wyłącznie wtedy, gdy jego pochodzenie jest dokładnie
 * dozwolonym pochodzeniem odtwarzacza. Zwraca adres w postaci, w jakiej trafia
 * do atrybutu `src`, albo `null`.
 */
export function adresRamkiOdtwarzacza(
  adres: string | undefined | null,
  pochodzenie: string = POCHODZENIE_ODTWARZACZA,
): URL | null {
  if (typeof adres !== "string" || adres.trim() === "") return null;
  let wynik: URL;
  try {
    wynik = new URL(adres);
  } catch {
    return null;
  }
  if (wynik.origin !== pochodzenie) return null;
  if (wynik.username !== "" || wynik.password !== "") return null;
  return wynik;
}
