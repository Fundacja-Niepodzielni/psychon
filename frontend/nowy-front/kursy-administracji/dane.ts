import { api, apiPaged, type PaginationMeta } from "@/lib/api/klient";
import type { AdminCourse, CourseType, ProductGroup, ReorderImpactRow } from "@/lib/h08/types";

/**
 * Warstwa danych ekranu „Kursy” (administracja). Trasy z grupy
 * `role:project_manager,super_admin` (`backend/routes/api/h08.php:32-53`):
 * - `GET /admin/courses` — lista stronicowana (`CourseCatalogAdminController::index`);
 * - `POST /admin/courses` — utworzenie szkicu (`StoreCourseRequest`);
 * - `POST /admin/courses/reorder/preview` — podgląd skutków zmiany kolejności;
 * - `PATCH /admin/courses/reorder` — zapis kolejności (`CourseSequenceController`).
 * Wołania idą przez wspólnego klienta API (token sesji i koperta `{data}` w jednym miejscu).
 */

/** Kontrakt §1 dopuszcza `per_page` do 100 — cała ścieżka mieści się na jednej stronie. */
export const LICZBA_NA_STRONE = 100;

export type KursAdministracji = AdminCourse;

export interface StronaKursow {
  data: KursAdministracji[];
  meta?: PaginationMeta;
}

/** Pola formularza „Utwórz kurs” w kształcie ciała `POST /admin/courses`. */
export interface NowyKurs {
  title: string;
  slug: string;
  type: CourseType;
  product_group: ProductGroup;
  /** `null` = kurs poza główną ścieżką (puste pole). Wartość nieliczbowa trafia do serwera dosłownie, żeby walidacja ją zobaczyła. */
  sequence_order: number | string | null;
  description: string | null;
}

export function pobierzKursy(strona: number): Promise<StronaKursow> {
  return apiPaged<KursAdministracji>(
    `/admin/courses?page=${strona}&per_page=${LICZBA_NA_STRONE}&sort=sequence_order`,
  );
}

export function utworzKurs(kurs: NowyKurs): Promise<KursAdministracji> {
  return api<KursAdministracji>("/admin/courses", { method: "POST", body: kurs });
}

export function podgladKolejnosci(idKursow: number[]): Promise<ReorderImpactRow[]> {
  return api<ReorderImpactRow[]>("/admin/courses/reorder/preview", {
    method: "POST",
    body: { course_ids: idKursow },
  });
}

export function zapiszKolejnosc(idKursow: number[]): Promise<KursAdministracji[]> {
  return api<KursAdministracji[]>("/admin/courses/reorder", {
    method: "PATCH",
    body: { course_ids: idKursow },
  });
}
