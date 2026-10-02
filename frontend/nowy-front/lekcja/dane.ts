import { api, ApiError } from "@/lib/api/klient";

/**
 * Lesson resource shape — `GET /lessons/{id}` (`backend/routes/api/h06.php:114-152`).
 * `openapi.json` types `completable`/`completable_at_percent` as strings; the
 * route above returns them as boolean/int. This module follows the route,
 * not the generated document — the mismatch is reported separately.
 */
export interface DaneLekcji {
  id: number;
  title: string;
  description: string | null;
  /** Treść w podzbiorze Markdown (kontrakt, „Treść lekcji”) albo `null`. */
  content: string | null;
  /** Kurs lekcji (kontrakt, odczyt lekcji); samo pole niczego nie otwiera. */
  course: { id: number; slug: string; title: string };
  /** Temat lekcji w kursie (okruszki) albo `null`. */
  topic: { id: number; title: string; position: number } | null;
  duration_seconds: number;
  position_seconds: number;
  watched_seconds: number;
  active_seconds: number;
  is_completed: boolean;
  completable: boolean;
  completable_at_percent: number;
  /** Czas aktywny w sekundach, od którego `completable` zmienia się na `true`. */
  required_active_seconds: number;
  /** Do kogo trafi pytanie zadane z ekranu lekcji (tylko imię i nazwisko) albo `null`. */
  question_addressee: { name: string } | null;
  /**
   * Stan nagrania z punktu widzenia uczestnika (kontrakt, „Stan nagrania
   * lekcji”): `ready` dokładnie wtedy, gdy link do nagrania zostanie wydany.
   */
  video_status?: "none" | "uploading" | "processing" | "ready" | "error";
}

/**
 * Why a lesson shows no player although it is not simply a lesson without a
 * recording: `w-przygotowaniu` — the recording exists but is not ready yet
 * (being sent, processed, or failed at the provider; the participant is told
 * one thing only: it is being prepared); `blad` — the recording link could
 * not be read for a reason other than a missing or unready recording.
 */
export type PowodBrakuOdtwarzacza = "w-przygotowaniu" | "blad";

export type WynikLekcji =
  | { status: "ok"; dane: DaneLekcji; bezNagrania: boolean; nagranie?: PowodBrakuOdtwarzacza }
  | { status: "zablokowany"; komunikat: string }
  | { status: "nie-znaleziono" }
  | { status: "blad" };

/** Whether a text field carries anything besides whitespace. */
export function maTekst(tekst: string | null | undefined): boolean {
  return typeof tekst === "string" && tekst.trim() !== "";
}

/**
 * What the main column shows for a loaded lesson:
 * - `odtwarzacz` — `LessonPlayer` (recording frame, steps, questions, completion
 *   condition); also used for a lesson without a recording as long as it has a
 *   short description, because the organism hands its own empty state to any
 *   recording-less lesson with a blank description;
 * - `sama-tresc` — no recording, no description, but a content body: only the
 *   title and the content, no empty player frame;
 * - `pusta` — nothing to show at all: an honest empty state, no fake content.
 */
export type UkladGlownej = "odtwarzacz" | "sama-tresc" | "pusta";

export function ukladGlownej(
  dane: Pick<DaneLekcji, "description" | "content">,
  bezNagrania: boolean,
): UkladGlownej {
  if (!bezNagrania || maTekst(dane.description)) return "odtwarzacz";
  return maTekst(dane.content) ? "sama-tresc" : "pusta";
}

/** Breadcrumb trail: course area, the topic when the lesson has one, the lesson itself. */
export function okruszkiLekcji(dane: Pick<DaneLekcji, "title" | "topic">): { etykieta: string }[] {
  return [
    { etykieta: "Kursy" },
    ...(dane.topic ? [{ etykieta: dane.topic.title }] : []),
    { etykieta: dane.title },
  ];
}

/** What the screen knows about the recording: playable, absent, or one of the reasons above. */
type NagranieLekcji = "jest" | "brak" | PowodBrakuOdtwarzacza;

/**
 * Recording state for the participant. `video_status` from the lesson
 * resource decides first: `none` is a lesson without a recording, `uploading`,
 * `processing` and `error` are a recording being prepared — in neither case is
 * the link asked for. For `ready` the signed link is requested
 * (`GET /lessons/{id}/video-link`, `backend/routes/api/video.php:18`): refusal
 * `404 video_not_ready` means "being prepared", `404 video_missing` means no
 * recording, any other failure is an error the screen names.
 *
 * A lesson resource without `video_status` (backend before recording state)
 * keeps the previous behavior: the link is always asked for and a failure
 * other than `video_not_ready` falls back to "no recording", so a network
 * hiccup never blocks reading the lesson content underneath.
 */
