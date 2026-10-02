import { api, apiPaged, ApiError } from "@/lib/api/klient";

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
  /** Temat lekcji w kursie (okruszki) albo `null`. */
  topic: { id: number; title: string; position: number } | null;
  /** Kurs lekcji (okruszki, powrót, dojście do odczytu kursu); brak w odpowiedzi sprzed zmiany zaplecza. */
  course?: { id: number; slug: string; title: string } | null;
  /** Adresat pytania do lekcji (nazwisko prowadzącego) albo `null`; brak w odpowiedzi sprzed zmiany. */
  question_addressee?: { name: string } | null;
  /** Czas aktywny (s) wymagany do ukończenia — liczy go serwer; brak w odpowiedzi sprzed zmiany. */
  required_active_seconds?: number | null;
  duration_seconds: number;
  /** Pozycja wznowienia z postępu osoby (`0` bez postępu); starsze odpowiedzi mogą pola nie mieć. */
  position_seconds?: number | null;
  watched_seconds: number;
  active_seconds: number;
  is_completed: boolean;
  completable: boolean;
  completable_at_percent: number;
  /**
   * Stan nagrania z punktu widzenia uczestnika (kontrakt, „Stan nagrania
   * lekcji”): `ready` dokładnie wtedy, gdy link do nagrania zostanie wydany.
   */
  video_status?: "none" | "uploading" | "processing" | "ready" | "error";
}

/**
 * Why a lesson shows no player although it is not simply a lesson without a
 * recording: `w-przygotowaniu` — the recording is being sent or processed at
 * the provider, or its link was refused with `video_not_ready`; `nie-dziala`
 * — the recording failed at the provider (`video_status: "error"`) or its link
 * could not be issued (`video-link` answers 503 and any other failure). The
 * two are told apart on the screen: the first passes by itself, the second
 * needs the instructor.
 */
export type PowodBrakuOdtwarzacza = "w-przygotowaniu" | "nie-dziala";

/**
 * Co odpowiedź `video-link` daje odtwarzaczowi: adres odtwarzania (`url`),
 * adres osadzenia (`embed_url`) i czas jego wygaśnięcia (`embed_expires_at`,
 * czas uniksowy w sekundach). Każde pole może nie wystąpić.
 */
export interface ZrodloNagrania {
  adres?: string;
  adresOsadzenia?: string;
  osadzenieWygasaO?: number;
}

export type WynikLekcji =
  | {
      status: "ok";
      dane: DaneLekcji;
      bezNagrania: boolean;
      nagranie?: PowodBrakuOdtwarzacza;
      /** Źródło nagrania z `GET /lessons/{id}/video-link`; brak, gdy nie ma odtwarzalnego nagrania. */
      zrodloNagrania?: ZrodloNagrania;
    }
  | { status: "zablokowany"; komunikat: string }
  | { status: "wygasl"; komunikat: string }
  | ({ status: "lekcja-zamknieta" } & OdmowaKolejnosci)
  | { status: "nie-znaleziono" }
  | { status: "blad" };

/**
 * Odmowa `403 lesson_locked`: lekcja jest zamknięta kolejnością i najpierw trzeba
 * ukończyć inną. `wymaganaLekcjaId` pochodzi z `reason.required_lesson_id`; gdy
 * odpowiedź go nie niesie (sam kod), `null` — ekran pokazuje wtedy zdanie serwera.
 * Każde żądanie ekranu (odczyt, postęp, ukończenie, link nagrania, pytania) może ją zwrócić.
 */
export interface OdmowaKolejnosci {
  odmowaKolejnosci: true;
  komunikat: string;
  wymaganaLekcjaId: number | null;
}

/** `OdmowaKolejnosci` z wyjątku API albo `null`, gdy to inna odmowa. */
export function odmowaKolejnosci(wyjatek: unknown): OdmowaKolejnosci | null {
  if (!(wyjatek instanceof ApiError) || wyjatek.code !== "lesson_locked") return null;
  const wymagana = wyjatek.reason?.required_lesson_id;
  return {
    odmowaKolejnosci: true,
    komunikat: wyjatek.message,
    wymaganaLekcjaId: typeof wymagana === "number" && Number.isInteger(wymagana) && wymagana > 0 ? wymagana : null,
  };
}

/** Whether a text field carries anything besides whitespace. */
export function maTekst(tekst: string | null | undefined): boolean {
  return typeof tekst === "string" && tekst.trim() !== "";
}

/** What the screen knows about the recording: playable, absent, or one of the reasons above. */
type NagranieLekcji =
  | { rodzaj: "jest"; zrodlo: ZrodloNagrania }
  | { rodzaj: "brak" }
  | { rodzaj: "zamknieta"; odmowa: OdmowaKolejnosci }
  | { rodzaj: PowodBrakuOdtwarzacza };

