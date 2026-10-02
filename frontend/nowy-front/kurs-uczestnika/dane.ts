import { api, ApiError, NieprawidlowaSciezkaApi } from "@/lib/api/klient";

/**
 * Odczyt strony kursu uczestnika — wyłącznie `GET /courses/{slug}`
 * (`backend/routes/api/h05.php`, kształt `CourseDetailResource` i
 * `LessonSummaryResource`). Zaplecze niesie w każdej odpowiedzi: przy lekcji
 * `locked`, `active_seconds`, `required_active_seconds` i `has_recording`, przy
 * kursie `test_locked` i `test_passed` (wszystkie w `required` schematów w
 * `backend/openapi.json`); stany ekranu biorą się z tych pól. Odpowiedź starszego
 * zaplecza może ich nie mieć — wtedy ekran nie zgłasza błędu: brak `locked` znaczy
 * „otwarta”, brak pól postępu — bez linii postępu, brak `test_passed` — jak dotąd.
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
