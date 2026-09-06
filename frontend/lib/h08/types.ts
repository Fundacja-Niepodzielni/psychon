/**
 * Pakiet H08 · typy DTO panelu CMS (zasoby administracyjne z faz 2–4).
 *
 * Wywołania idą przez generyczne `api<T>()` / `apiPaged<T>()` z `lib/api.ts` —
 * pakiet nie dokłada własnych funkcji klienta API.
 */

export type CourseType = "course" | "webinar";
export type ProductGroup = "psychon" | "dobrostan" | "both";

/** Status kursu w ścieżce uczestnika — liczy go `CourseAccess` po stronie API. */
export type CourseAccessState = "locked" | "in_progress" | "completed";

/** Kurs w panelu administracji — widzi także szkice (`is_published = false`). */
export interface AdminCourse {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  type: CourseType;
  product_group: ProductGroup;
  /** `null` = kurs poza główną ścieżką (np. webinar). */
  sequence_order: number | null;
  edition_id: number | null;
  is_published: boolean;
  lessons_count: number;
  materials_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface AdminLesson {
  id: number;
  course_id: number;
  title: string;
  description: string | null;
  sequence_order: number | null;
  /** Tekstowy identyfikator nagrania (mock — bez uploadu wideo). */
  video_provider_id: string | null;
  duration_seconds: number;
  materials_count: number;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * Materiał w panelu (zasób administracyjny H08b). Bez `download_url` —
 * podpisany link jest wystawiany wyłącznie uczestnikowi (H05).
 */
export interface AdminMaterial {
  id: number;
  name: string;
  mime: string | null;
  size: number | null;
  /** Materiał wisi przy lekcji ALBO przy kursie — drugie pole jest wtedy `null`. */
  lesson_id: number | null;
  course_id: number | null;
  created_at: string | null;
}

/** Jeden wiersz podglądu wpływu zmiany kolejności ścieżki na statusy osób. */
export interface ReorderImpactRow {
  user_id: number;
  first_name: string;
  last_name: string;
  course_id: number;
  course_title: string;
  from: CourseAccessState;
  to: CourseAccessState;
}

export const COURSE_TYPE_LABELS: Record<CourseType, string> = {
  course: "Kurs",
  webinar: "Webinar",
};

export const PRODUCT_GROUP_LABELS: Record<ProductGroup, string> = {
  psychon: "Psychon",
  dobrostan: "Dobrostan",
  both: "Obie grupy",
};

export const COURSE_STATE_LABELS: Record<CourseAccessState, string> = {
  locked: "Zablokowany",
  in_progress: "W trakcie",
  completed: "Ukończony",
};
