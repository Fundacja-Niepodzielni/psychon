import { api, apiPaged, type PaginationMeta } from "@/lib/api/klient";

/**
 * Warstwa danych ekranu „Skrzynka pytań” (prowadzący). Trasy wyłącznie z
 * `backend/routes/api/h17.php`:
 *  - `GET /instructor/questions` (w. 37) — `InstructorQuestionController::index`
 *    (`backend/app/Http/Controllers/Api/V1/H17/InstructorQuestionController.php:21-59`),
 *    filtr `answered=false` (w. 29-33), stronicowanie (`per_page` 25), licznik
 *    bez odpowiedzi w `meta.extra.unanswered` (w. 50-56);
 *  - `POST /instructor/questions/{id}/answer` (w. 38) — `answer` (w. 61-102),
 *    ciało `{ answer }`, reguły w `AnswerQuestionRequest::rules` (w. 19-22):
 *    wymagane, 1-5000 znaków, przycinane przed walidacją.
 *
 * Kształt pytania to `InstructorQuestionResource::toArray`
 * (`backend/app/Http/Resources/H17/InstructorQuestionResource.php:19-42`).
 * Rozjazd `backend/openapi.json`: lista niesie `items: array` zamiast obiektu,
 * a odpowiedź na pytanie `data: array` zamiast obiektu, bez 404 — kształt
 * bierze się z zasobu, nie ze schematu.
 *
 * Odczyt i zapis biegną z przeglądarki (token sesji z klienta API) — ten sam
 * powód co w pozostałych ekranach nowego frontu: serwerowy `@/auth` nie wstaje
 * pod testami jsdom.
 */

/** `user` zasobu (w. 30-34). */
export interface AutorPytania {
  id: number;
  first_name: string;
  last_name: string;
}

/** `lesson.course` zasobu (w. 37-41). */
export interface KursPytania {
  id: number;
  slug: string;
  title: string;
}

/** `lesson` zasobu (w. 35-42). */
export interface LekcjaPytania {
  id: number;
  title: string;
  course: KursPytania;
}

/** Cały zasób (w. 21-43). */
export interface PytanieSkrzynki {
  id: number;
  lesson_id: number;
  question: string;
  answer: string | null;
  answered_by: number | null;
  answered_by_name: string | null;
  answered_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  user: AutorPytania;
  lesson: LekcjaPytania;
}

export interface StronaPytan {
  data: PytanieSkrzynki[];
  meta?: PaginationMeta;
}

/** Limit znaków odpowiedzi — `AnswerQuestionRequest` (`max:5000`). */
export const LIMIT_ODPOWIEDZI = 5000;

export function pobierzPytaniaBezOdpowiedzi(strona: number): Promise<StronaPytan> {
  return apiPaged<PytanieSkrzynki>(`/instructor/questions?answered=false&page=${strona}`);
}

export function wyslijOdpowiedz(idPytania: number, odpowiedz: string): Promise<PytanieSkrzynki> {
  return api<PytanieSkrzynki>(`/instructor/questions/${idPytania}/answer`, {
    method: "POST",
    body: { answer: odpowiedz },
  });
}
