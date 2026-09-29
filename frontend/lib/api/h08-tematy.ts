/**
 * H08 — tematy kursu: warstwa między kursem a lekcjami (kurs → tematy →
 * lekcje). Trasy wyłącznie z aneksu kontraktu „Aneks — tematy kursu”, pkt 2
 * (`docs/hackathon/02-kontrakt-api.md`, tabela tras w. 1075-1081), w dwóch
 * grupach o tym samym kształcie: `/admin/…` (`project_manager`,
 * `super_admin`) i `/instructor/…` (`instructor`) — `backend/routes/api/h08.php`
 * w. 58-62 i 91-95.
 *
 * Każda funkcja przyjmuje grupę tras jawnie, zamiast zgadywać ją z roli:
 * ekran wie, czyim tokenem czyta kurs, i tą samą grupą zapisuje tematy.
 */

import { ApiError, api } from "./klient";

export type GrupaTras = "admin" | "instructor";

/** Zasób `Topic` z aneksu pkt 2 (w. 1083-1084). `lesson_ids` to żywe lekcje
 * tematu w jego kolejności. */
export interface Topic {
  id: number;
  course_id: number;
  title: string;
  position: number;
  lesson_ids: number[];
  created_at: string | null;
  updated_at: string | null;
}

/** Jeden element ciała `PATCH …/topics/reorder` (aneks pkt 2, w. 1081). */
export interface UkladTematu {
  id: number;
  lesson_ids: number[];
}

/** Odpowiedź `DELETE …/topics/{topic}` (aneks pkt 2, w. 1080). */
export interface UsunietyTemat {
  id: number;
  deleted: true;
}

/** `GET …/courses/{course}/topics` → 200 `{data:[Topic]}`, bez paginacji. */
export function pobierzTematy(grupa: GrupaTras, idKursu: number): Promise<Topic[]> {
  return api<Topic[]>(`/${grupa}/courses/${idKursu}/topics`);
}

/** `POST …/courses/{course}/topics` `{ title }` → 201 `{data:Topic}`; nowy
 * temat trafia na koniec kursu. 422 `validation_failed` (`errors.title`). */
export function dodajTemat(grupa: GrupaTras, idKursu: number, title: string): Promise<Topic> {
  return api<Topic>(`/${grupa}/courses/${idKursu}/topics`, {
    method: "POST",
    body: { title },
  });
}

/** `PATCH …/topics/{topic}` `{ title }` → 200 `{data:Topic}`. 422
 * `validation_failed` (`errors.title`). */
export function zmienTytulTematu(grupa: GrupaTras, idTematu: number, title: string): Promise<Topic> {
  return api<Topic>(`/${grupa}/topics/${idTematu}`, {
    method: "PATCH",
    body: { title },
  });
}

/** `DELETE …/topics/{topic}` → 200 `{data:{id, deleted:true}}`. Temat z żywymi
 * lekcjami → 422 `conditions_not_met`, bez zmian po stronie serwera. */
export function usunTemat(grupa: GrupaTras, idTematu: number): Promise<UsunietyTemat> {
  return api<UsunietyTemat>(`/${grupa}/topics/${idTematu}`, { method: "DELETE" });
}

/**
 * `PATCH …/courses/{course}/topics/reorder` `{ topics: [{ id, lesson_ids }] }`
 * → 200 `{data:[Topic]}`. Jedno żądanie niesie CAŁY układ kursu: pełną
 * permutację żywych tematów i — w sumie `lesson_ids` — pełną permutację żywych
 * lekcji. Brak, obcy identyfikator albo duplikat → 422 `validation_failed`
 * bez żadnej zmiany (aneks pkt 2, w. 1090-1097).
 */
export function zapiszUkladTematow(
  grupa: GrupaTras,
  idKursu: number,
  topics: UkladTematu[],
): Promise<Topic[]> {
  return api<Topic[]>(`/${grupa}/courses/${idKursu}/topics/reorder`, {
    method: "PATCH",
    body: { topics },
  });
}

/**
 * Jedno zdanie dla osoby z błędu tras tematów. `conditions_not_met` przy
 * usuwaniu tematu ma własne zdanie (temat ma lekcje), `validation_failed`
 * bierze pierwszy komunikat pola z koperty błędu, a gdy go brak — `message`
 * serwera. Błąd spoza koperty API (sieć) dostaje zdanie ogólne.
 */
export function zdanieBleduTematow(blad: unknown): string {
  if (blad instanceof ApiError) {
    if (blad.code === "conditions_not_met") {
      return "Tego tematu nie można usunąć, bo ma lekcje. Przenieś je najpierw do innego tematu.";
    }
    if (blad.code === "validation_failed") {
      const pierwszy = Object.values(blad.errors ?? {}).flat()[0];
      return pierwszy ?? blad.message;
    }
    return blad.message;
  }
  return "Nie udało się połączyć z serwerem. Spróbuj ponownie za chwilę.";
}
