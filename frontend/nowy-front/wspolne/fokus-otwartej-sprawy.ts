/**
 * Fokus po otwarciu sprawy. „Otwórz” na ekranie „Sprawy do decyzji” prowadzi
 * na ekran jednej sprawy; po przejściu fokus staje na nagłówku tej sprawy, a
 * nie zostaje na stronie (`body`) ani nie trafia w żaden przycisk decyzji —
 * przypadkowy Enter albo Spacja niczego nie rozstrzygają.
 *
 * Zapowiedź jest jednorazowa i dotyczy wyłącznie ścieżki, na którą prowadzi
 * „Otwórz”: wejście na ten sam ekran inną drogą (wpisany adres, odświeżenie,
 * menu) zostawia fokus tam, gdzie stawia go przeglądarka, więc pierwszy Tab
 * nadal trafia w „Przejdź do treści”.
 *
 * Zapowiedź żyje w `sessionStorage` tej karty, bo „Otwórz” w wierszu listy
 * jest zwykłym odnośnikiem (`<a href>`): przejście ładuje stronę od nowa i
 * stan modułu by przepadł. Zapowiedź starsza niż `WAZNOSC_MS` nie działa —
 * przejście, które się nie odbyło, nie przeniesie fokusu przy późniejszym
 * wejściu na ten sam adres. Brak dostępu do `sessionStorage` = brak zapowiedzi.
 */

const KLUCZ = "np-fokus-otwartej-sprawy";

/** Jak długo zapowiedź czeka na ekran docelowy (przejście i wczytanie danych). */
export const WAZNOSC_MS = 60_000;

interface Zapowiedz {
  sciezka: string;
  czas: number;
}

/** „Otwórz” sprawy: zapamiętuje ścieżkę ekranu, który po wczytaniu ma przejąć fokus. */
export function zapowiedzFokusSprawy(adres: string): void {
  const zapowiedz: Zapowiedz = { sciezka: new URL(adres, window.location.href).pathname, czas: Date.now() };
  try {
    window.sessionStorage.setItem(KLUCZ, JSON.stringify(zapowiedz));
  } catch {
    // Magazyn niedostępny (tryb prywatny, blokada) — fokus zostaje jak bez zapowiedzi.
  }
}

/**
 * Ekran sprawy po wczytaniu: czy wszedł tu „Otwórz” (świeża zapowiedź dla
 * bieżącej ścieżki). Zapowiedź znika przy pierwszym odczycie, także gdy nie
 * pasuje.
 */
export function odbierzZapowiedzFokusu(): boolean {
  let zapis: string | null;
  try {
    zapis = window.sessionStorage.getItem(KLUCZ);
    window.sessionStorage.removeItem(KLUCZ);
  } catch {
    return false;
  }
  if (zapis === null) return false;
  try {
    const { sciezka, czas } = JSON.parse(zapis) as Partial<Zapowiedz>;
    return (
      sciezka === window.location.pathname &&
      typeof czas === "number" &&
      Date.now() - czas >= 0 &&
      Date.now() - czas <= WAZNOSC_MS
    );
  } catch {
    return false;
  }
}

/**
 * Fokus na nagłówku: element dostaje `tabIndex={-1}` (fokus z programu, poza
 * kolejnością Tab), tak jak panel otwartego dyżuru. Brak elementu — nic.
 */
export function fokusNaNaglowku(naglowek: HTMLElement | null | undefined): void {
  if (!naglowek) return;
  if (!naglowek.hasAttribute("tabindex")) naglowek.setAttribute("tabindex", "-1");
  naglowek.focus();
}

/** Nagłówek ekranu: jedyny `h1` w `main` (nagłówek szablonu). */
export function naglowekEkranu(): HTMLElement | null {
  return document.querySelector<HTMLElement>("main h1");
}
