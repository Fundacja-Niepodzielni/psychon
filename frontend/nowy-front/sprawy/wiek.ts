/**
 * Wiek sprawy w kolejce: ile dni kalendarzowych minęło od dnia, w którym
 * sprawa zaczęła czekać (`czekaOd` z `./dane.ts`, czyli `created_at` rekordu
 * źródłowego), do dnia „teraz” — oba dni w czasie warszawskim.
 * Jedno miejsce na próg ostrzeżenia, na liczenie dni, na odmianę słowa
 * „dzień” i na tekst wieku — wiersz listy, podtytuł ekranu i kolejka dyżurów
 * liczą ten sam wiek tą samą funkcją.
 */

import { numerDniaKalendarzowego } from "../wspolne/daty";

/** Od ilu dni oczekiwania plakietka wiersza jest ostrzegawcza (niżej jest szara). */
export const PROG_OSTRZEZENIA_DNI = 5;

/**
 * Dni kalendarzowe (Europe/Warsaw) od `czekaOd` do `teraz` (chwila w ms):
 * zgłoszenie z wczoraj o 23:59 dzień później o 00:01 ma 1, zgłoszenie z dziś
 * o 00:01 ma 0 do końca dnia. `null`, gdy źródło nie podało daty albo nie da
 * się jej odczytać (albo `teraz` nie jest chwilą) — wtedy ekran niczego nie
 * zgaduje. Chwila w przyszłości (rozjazd zegarów) daje 0, nie liczbę ujemną.
 */
export function dniOczekiwania(czekaOd: string, teraz: number): number | null {
  const poczatek = Date.parse(czekaOd);
  if (Number.isNaN(poczatek) || !Number.isFinite(teraz)) return null;
  return Math.max(0, numerDniaKalendarzowego(teraz) - numerDniaKalendarzowego(poczatek));
}

/** „dzień” przy 1, w pozostałych przypadkach „dni” (0, 2, 5, 22 …), jak w makiecie. */
export function slowoDni(dni: number): "dzień" | "dni" {
  return dni === 1 ? "dzień" : "dni";
}

/**
 * Sama część wieku, bez słowa „czeka”: „od dziś” przy 0, „1 dzień”, „2 dni”,
 * „22 dni”. Z niej składają się plakietka wiersza i podtytuł ekranu, więc
 * oba zawsze mówią to samo.
 */
export function tekstWieku(dni: number): string {
  return dni === 0 ? "od dziś" : `${dni} ${slowoDni(dni)}`;
}

export function wariantPlakietkiCzekania(dni: number): "warn" | "neutral" {
  return dni >= PROG_OSTRZEZENIA_DNI ? "warn" : "neutral";
}

export function tekstPlakietkiCzekania(dni: number): string {
  return `czeka ${tekstWieku(dni)}`;
}
