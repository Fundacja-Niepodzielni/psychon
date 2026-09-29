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
  duration_seconds: number;
  position_seconds: number;
  watched_seconds: number;
  active_seconds: number;
  is_completed: boolean;
  completable: boolean;
  completable_at_percent: number;
}

export type WynikLekcji =
  | { status: "ok"; dane: DaneLekcji; bezNagrania: boolean }
  | { status: "zablokowany"; komunikat: string }
  | { status: "nie-znaleziono" }
  | { status: "blad" };

/**
 * Whether a signed recording link can be issued for this lesson
 * (`GET /lessons/{id}/video-link`, `backend/routes/api/video.php:18`). A
 * missing recording answers `404 video_missing`; any other failure falls
 * back to "no recording" as well, so a network hiccup never blocks reading
 * the lesson content underneath.
 */
async function maNagranie(id: string): Promise<boolean> {
  try {
    await api(`/lessons/${id}/video-link`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Combines the lesson resource with recording presence. Materials
 * (`backend/routes/api/h05.php:28-30`) are not included here: the material
 * list is only exposed through `GET /courses/{slug}`, keyed by course, and
 * this route only carries a lesson id — there is no field connecting the
 * two without guessing a slug. Left out rather than faked.
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

  const bezNagrania = !(await maNagranie(id));
  return { status: "ok", dane, bezNagrania };
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