/** Odpowiedź `GET /lessons/{id}/video-link`: adres odtwarzania, adres osadzenia z czasem wygaśnięcia (czas uniksowy). */
interface LinkNagrania {
  url?: string;
  embed_url?: string;
  embed_expires_at?: number;
}

/**
 * Recording state for the participant. `video_status` from the lesson
 * resource decides first: `none` is a lesson without a recording, `uploading`
 * and `processing` are a recording being prepared, `error` is a recording that
 * does not work — in none of them is the link asked for. For `ready` the
 * signed link is requested (`GET /lessons/{id}/video-link`,
 * `backend/routes/api/video.php:18`): refusal `404 video_not_ready` means
 * "being prepared", `404 video_missing` means no recording, and any other
 * failure — `503 video_not_configured` first of all — means the recording does
 * not work. A failed link is never reported as "no recording".
 *
 * A lesson resource without `video_status` (backend before recording state)
 * keeps the previous behavior for failures other than 503: the link is always
 * asked for and a failure falls back to "no recording", so a network hiccup
 * never blocks reading the lesson content underneath.
 */
async function nagranieLekcji(id: string, kod: DaneLekcji["video_status"]): Promise<NagranieLekcji> {
  if (kod === "none") return { rodzaj: "brak" };
  if (kod === "uploading" || kod === "processing") return { rodzaj: "w-przygotowaniu" };
  if (kod === "error") return { rodzaj: "nie-dziala" };
  try {
    const link = await api<LinkNagrania | null>(`/lessons/${id}/video-link`);
    const tekst = (wartosc: unknown) => (typeof wartosc === "string" && wartosc !== "" ? wartosc : undefined);
    return {
      rodzaj: "jest",
      zrodlo: {
        adres: tekst(link?.url),
        adresOsadzenia: tekst(link?.embed_url),
        osadzenieWygasaO: typeof link?.embed_expires_at === "number" ? link.embed_expires_at : undefined,
      },
    };
  } catch (wyjatek) {
    const odmowa = odmowaKolejnosci(wyjatek);
    if (odmowa !== null) return { rodzaj: "zamknieta", odmowa };
    if (wyjatek instanceof ApiError && wyjatek.code === "video_not_ready") return { rodzaj: "w-przygotowaniu" };
    if (wyjatek instanceof ApiError && wyjatek.code === "video_missing") return { rodzaj: "brak" };
    if (wyjatek instanceof ApiError && wyjatek.status === 503) return { rodzaj: "nie-dziala" };
    return kod === undefined ? { rodzaj: "brak" } : { rodzaj: "nie-dziala" };
  }
}

/**
 * Combines the lesson resource with recording presence. Course context
 * (topic progress, next lesson, files, test) is read separately from
 * `GET /courses/{slug}` with the slug from `dane.course` (`./kurs.ts`).
 */
