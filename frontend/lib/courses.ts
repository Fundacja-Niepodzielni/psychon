/**
 * Dane pakietu H05 — katalog kursów i strona kursu.
 * Kształty odpowiadają kontraktowi §2 „Kursy (H05)"; `api<T>()` rozpakowuje
 * kopertę `{ data }`, więc tutaj operujemy już na samej treści.
 */
import { api } from "@/lib/api";

export type CourseStatus = "locked" | "in_progress" | "completed";

export type ProductGroup = "psychon" | "dobrostan" | "both";

/** Rodzaj pozycji ścieżki: kurs albo webinar (transmisja na żywo z nagraniem). */
export type CourseType = "course" | "webinar";

/** Okno potwierdzania obecności na webinarze: przed transmisją, w jej dniu, po północy. */
export type AttendanceWindow = "before" | "open" | "closed";

export interface CourseListItem {
  id: number;
  slug: string;
  title: string;
  sequence_order: number | null;
  product_group: ProductGroup;
  status: CourseStatus;
  progress_percent: number;
  /**
   * Rodzaj pozycji. Zaplecze bez webinarów pola nie niesie — brak znaczy „kurs”;
   * dlatego pole jest opcjonalne, choć nowe zaplecze zawsze je zwraca.
   */
  type?: CourseType;
}

export interface LessonSummary {
  id: number;
  title: string;
  sequence_order: number;
  duration_seconds: number | null;
  is_completed: boolean;
}

export interface CourseMaterial {
  id: number;
  name: string;
  /**
   * Rozmiar pliku w bajtach. Pole poza kontraktem §2 — dodane świadomie,
   * zgłoszone strażnikowi jako odstępstwo (7) w `DEMO/H05.md`.
   */
  size: number | null;
  /** Podpisany link ważny 15 minut — kontrakt §2 „podpisany, wygasa". */
  download_url: string;
}

export interface CourseInstructor {
  id: number;
  name: string;
}

export interface CourseDetail extends CourseListItem {
  instructor: CourseInstructor | null;
  lessons: LessonSummary[];
  materials: CourseMaterial[];
  /**
   * Pola webinaru. Dla kursu (`type: "course"`) wszystkie są `null`; zaplecze
   * bez webinarów nie niesie ich wcale (`undefined`). Okno obecności liczy serwer.
   */
  /** Opis webinaru; kontrakt jeszcze go nie opisuje, ekran pokazuje go, gdy jest. */
  description?: string | null;
  /** Początek transmisji, ISO 8601 UTC. */
  starts_at?: string | null;
  /** Odnośnik do transmisji na zewnętrznym serwisie — sam odnośnik, bez osadzania. */
  stream_url?: string | null;
  attendance_window?: AttendanceWindow | null;
  /** Koniec okna obecności (północ w Warszawie po dniu transmisji), ISO 8601 UTC. */
  attendance_closes_at?: string | null;
  /** Własne potwierdzenie obecności osoby pytającej; `null` do czasu potwierdzenia. */
  attended_at?: string | null;
  /** Lekcja z nagraniem — ustawiona dopiero, gdy nagranie można odtworzyć. */
  recording_lesson_id?: number | null;
}

/** Odpowiedź `POST /courses/{slug}/attendance` (201 przy pierwszym potwierdzeniu, 200 przy kolejnym). */
export interface AttendanceConfirmation {
  course_id: number;
  attended_at: string;
}

/**
 * Status kursu → etykieta i wariant odznaki. Kolor nigdy nie jest jedynym
 * nośnikiem statusu (DESIGN.md — „Nie używaj koloru jako jedynego nośnika").
 */
export const COURSE_STATUS_BADGE: Record<
  CourseStatus,
  { label: string; variant: "success" | "accent" | "neutral" }
> = {
  completed: { label: "Ukończony", variant: "success" },
  in_progress: { label: "W toku", variant: "accent" },
  locked: { label: "Zablokowany", variant: "neutral" },
};

/** „Etap 3" dla kursów ze ścieżki, „Poza ścieżką" dla webinarów i zaproszeń. */
export function stageLabel(sequenceOrder: number | null): string {
  return sequenceOrder === null ? "Poza ścieżką" : `Etap ${sequenceOrder}`;
}

/** Czas trwania lekcji w formie czytelnej dla człowieka. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return "Czas nieznany";

  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} godz.`;

  return `${hours} godz. ${minutes} min`;
}

/** Rozmiar pliku w formie czytelnej dla człowieka. */
export function formatFileSize(bytes: number | null): string | null {
  if (bytes === null || bytes <= 0) return null;

  if (bytes < 1024) return `${bytes} B`;

  const units = ["kB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

export function fetchCourses(
  productGroup?: ProductGroup,
): Promise<CourseListItem[]> {
  const query = productGroup
    ? `?product_group=${encodeURIComponent(productGroup)}`
    : "";

  return api<CourseListItem[]>(`/courses${query}`);
}

export function fetchCourse(slug: string): Promise<CourseDetail> {
  return api<CourseDetail>(`/courses/${encodeURIComponent(slug)}`);
}

/**
 * Potwierdzenie obecności na webinarze — `POST /courses/{slug}/attendance`,
 * puste ciało. 201 (pierwsze potwierdzenie) i 200 (już potwierdzone, ta sama
 * data) wracają tym samym kształtem. Odmowy (422 `conditions_not_met` z oknem w
 * `reason`, 403, 404) przychodzą jako `ApiError`.
 */
export function confirmAttendance(slug: string): Promise<AttendanceConfirmation> {
  return api<AttendanceConfirmation>(`/courses/${encodeURIComponent(slug)}/attendance`, { method: "POST" });
}
