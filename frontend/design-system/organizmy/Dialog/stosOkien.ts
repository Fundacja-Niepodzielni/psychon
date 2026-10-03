/**
 * Stos otwartych okien `Dialog` — wspólny dla całej strony, poza Reactem.
 *
 * Trzy zadania, każde z jednego miejsca:
 * - klawisze (Escape, Enter, Tab) obsługuje WYŁĄCZNIE okno na wierzchu
 *   stosu, więc dwa okna naraz nie walczą o ten sam klawisz;
 * - otwarcie okna z wnętrza innego okna nie jest obsługiwane — w trybie
 *   deweloperskim konsola dostaje ostrzeżenie (na produkcji cisza);
 * - pierwsze otwarte okno blokuje przewijanie strony pod spodem, ostatnie
 *   zamknięte przywraca poprzednią wartość `overflow` korzenia dokumentu.
 */

const stos: symbol[] = [];
let poprzedniOverflow = "";

export const OSTRZEZENIE_ZAGNIEZDZENIA =
  "Dialog: otwarcie okna z wnętrza innego okna nie jest obsługiwane — zamknij pierwsze okno, zanim otworzysz drugie.";

/** Rejestruje okno na wierzchu stosu; zwraca funkcję, która je wyrejestrowuje. */
export function dodajOkno(znacznik: symbol): () => void {
  if (stos.length > 0 && process.env.NODE_ENV !== "production") {
    console.warn(OSTRZEZENIE_ZAGNIEZDZENIA);
  }
  if (stos.length === 0 && typeof document !== "undefined") {
    poprzedniOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
  }
  stos.push(znacznik);
  return () => {
    const indeks = stos.lastIndexOf(znacznik);
    if (indeks >= 0) stos.splice(indeks, 1);
    if (stos.length === 0 && typeof document !== "undefined") {
      document.documentElement.style.overflow = poprzedniOverflow;
    }
  };
}

/** Czy to okno jest na wierzchu stosu (jedyne, które dostaje klawisze). */
export function czyNaWierzchu(znacznik: symbol): boolean {
  return stos[stos.length - 1] === znacznik;
}

/** Liczba otwartych okien — do prób. */
export function liczbaOtwartychOkien(): number {
  return stos.length;
}
