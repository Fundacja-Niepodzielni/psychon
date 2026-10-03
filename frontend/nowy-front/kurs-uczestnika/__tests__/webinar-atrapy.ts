import type { KursUczestnika } from "../dane";

/**
 * Atrapa odczytu webinaru (`GET /courses/{slug}`, `type: "webinar"`) i
 * odpowiedzi `POST /courses/{slug}/attendance`. Dane przykładowe, bez
 * prawdziwych osób; adres transmisji pochodzi z domeny zastrzeżonej dla przykładów.
 */

export const SLUG_WEBINARU = "webinar-o-kryzysie";
export const POCZATEK = "2026-11-05T17:00:00Z";
export const KONIEC_OKNA = "2026-11-05T23:00:00Z";
export const ADRES_TRANSMISJI = "https://transmisja.example.org/webinar/42";

/** Odczyt webinaru w danym oknie; `nadpisania` nadpisuje pola odczytu. */
export function odczytWebinaru(nadpisania: Partial<KursUczestnika> = {}): KursUczestnika {
  return {
    id: 12,
    slug: SLUG_WEBINARU,
    title: "Webinar: rozmowa w kryzysie",
    status: "in_progress",
    progress_percent: 0,
    type: "webinar",
    description: "Spotkanie na żywo z prowadzącą o tym, jak rozmawiać z osobą w kryzysie.",
    starts_at: POCZATEK,
    stream_url: ADRES_TRANSMISJI,
    attendance_window: "before",
    attendance_closes_at: KONIEC_OKNA,
    attended_at: null,
    recording_lesson_id: null,
    topics: [],
    lessons: [],
    has_test: false,
    test_locked: false,
    test_passed: false,
    ...nadpisania,
  };
}

/** Ukończony webinar: `status` i 100% (nie ma osobnego pola „completed”). */
export const UKONCZONY = { status: "completed", progress_percent: 100 } as const;

/** Lekcja z nagraniem w kształcie dzisiejszej pozycji listy lekcji (jedyna, gdy nagranie jest odtwarzalne). */
export function lekcjaNagrania(id = 345): KursUczestnika["lessons"][number] {
  return {
    id,
    title: "Nagranie webinaru",
    sequence_order: 1,
    duration_seconds: 3600,
    is_completed: false,
    topic_id: null,
    locked: false,
    active_seconds: 0,
    required_active_seconds: 2880,
    has_recording: true,
  };
}
