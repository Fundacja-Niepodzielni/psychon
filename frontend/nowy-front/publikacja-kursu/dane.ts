import { api, ApiError } from "@/lib/api/klient";
import type { AdminCourse } from "@/lib/h08/types";
import type { PozycjaChecklisty } from "@/design-system/organizmy/PublishChecklist/PublishChecklist";

/**
 * Dane ekranu „Publikacja kursu” (administracja) — trzy trasy kursu z grupy
 * `role:project_manager,super_admin` (`backend/routes/api/h08.php:35-39`):
 * `GET`, `PATCH` i `DELETE /admin/courses/{course}`. Kształt kursu:
 * `AdminCourseResource`. Wołania idą przez wspólny klient (`lib/api/klient`),
 * więc token i koperta `{data}` są obsłużone w jednym miejscu.
 */

/** Kurs w kształcie `AdminCourseResource` — `GET`/`PATCH` zwracają jego pełny stan. */
export type KursPublikacji = AdminCourse;

/** Identyfikator z adresu strony — trasa serwera przyjmuje wyłącznie liczby (`whereNumber`). */
export function czyPoprawnyIdentyfikator(id: string): boolean {
  return /^[0-9]+$/.test(id);
}

/** `GET /admin/courses/{course}` → 200, pełny zasób kursu. */
export function pobierzKurs(id: string): Promise<KursPublikacji> {
  return api<KursPublikacji>(`/admin/courses/${id}`);
}

/**
 * `PATCH /admin/courses/{course}` z jednym polem `is_published`.
 * Kurs bez lekcji: `422 conditions_not_met` z `reason.missing`.
 */
export function zmienPublikacje(id: string, opublikowany: boolean): Promise<KursPublikacji> {
  return api<KursPublikacji>(`/admin/courses/${id}`, {
    method: "PATCH",
    body: { is_published: opublikowany },
  });
}

/** `DELETE /admin/courses/{course}` → 200 `{ id, deleted: true }`. */
export function usunKurs(id: string): Promise<{ id: number; deleted: boolean }> {
  return api<{ id: number; deleted: boolean }>(`/admin/courses/${id}`, { method: "DELETE" });
}

/** Adres ekranu kursu (tematy i lekcje) — miejsce uzupełnienia braków. */
export function adresKursu(id: string): string {
  return `/nowy-front/kurs/${id}`;
}

const TEKSTY_BRAKOW: Record<string, string> = {
  lessons: "Dodaj co najmniej jedną lekcję",
};

/** Lista braków z `reason.missing` — każdy kod to jedna pozycja z odnośnikiem do kursu. */
export function brakiZReason(idKursu: string, missing: unknown): PozycjaChecklisty[] {
  if (!Array.isArray(missing)) return [];
  return missing
    .filter((kod): kod is string => typeof kod === "string" && kod !== "")
    .map((kod) => ({
      id: kod,
      tekst: TEKSTY_BRAKOW[kod] ?? "Uzupełnij brakujący element kursu",
      href: adresKursu(idKursu),
    }));
}

/**
 * Rodzaj błędu operacji na kursie — ekran wybiera po nim stan, nie po kodach HTTP:
 *  - `zakazane` — 403;
 *  - `nie-znaleziono` — 404;
 *  - `braki` — 422 `conditions_not_met` z niepustym `reason.missing`;
 *  - `blad` — reszta odpowiedzi błędu z komunikatem serwera (w tym 422 bez braków,
 *    np. kurs będący warunkiem kolejnych etapów przy usuwaniu);
 *  - `siec` — brak odpowiedzi (wyjątek spoza koperty błędu).
 */
export type BladOperacji =
  | { rodzaj: "zakazane" }
  | { rodzaj: "nie-znaleziono" }
  | { rodzaj: "braki"; braki: PozycjaChecklisty[]; komunikat: string }
  | { rodzaj: "blad"; komunikat: string }
  | { rodzaj: "siec" };

export function sklasyfikujBlad(idKursu: string, blad: unknown): BladOperacji {
  if (!(blad instanceof ApiError)) return { rodzaj: "siec" };
  if (blad.status === 403) return { rodzaj: "zakazane" };
  if (blad.status === 404) return { rodzaj: "nie-znaleziono" };
  if (blad.status === 422 && blad.code === "conditions_not_met") {
    const braki = brakiZReason(idKursu, blad.reason?.missing);
    if (braki.length > 0) return { rodzaj: "braki", braki, komunikat: blad.message };
  }
  return { rodzaj: "blad", komunikat: blad.message };
}
