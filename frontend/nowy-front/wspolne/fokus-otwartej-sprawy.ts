/**
 * Fokus po otwarciu sprawy. „Otwórz” na ekranie „Sprawy do decyzji” prowadzi
 * na ekran jednej sprawy; po przejściu fokus staje na nagłówku tej sprawy, a
 * nie zostaje na stronie (`body`) ani nie trafia w żaden przycisk decyzji —
 * przypadkowy Enter albo Spacja niczego nie rozstrzygają.
 *
 * Zapowiedź jest jednorazowa i dotyczy wyłącznie adresu, na który prowadzi
 * „Otwórz”: wejście na ten sam ekran inną drogą (wpisany adres, odświeżenie,
 * menu) zostawia fokus tam, gdzie stawia go przeglądarka, więc pierwszy Tab
 * nadal trafia w „Przejdź do treści”.
 *
 * Stan żyje w module, bo przejście jest nawigacją po stronie klienta: moduł
 * nie jest ładowany od nowa, a ekran docelowy odbiera zapowiedź po wczytaniu
 * danych.
 */

let zapowiedzianaSciezka: string | null = null;

/** „Otwórz” sprawy: zapamiętuje ścieżkę ekranu, który po wczytaniu ma przejąć fokus. */
export function zapowiedzFokusSprawy(adres: string): void {
  zapowiedzianaSciezka = new URL(adres, window.location.href).pathname;
}

/**
 * Ekran sprawy po wczytaniu: czy wszedł tu „Otwórz” (zapowiedź dla bieżącej
 * ścieżki). Zapowiedź znika przy pierwszym odczycie, także gdy nie pasuje.
 */
export function odbierzZapowiedzFokusu(): boolean {
  const sciezka = zapowiedzianaSciezka;
  zapowiedzianaSciezka = null;
  return sciezka !== null && sciezka === window.location.pathname;
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
