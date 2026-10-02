import { api, ApiError, NieprawidlowaSciezkaApi } from "@/lib/api/klient";
import { sciezka } from "@/lib/api/sciezka";
import type { QuestionDraft, TestQuestion } from "@/lib/h10/types";

/**
 * Żądania ekranu „Pytania testu” — te same cztery trasy i te same pola co
 * dotychczasowy bank pytań (`components/h10/QuestionBank.tsx`), w obu panelach:
 *  - `GET /admin/tests/{test}/questions` — pytania z odpowiedziami i oznaczeniem poprawnej;
 *  - `POST /admin/tests/{test}/questions` — `body` i `answers[]` (`body`, `is_correct`);
 *  - `PATCH /admin/questions/{question}` — `body` i cały zestaw `answers[]`; odpowiedź,
 *    która już jest, niesie swoje `id` (serwer ją zmienia), nowa — bez `id`, brakujące
 *    serwer usuwa;
 *  - `DELETE /admin/questions/{question}`.
 * Trasy stoją w grupie administracji na serwerze; panel prowadzącego woła te same
 * i dostaje tę samą odpowiedź serwera co dotąd.
 */

export type PytanieTestu = TestQuestion;

export function pobierzPytania(idTestu: number): Promise<PytanieTestu[]> {
  return api<PytanieTestu[]>(sciezka`/admin/tests/${idTestu}/questions`);
}

export function dodajPytanie(idTestu: number, szkic: QuestionDraft): Promise<PytanieTestu> {
  return api<PytanieTestu>(sciezka`/admin/tests/${idTestu}/questions`, {
    method: "POST",
    body: { body: szkic.body, answers: szkic.answers.map((odpowiedz) => ({ body: odpowiedz.body, is_correct: odpowiedz.is_correct })) },
  });
}

export function zapiszPytanie(idPytania: number, szkic: QuestionDraft): Promise<PytanieTestu> {
  return api<PytanieTestu>(sciezka`/admin/questions/${idPytania}`, {
    method: "PATCH",
    body: {
      body: szkic.body,
      answers: szkic.answers.map((odpowiedz) => ({
        ...(odpowiedz.id === undefined ? {} : { id: odpowiedz.id }),
        body: odpowiedz.body,
        is_correct: odpowiedz.is_correct,
      })),
    },
  });
}

export function usunPytanie(idPytania: number): Promise<unknown> {
  return api<unknown>(sciezka`/admin/questions/${idPytania}`, { method: "DELETE" });
}

/** Numer testu z adresu: dodatnia liczba całkowita albo `null` (adres bez testu — bez żądania). */
export function numerTestu(tekst: string): number | null {
  if (!/^[1-9]\d*$/.test(tekst)) return null;
  const numer = Number(tekst);
  return Number.isSafeInteger(numer) ? numer : null;
}

/** Stany ekranu bez listy pytań. */
export type BladOdczytu =
  | { rodzaj: "brak-dostepu"; komunikat: string | null }
  | { rodzaj: "nie-znaleziono" }
  | { rodzaj: "siec" }
  | { rodzaj: "blad"; komunikat: string | null };

/**
 * Klasyfikacja błędu odczytu: 403 → odmowa ze zdaniem serwera (bez ponawiania,
 * jak dotąd); 404 → nie ma testu; wyjątek bez odpowiedzi → brak połączenia;
 * każda inna odpowiedź → błąd ze zdaniem serwera i ponowieniem.
 */
export function sklasyfikujBladOdczytu(wyjatek: unknown): BladOdczytu {
  if (wyjatek instanceof NieprawidlowaSciezkaApi) return { rodzaj: "nie-znaleziono" };
  if (!(wyjatek instanceof ApiError)) return { rodzaj: "siec" };
  const komunikat = wyjatek.message.trim() === "" ? null : wyjatek.message;
  if (wyjatek.status === 403) return { rodzaj: "brak-dostepu", komunikat };
  if (wyjatek.status === 404) return { rodzaj: "nie-znaleziono" };
  return { rodzaj: "blad", komunikat };
}

/** Błąd zapisu: zdanie ogólne i błędy pól z odpowiedzi 422 (klucze jak w regułach serwera). */
export interface BladZapisu {
  komunikat: string;
  pola: Record<string, string[]>;
}

export const ZDANIE_BRAKU_POLACZENIA = "Nie udało się połączyć z serwerem. Sprawdź internet i spróbuj ponownie.";

/** Zdanie serwera, gdy jest; bez odpowiedzi serwera — zdanie o internecie. Zapasowe zdania jak na dotychczasowym ekranie. */
export function bladZapisu(wyjatek: unknown, zapasowe: string): BladZapisu {
  if (!(wyjatek instanceof ApiError)) return { komunikat: ZDANIE_BRAKU_POLACZENIA, pola: {} };
  return { komunikat: wyjatek.message.trim() === "" ? zapasowe : wyjatek.message, pola: wyjatek.errors ?? {} };
}
