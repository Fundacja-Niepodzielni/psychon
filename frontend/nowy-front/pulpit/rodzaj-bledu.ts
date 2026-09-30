/**
 * Klasyfikacja błędu odczytu pulpitu do jednego z czterech stanów ekranu
 * (blok „stany": 403, 404, błąd sieci, błąd). Osobny moduł, żeby dwa pulpity
 * (uczestnika i studenta) i wybór roli nie miały każdy własnej reguły.
 *
 *  - 401 i 403 → `zakazane` (sesja wygasła albo rola bez dostępu; 401 dodatkowo
 *    obsługuje `handleUnauthorized` w kliencie API — tak samo jak na
 *    `nowy-front/kurs-tematy`);
 *  - 404 → `nie-znaleziono`;
 *  - inna odpowiedź API (kod spoza tych trzech) → `blad`;
 *  - wyjątek bez odpowiedzi (fetch odrzucony, brak łączności) → `siec`.
 */
import { ApiError } from "@/lib/api/klient";

export type RodzajBledu = "zakazane" | "nie-znaleziono" | "siec" | "blad";

export function rodzajBledu(wyjatek: unknown): RodzajBledu {
  if (!(wyjatek instanceof ApiError)) {
    return "siec";
  }
  if (wyjatek.status === 401 || wyjatek.status === 403) {
    return "zakazane";
  }
  if (wyjatek.status === 404) {
    return "nie-znaleziono";
  }
  return "blad";
}
