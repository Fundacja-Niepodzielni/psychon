/**
 * Wiek sprawy w kolejce: ile pełnych dni minęło od chwili, od której sprawa
 * czeka (`czekaOd` z `./dane.ts`, czyli `created_at` rekordu źródłowego).
 * Jedno miejsce na próg ostrzeżenia, na liczenie dni i na odmianę słowa
 * „dzień” — wiersz listy i podtytuł ekranu liczą ten sam wiek tą samą funkcją.
 */

/** Od ilu dni oczekiwania plakietka wiersza jest ostrzegawcza (niżej jest szara). */
export const PROG_OSTRZEZENIA_DNI = 5;

const MS_NA_DOBE = 24 * 60 * 60 * 1000;

/**
 * Pełne dni od `czekaOd` do `teraz` (znaczniki w ms). `null`, gdy źródło nie
 * podało daty albo nie da się jej odczytać — wtedy ekran niczego nie zgaduje.
 * Chwila w przyszłości (rozjazd zegarów) daje 0, nie liczbę ujemną.
 */
export function dniOczekiwania(czekaOd: string, teraz: number): number | null {
  const poczatek = Date.parse(czekaOd);
  if (Number.isNaN(poczatek)) return null;
  return Math.max(0, Math.floor((teraz - poczatek) / MS_NA_DOBE));
}

/** „dzień” przy 1, w pozostałych przypadkach „dni” (0, 2, 5, 22 …), jak w makiecie. */
export function slowoDni(dni: number): "dzień" | "dni" {
  return dni === 1 ? "dzień" : "dni";
}

export function wariantPlakietkiCzekania(dni: number): "warn" | "neutral" {
  return dni >= PROG_OSTRZEZENIA_DNI ? "warn" : "neutral";
}

export function tekstPlakietkiCzekania(dni: number): string {
  return `czeka ${dni} ${slowoDni(dni)}`;
}