async function nagranieLekcji(id: string, kod: DaneLekcji["video_status"]): Promise<NagranieLekcji> {
  if (kod === "none") return "brak";
  if (kod === "uploading" || kod === "processing" || kod === "error") return "w-przygotowaniu";
  try {
    await api(`/lessons/${id}/video-link`);
    return "jest";
  } catch (wyjatek) {
    if (wyjatek instanceof ApiError && wyjatek.code === "video_not_ready") return "w-przygotowaniu";
    if (wyjatek instanceof ApiError && wyjatek.code === "video_missing") return "brak";
    return kod === undefined ? "brak" : "blad";
  }
}

/**
 * Combines the lesson resource with recording presence. Files to download
 * are not included here: the file list is only exposed through
 * `GET /courses/{slug}`, keyed by course, and the lesson resource carries no
 * course. The screen takes the course from the `?kurs=<slug>` address
 * parameter instead (`./adres.ts`, `../pliki-kursu/dane.ts`).
 */
export async function pobierzDaneLekcji(id: string): Promise<WynikLekcji> {
  let dane: DaneLekcji;
  try {
    dane = await api<DaneLekcji>(`/lessons/${id}`);
  } catch (wyjatek) {
    if (wyjatek instanceof ApiError && wyjatek.code === "course_locked") {
      return { status: "zablokowany", komunikat: wyjatek.message };
    }
    if (wyjatek instanceof ApiError && wyjatek.status === 404) {
      return { status: "nie-znaleziono" };
    }
    return { status: "blad" };
  }

  const nagranie = await nagranieLekcji(id, dane.video_status);
  if (nagranie === "jest") return { status: "ok", dane, bezNagrania: false };
  if (nagranie === "brak") return { status: "ok", dane, bezNagrania: true };
  return { status: "ok", dane, bezNagrania: true, nagranie };
}

/**
 * Active-time percent, computed the same way as the completion snapshot
 * (`backend/routes/api/h06.php:145-153`): active seconds over duration,
 * rounded, capped at 100. The route itself only returns raw seconds, never
 * a ready percent.
 */
export function procentAktywnegoCzasu(dane: Pick<DaneLekcji, "active_seconds" | "duration_seconds">): number {
  if (dane.duration_seconds <= 0) return 0;
  return Math.min(100, Math.round((dane.active_seconds / dane.duration_seconds) * 100));
}

/** Odpowiedź `POST /lessons/{id}/progress` — liczniki po stronie serwera (kontrakt, „Postęp lekcji”). */
export interface PostepLekcji {
  watched_seconds: number;
  active_seconds: number;
  completable: boolean;
  completable_at_percent: number;
}

/**
 * Heartbeat tick, `POST /lessons/{id}/progress` (`backend/routes/api/h06.php:159-206`,
 * request field names bound by `H06ProgressRequest` in `backend/openapi.json`:
 * `watched_delta`/`active_delta`, both required non-negative integers). Returns
 * the counters the server holds after the tick — the screen needs them to know
 * when the lesson becomes completable — or `null` when the tick failed, so the
 * caller keeps the increments and sends them with the next tick instead of
 * losing them.
 */
export async function wyslijPostep(
  id: string,
  przyrosty: { watched_delta: number; active_delta: number },
): Promise<PostepLekcji | null> {
  try {
    return await api<PostepLekcji>(`/lessons/${id}/progress`, { method: "POST", body: przyrosty });
  } catch {
    return null;
  }
}

export type WynikUkonczenia =
  | { status: "ok"; completed_at: string | null }
  | { status: "za-malo-czasu" }
  | { status: "blad" };

/** `POST /lessons/{id}/complete` (`backend/routes/api/h06.php:208-259`). */
export async function ukonczLekcje(id: string): Promise<WynikUkonczenia> {
  try {
    const wynik = await api<{ is_completed: boolean; completed_at: string | null }>(
      `/lessons/${id}/complete`,
      { method: "POST" },
    );
    return { status: "ok", completed_at: wynik.completed_at };
  } catch (wyjatek) {
    if (wyjatek instanceof ApiError && wyjatek.code === "not_enough_active_time") {
      return { status: "za-malo-czasu" };
    }
    return { status: "blad" };
  }
}
