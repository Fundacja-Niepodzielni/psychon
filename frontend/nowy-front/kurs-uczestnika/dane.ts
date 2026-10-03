import { api, ApiError, NieprawidlowaSciezkaApi } from "@/lib/api/klient";
import type { AttendanceWindow, CourseType } from "@/lib/courses";

/**
 * Odczyt strony kursu uczestnika — wyłącznie `GET /courses/{slug}`
 * (`backend/routes/api/h05.php`, kształt `CourseDetailResource` i
 * `LessonSummaryResource`). Zaplecze niesie w każdej odpowiedzi: przy lekcji
 * `locked`, `active_seconds`, `required_active_seconds` i `has_recording`, przy
 * kursie `test_locked` i `test_passed` (wszystkie w `required` schematów w
 * `backend/openapi.json`); stany ekranu biorą się z tych pól. Odpowiedź starszego
 * zaplecza może ich nie mieć — wtedy ekran nie zgłasza błędu: brak `locked` znaczy
 * „otwarta”, brak pól postępu — bez linii postępu, brak `test_passed` — jak dotąd.
 *
 * Webinar (`type: "webinar"`) to ta sama trasa z polami transmisji i obecności
 * (`starts_at`, `stream_url`, `attendance_window`, `attendance_closes_at`,
 * `attended_at`, `recording_lesson_id`); dla kursu są puste, a zaplecze bez
 * webinarów nie niesie ich wcale — brak `type` znaczy „kurs” i ekran działa
 * dokładnie jak dotąd. Potwierdzenie obecności to osobne żądanie
 * `POST /courses/{slug}/attendance` (`potwierdzObecnosc`, `lib/courses.ts`).
 */

export type StatusKursu = "locked" | "in_progress" | "completed";

export interface LekcjaKursu {
  id: number;
  title: string;
  sequence_order: number;
  duration_seconds: number | null;
  is_completed: boolean;
  topic_id: number | null;
  /** Lekcja zamknięta kolejnością „lekcje po kolei” (zawsze `false` dla personelu i prowadzącego). */
  locked: boolean;
  /** Czas aktywny uczestnika w tej lekcji, w sekundach (`0` bez postępu; także dla lekcji zamkniętej). */
  active_seconds: number;
  /** Czas aktywny potrzebny do ukończenia lekcji, w sekundach (lekcja bez nagrania: `0`). */
  required_active_seconds: number;
  /** `false` — lekcja do czytania, bez nagrania; `true` — opis czasu nagrania. */
  has_recording: boolean;
}

export interface TematKursu {
  id: number;
  title: string;
  position: number;
}

export interface KursUczestnika {
  id: number;
  slug: string;
  title: string;
  status: StatusKursu;
  progress_percent: number;
  topics?: TematKursu[];
  lessons: LekcjaKursu[];
  /** Czy kurs ma test; kurs bez testu ma warunek testu spełniony z definicji. */
  has_test: boolean;
  /** Test zamknięty — rozstrzyga zaplecze (`false` dla kursu bez testu, bez lekcji i dla personelu). */
  test_locked: boolean;
  /** Test zaliczony — rozstrzyga zaplecze (`false` dla kursu bez testu). */
  test_passed: boolean;
  /** Rodzaj pozycji; brak pola (zaplecze bez webinarów) znaczy „kurs”. */
  type?: CourseType;
  /** Opis webinaru; kontrakt go jeszcze nie opisuje, ekran pokazuje go, gdy jest. */
  description?: string | null;
  starts_at?: string | null;
  stream_url?: string | null;
  attendance_window?: AttendanceWindow | null;
  attendance_closes_at?: string | null;
  attended_at?: string | null;
  recording_lesson_id?: number | null;
}

/** Adres listy kursów uczestnika. */
export const ADRES_LISTY_KURSOW = "/panel/kursy";

/** Adres testu kursu (istniejąca strona `panel/kursy/[slug]/test`). */
export function adresTestu(slug: string): string {
  return `${ADRES_LISTY_KURSOW}/${slug}/test`;
}

export function pobierzKurs(slug: string): Promise<KursUczestnika> {
  return api<KursUczestnika>(`/courses/${encodeURIComponent(slug)}`);
}