export async function pobierzDaneLekcji(id: string): Promise<WynikLekcji> {
  let dane: DaneLekcji;
  try {
    dane = await api<DaneLekcji>(`/lessons/${id}`);
  } catch (wyjatek) {
    const odmowa = odmowaKolejnosci(wyjatek);
    if (odmowa !== null) return { status: "lekcja-zamknieta", ...odmowa };
    if (wyjatek instanceof ApiError && wyjatek.code === "course_locked") {
      return { status: "zablokowany", komunikat: wyjatek.message };
    }
    if (wyjatek instanceof ApiError && wyjatek.code === "access_expired") {
      return { status: "wygasl", komunikat: wyjatek.message };
    }
    if (wyjatek instanceof ApiError && wyjatek.status === 404) {
      return { status: "nie-znaleziono" };
    }
    return { status: "blad" };
  }

  const nagranie = await nagranieLekcji(id, dane.video_status);
  if (nagranie.rodzaj === "zamknieta") return { status: "lekcja-zamknieta", ...nagranie.odmowa };
  if (nagranie.rodzaj === "jest") return { status: "ok", dane, bezNagrania: false, zrodloNagrania: nagranie.zrodlo };
  if (nagranie.rodzaj === "brak") return { status: "ok", dane, bezNagrania: true };
  return { status: "ok", dane, bezNagrania: true, nagranie: nagranie.rodzaj };
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

/**
 * Pozycja, od której startuje odtwarzanie: `position_seconds` z odczytu lekcji
 * (`GET /lessons/{id}`, zawsze liczba całkowita >= 0, `0` dla osoby bez
 * postępu). Brak pola, `null`, wartość nieskończona albo niedodatnia → od
 * początku (0); wartość większa lub równa długości nagrania (także przy
 * długości 0) → od początku, bo nie ma od czego wznawiać.
 */
export function pozycjaStartowa(dane: Pick<DaneLekcji, "position_seconds" | "duration_seconds">): number {
  const pozycja = dane.position_seconds;
  if (typeof pozycja !== "number" || !Number.isFinite(pozycja) || pozycja <= 0) return 0;
  const calkowita = Math.floor(pozycja);
  if (calkowita >= dane.duration_seconds) return 0;
  return calkowita;
}

/** Odpowiedź `POST /lessons/{id}/progress` — liczniki po stronie serwera (kontrakt, „Postęp lekcji”). */
export interface PostepLekcji {
  watched_seconds: number;
  active_seconds: number;
  completable: boolean;
  completable_at_percent: number;
  /** Czas aktywny (s) wymagany do ukończenia; brak w odpowiedzi sprzed zmiany zaplecza. */
  required_active_seconds?: number | null;
}

/**
 * Heartbeat tick, `POST /lessons/{id}/progress` (`backend/routes/api/h06.php:159-206`,
 * request field names bound by `H06ProgressRequest` in `backend/openapi.json`:
 * `watched_delta`/`active_delta`, both required non-negative integers, plus the
 * optional `position_seconds` — the absolute playback position, a non-negative
 * integer the server overwrites rather than sums). Returns the counters the
 * server holds after the tick — the screen needs them to know when the lesson
 * becomes completable — or `null` when the tick failed, so the caller keeps the
 * increments and sends them with the next tick instead of losing them. A refusal
 * `403 lesson_locked` is returned as `OdmowaKolejnosci`: the caller stops sending.
 */
export async function wyslijPostep(
  id: string,
  przyrosty: { watched_delta: number; active_delta: number; position_seconds: number },
): Promise<PostepLekcji | OdmowaKolejnosci | null> {
  try {
    return await api<PostepLekcji>(`/lessons/${id}/progress`, { method: "POST", body: przyrosty });
  } catch (wyjatek) {
    return odmowaKolejnosci(wyjatek);
  }
}

export type WynikUkonczenia =
  | { status: "ok"; completed_at: string | null }
  | { status: "za-malo-czasu" }
  | { status: "zamknieta"; odmowa: OdmowaKolejnosci }
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
    const odmowa = odmowaKolejnosci(wyjatek);
    if (odmowa !== null) return { status: "zamknieta", odmowa };
    return { status: "blad" };
  }
}

/**
 * Pytanie osoby do lekcji — element `GET /lessons/{id}/questions`
 * (`backend/app/Http/Resources/H17/ParticipantQuestionResource.php`): `answer`,
 * `answered_by_name` i `answered_at` są `null`, dopóki prowadzący nie odpowie.
 */
export interface PytanieLekcji {
  id: number;
  lesson_id: number;
  question: string;
  answer: string | null;
  answered_by_name: string | null;
  answered_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * Własne pytania osoby do lekcji, najnowsze pierwsze (kolejność z serwera). `null`, gdy odczyt się nie udał;
 * `OdmowaKolejnosci`, gdy lekcja jest zamknięta kolejnością.
 */
export async function pobierzPytania(idLekcji: string): Promise<PytanieLekcji[] | OdmowaKolejnosci | null> {
  try {
    const wynik = await apiPaged<PytanieLekcji>(`/lessons/${idLekcji}/questions?per_page=100`);
    return Array.isArray(wynik.data) ? wynik.data : [];
  } catch (wyjatek) {
    return odmowaKolejnosci(wyjatek);
  }
}

export type WynikPytania =
  | { status: "ok"; pytanie: PytanieLekcji }
  | { status: "zamknieta"; odmowa: OdmowaKolejnosci }
  | { status: "blad"; komunikat: string };

/** `POST /lessons/{id}/questions` `{ question }` → 201 z pytaniem (ta sama postać co na liście). */
export async function wyslijPytanie(idLekcji: string, tresc: string): Promise<WynikPytania> {
  try {
    const pytanie = await api<PytanieLekcji>(`/lessons/${idLekcji}/questions`, {
      method: "POST",
      body: { question: tresc },
    });
    return { status: "ok", pytanie };
  } catch (wyjatek) {
    const odmowa = odmowaKolejnosci(wyjatek);
    if (odmowa !== null) return { status: "zamknieta", odmowa };
    const blad = wyjatek instanceof ApiError ? wyjatek.errors?.question?.[0] : undefined;
    return { status: "blad", komunikat: blad ?? "Nie udało się wysłać pytania. Spróbuj ponownie." };
  }
}
