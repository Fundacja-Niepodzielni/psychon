/**
 * Dane pulpitów uczestnika (U-01, `02-MAPA-EKRANOW.md` w. 84) i studenta
 * (U-02, w. 85). Wyłącznie dokładnie te trasy:
 *  - `GET /me`                     (H01, `backend/routes/api/h01.php:27`) — tylko `role` i
 *                                   `program_completed_at`
 *  - `GET /courses`                (H05, `backend/routes/api/h05.php:23`)
 *  - `GET /courses/{slug}`         (H05, `backend/routes/api/h05.php:24`)
 *  - `GET /internship/entries`     (H11, `backend/routes/api/h11.php:26`) — tylko `meta.extra`
 *  - `GET /supervision/slots`      (H12, `backend/routes/api/h12.php:27`)
 *  - `GET /certificate/conditions` (H13, `backend/routes/api/h13.php:27`)
 *
 * Kształty odpowiedzi odczytane z zasobów zaplecza (nie zgadywane):
 *  - `backend/app/Http/Resources/ProfileResource.php:67,77` (`role`,
 *    `program_completed_at`) i `backend/openapi.json:12526`, schemat
 *    `ProfileResource`
 *  - `backend/app/Http/Resources/CourseListResource.php:38-45`
 *  - `backend/app/Http/Resources/CourseDetailResource.php:26-36` +
 *    `LessonSummaryResource` (pola w `backend/openapi.json`,
 *    schemat `LessonSummaryResource`)
 *  - `backend/app/Http/Resources/H12/SupervisionSlotResource.php:16-33`
 *  - `backend/app/Support/H13/CertificateConditions.php:110-117`
 *  - `backend/app/Http/Controllers/Api/V1/H11/InternshipEntryController.php:36-45`
 *    (`meta.extra.accepted_hours`/`required_hours`)
 *
 * Odczyt startowy biegnie z przeglądarki — ten sam powód co
 * `nowy-front/formy-stazu/dane.ts` i `nowy-front/superwizje-terminy/dane.ts`:
 * `@/auth` po stronie serwera nie wstaje pod Vitest/jsdom na trasach
 * statycznych.
 */
import { api, apiPaged } from "@/lib/api/klient";
import type { KursSciezki, LekcjaKursu } from "./nastepny-krok";

export type { KursSciezki, LekcjaKursu };

/** Wycinek `GET /me`: rola rozstrzyga, który pulpit się pokaże, data zakończenia
 * programu — czy uczestnik jest już po programie. */
export interface KontoPulpitu {
  role: string;
  program_completed_at: string | null;
}

export interface SzczegolKursu extends KursSciezki {
  /** Czy kurs ma test; kurs bez testu ma warunek testu spełniony z definicji. */
  has_test: boolean;
  lessons: LekcjaKursu[];
}

export interface WarunekCertyfikatu {
  key: "courses" | "webinars" | "internship" | "supervision" | "workshop";
  label: string;
  done?: number | string;
  required?: number | string;
  met: boolean;
}

export interface WarunkiCertyfikatu {
  eligible: boolean;
  conditions: WarunekCertyfikatu[];
}

export interface GodzinyStazu {
  accepted_hours: string;
  required_hours: string;
}

export interface TerminSuperwizji {
  id: number;
  starts_at: string;
  location_or_link: string | null;
}

export function pobierzKonto(): Promise<KontoPulpitu> {
  return api<KontoPulpitu>("/me");
}

export function pobierzKursy(): Promise<KursSciezki[]> {
  return api<KursSciezki[]>("/courses");
}

export function pobierzSzczegolKursu(slug: string): Promise<SzczegolKursu> {
  return api<SzczegolKursu>(`/courses/${slug}`);
}

export function pobierzWarunkiCertyfikatu(): Promise<WarunkiCertyfikatu> {
  return api<WarunkiCertyfikatu>("/certificate/conditions");
}

/**
 * Wyłącznie `meta.extra` — pełna, stronicowana lista własnych wpisów stażu
 * żyje na ekranie `nowy-front/formy-stazu`, więc żądamy tu najmniejszej
 * strony. Brak `meta.extra` w odpowiedzi jest rozjazdem z kontraktem
 * (§1 „Paginacja"/§2 H11), nie stanem do cichego zamaskowania zerami —
 * rzucamy, żeby wywołujący pokazał to jako `blad` sekcji, tak samo jak
 * odrzucenie sieciowe.
 */
export async function pobierzGodzinyStazu(): Promise<GodzinyStazu> {
  const odpowiedz = await apiPaged<unknown>("/internship/entries?page=1&per_page=1");
  const extra = odpowiedz.meta?.extra;
  if (
    typeof extra?.accepted_hours !== "string" ||
    typeof extra?.required_hours !== "string"
  ) {
    throw new Error("GET /internship/entries: brak meta.extra zgodnego z kontraktem H11.");
  }
  return { accepted_hours: extra.accepted_hours, required_hours: extra.required_hours };
}

export async function pobierzNadchodzaceSuperwizje(): Promise<TerminSuperwizji[]> {
  const odpowiedz = await apiPaged<TerminSuperwizji>("/supervision/slots?page=1&per_page=100");
  return odpowiedz.data;
}
