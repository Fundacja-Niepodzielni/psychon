/**
 * Dane pulpitu uczestnika (`/panel/pulpit`).
 *
 * Ekran nie ma własnego endpointu agregującego — składa dane po stronie klienta
 * z tras już scalonych do `origin/main`:
 *   - `GET /me`                     (H01) — imię i rola do powitania / degradacji
 *   - `GET /courses`                (H05) — Mapa rozwoju + kafle kursowe
 *   - `GET /courses/{slug}`         (H05) — następna nieukończona lekcja
 *   - `GET /supervision/slots`      (H12) — węzeł odliczania do superwizji
 *   - `GET /certificate/conditions` (H13) — godziny stażu i obecności (tylko rola volunteer)
 *
 * Kształty zgodne z kontraktem §2. `api()` rozpakowuje kopertę `{ data }`.
 */
import { api, apiPaged } from "@/lib/api";
import type { CourseDetail, CourseListItem, LessonSummary } from "@/lib/courses";
import type { ParticipantSlot } from "@/lib/h12/types";

/* -------------------------------------------------------------------- */
/* Kształty odpowiedzi                                                   */
/* -------------------------------------------------------------------- */

/** Wąski wycinek `GET /me` — pulpit potrzebuje tylko imienia i roli. */
export interface PulpitMe {
  first_name: string;
  role: string;
}

/** Pojedynczy warunek z `GET /certificate/conditions` (kontrakt §2 „Certyfikat"). */
export interface CertificateCondition {
  key: "courses" | "internship" | "supervision" | "workshop";
  label: string;
  done?: number | string;
  required?: number | string;
  met: boolean;
}

export interface CertificateConditions {
  eligible: boolean;
  conditions: CertificateCondition[];
}

/* -------------------------------------------------------------------- */
/* Funkcje odczytu                                                       */
/* -------------------------------------------------------------------- */

export function fetchPulpitMe(): Promise<PulpitMe> {
  return api<PulpitMe>("/me");
}

/** Wszystkie terminy superwizji uczestnika (bez paginacji na potrzeby pulpitu). */
export function fetchSupervisionSlots(): Promise<ParticipantSlot[]> {
  return apiPaged<ParticipantSlot>("/supervision/slots?page=1&per_page=100").then(
    (res) => res.data,
  );
}

/** Dostępne tylko dla roli `volunteer` — dla innych ról zwraca 403 (patrz `PulpitDashboard`). */
export function fetchCertificateConditions(): Promise<CertificateConditions> {
  return api<CertificateConditions>("/certificate/conditions");
}

/* -------------------------------------------------------------------- */
/* Rozstrzyganie „następnego kroku"                                      */
/* -------------------------------------------------------------------- */

export type NextStep =
  | {
      kind: "lesson";
      lessonId: number;
      lessonTitle: string;
      courseTitle: string;
      progressPercent: number;
    }
  | { kind: "test"; slug: string; courseTitle: string }
  | { kind: "certificate" }
  | { kind: "empty" };

/** Etapy ścieżki: kursy z `sequence_order`, posortowane rosnąco. Webinary/zaproszenia odpadają. */
export function pathStages(courses: CourseListItem[]): CourseListItem[] {
  return courses
    .filter((c) => c.sequence_order !== null)
    .sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0));
}

function firstUnfinishedLesson(lessons: LessonSummary[]): LessonSummary | undefined {
  return [...lessons]
    .sort((a, b) => a.sequence_order - b.sequence_order)
    .find((lesson) => !lesson.is_completed);
}

/**
 * Kolejność wg `specs/participant-dashboard/spec.md` (Requirement: Karta „Kolejny krok"):
 *  1. etap `in_progress` + pierwsza lekcja `is_completed = false` → `lesson`
 *  2. etap `in_progress` z ukończonymi lekcjami → `test`
 *  3. cała ścieżka `completed` → `certificate`
 *  4. w innym wypadku (np. pierwszy etap nieudostępniony) → `empty`
 *
 * `inProgressDetail` przekazuje wołający tylko wtedy, gdy udało się je pobrać;
 * przypadek błędu pobrania obsługuje komponent (nota w sekcji).
 */
export function resolveNextStep(
  courses: CourseListItem[],
  inProgressDetail: CourseDetail | null,
): NextStep {
  const stages = pathStages(courses);
  const inProgress = stages.find((c) => c.status === "in_progress");

  if (inProgress && inProgressDetail && inProgressDetail.slug === inProgress.slug) {
    const lesson = firstUnfinishedLesson(inProgressDetail.lessons);
    if (lesson) {
      return {
        kind: "lesson",
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        courseTitle: inProgress.title,
        progressPercent: inProgress.progress_percent,
      };
    }
    return { kind: "test", slug: inProgress.slug, courseTitle: inProgress.title };
  }

  if (stages.length > 0 && stages.every((c) => c.status === "completed")) {
    return { kind: "certificate" };
  }

  return { kind: "empty" };
}

/* -------------------------------------------------------------------- */
/* Czas do superwizji                                                    */
/* -------------------------------------------------------------------- */

/** Najwcześniejszy termin z `starts_at` w przyszłości; `null` gdy brak. */
export function nextFutureSlot(
  slots: ParticipantSlot[],
  now: Date = new Date(),
): ParticipantSlot | null {
  const upcoming = slots
    .filter((slot) => new Date(slot.starts_at).getTime() > now.getTime())
    .sort(
      (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
    );

  return upcoming[0] ?? null;
}

/** Czytelny po polsku dystans czasu do `iso` (liczony w UTC z `Date`). */
export function relativeTimeTo(iso: string, now: Date = new Date()): string {
  const diffMs = new Date(iso).getTime() - now.getTime();
  if (diffMs <= 0) return "już trwa";

  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 60) return minutes <= 1 ? "za chwilę" : `za ${minutes} min`;

  const hours = Math.round(diffMs / 3_600_000);
  if (hours < 24) return hours === 1 ? "za godzinę" : `za ${hours} godz.`;

  const days = Math.round(diffMs / 86_400_000);
  if (days === 1) return "jutro";
  if (days < 7) return `za ${days} dni`;
  if (days < 14) return "za tydzień";
  if (days < 31) return `za ${Math.round(days / 7)} tyg.`;

  const months = Math.round(days / 30);
  return months <= 1 ? "za miesiąc" : `za ${months} mies.`;
}

/** Pełna data terminu w lokalizacji polskiej. */
export function fullDateTime(iso: string): string {
  return new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