/** Stany ekranu bez danych kursu. */
export type BladKursu =
  | { rodzaj: "zamkniety"; komunikat: string }
  | { rodzaj: "dostep-wygasl" }
  | { rodzaj: "nie-znaleziono" }
  | { rodzaj: "siec" }
  | { rodzaj: "blad" };

/**
 * Klasyfikacja błędu odczytu kursu:
 *  - 403 `course_locked` → kurs zamknięty kolejnością (zdanie z `message` serwera);
 *  - 403 `access_expired` → dostęp wygasł (klient API przekierowuje sam na
 *    ekran „Dostęp wygasł”, ekran pokazuje zdanie na czas przekierowania);
 *  - 404 → kursu nie ma albo nie należy do ścieżki osoby;
 *  - wyjątek bez odpowiedzi → brak połączenia;
 *  - każda inna odpowiedź → błąd odczytu.
 */
export function sklasyfikujBladKursu(wyjatek: unknown): BladKursu {
  // Slug z adresu, którego klient API nie przepuścił, to adres bez kursu.
  if (wyjatek instanceof NieprawidlowaSciezkaApi) return { rodzaj: "nie-znaleziono" };
  if (!(wyjatek instanceof ApiError)) return { rodzaj: "siec" };
  if (wyjatek.status === 403 && wyjatek.code === "course_locked") {
    return { rodzaj: "zamkniety", komunikat: wyjatek.message };
  }
  if (wyjatek.status === 403 && wyjatek.code === "access_expired") return { rodzaj: "dostep-wygasl" };
  if (wyjatek.status === 404) return { rodzaj: "nie-znaleziono" };
  return { rodzaj: "blad" };
}

/** Potwierdzenie obecności na webinarze: `POST /courses/{slug}/attendance`, puste ciało. */
export { confirmAttendance as potwierdzObecnosc } from "@/lib/courses";

/** Czym skończyło się potwierdzenie obecności, gdy się nie udało. */
export type BladObecnosci =
  /** 422 `conditions_not_met`: okno jeszcze się nie otwarło albo już się zamknęło (zdanie z `message` serwera). */
  | { rodzaj: "okno"; komunikat: string; okno: AttendanceWindow | null; otwiera: string | null; zamyka: string | null }
  /** 403 `access_expired`: dostęp wygasł. */
  | { rodzaj: "dostep-wygasl"; komunikat: string }
  /** 403 z innego powodu, np. rola, która nie potwierdza obecności. */
  | { rodzaj: "brak-dostepu"; komunikat: string }
  | { rodzaj: "nie-znaleziono"; komunikat: string }
  /** Każda inna odpowiedź serwera. */
  | { rodzaj: "serwer"; komunikat: string }
  /** Wyjątek bez odpowiedzi: brak połączenia. */
  | { rodzaj: "siec" };

function tekstLubNull(wartosc: unknown): string | null {
  return typeof wartosc === "string" && wartosc.trim() !== "" ? wartosc : null;
}

/**
 * Klasyfikacja błędu potwierdzenia obecności. Zdanie dla osoby zawsze pochodzi
 * z `message` serwera (ekran nie ma własnego zdania zamiast niego); okno z
 * `reason.window` (`before` | `closed`) dopasowuje stan ekranu do serwera.
 */
export function sklasyfikujBladObecnosci(wyjatek: unknown): BladObecnosci {
  if (!(wyjatek instanceof ApiError)) return { rodzaj: "siec" };
  if (wyjatek.status === 422 && wyjatek.code === "conditions_not_met") {
    const okno = wyjatek.reason?.window;
    return {
      rodzaj: "okno",
      komunikat: wyjatek.message,
      okno: okno === "before" || okno === "closed" ? okno : null,
      otwiera: tekstLubNull(wyjatek.reason?.opens_at),
      zamyka: tekstLubNull(wyjatek.reason?.closes_at),
    };
  }
  if (wyjatek.status === 403 && wyjatek.code === "access_expired") return { rodzaj: "dostep-wygasl", komunikat: wyjatek.message };
  if (wyjatek.status === 403) return { rodzaj: "brak-dostepu", komunikat: wyjatek.message };
  if (wyjatek.status === 404) return { rodzaj: "nie-znaleziono", komunikat: wyjatek.message };
  return { rodzaj: "serwer", komunikat: wyjatek.message };
}
