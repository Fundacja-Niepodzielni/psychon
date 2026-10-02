/**
 * H20 — raport roku programu (ekran administracji w nowym wyglądzie).
 *
 * Ta sama trasa co dotychczasowy „Raport edycji” (`GET /admin/report`,
 * `./h20.ts`), ale czyta bloki dopisane do odpowiedzi: `edition`, `period`,
 * `program` (liczby programu, tylko wolontariusze), `students` i nowe pola
 * wiersza osoby. Pliki: zestawienie imienne `export.csv?uklad=zestawienie`
 * (do użytku w Fundacji) i same liczby `report/grantor/export.csv` (dla
 * grantodawcy, bez nazwisk).
 */

import { api, baseUrl } from "./klient";
import { downloadFile } from "./pliki";
import { zapytanie } from "./sciezka";

/** Rok programu — aktywna edycja; daty kalendarzowe `YYYY-MM-DD`. */
export interface RokProgramu {
  id: number;
  name: string;
  starts_at: string | null;
  ends_at: string | null;
}

/** Liczby programu — wyłącznie wolontariusze. Godziny jako dziesiętne napisy. */
export interface LiczbyProgramu {
  admitted: number;
  active: number;
  completed: number;
  with_passed_test: number;
  certificates_valid: number;
  hours_accepted_total: string;
  hours_accepted_average: string;
  consultations_total: number;
}

export interface LiczbyStudentow {
  active: number;
  completed: number;
}

/** Wiersz zestawienia imiennego; `internship` i `supervision` są `null` dla studenta. */
export interface OsobaZestawienia {
  id: number;
  first_name: string;
  last_name: string;
  role: string;
  status: string;
  courses_done: number;
  courses_total: number;
  internship: { done: string; required: string } | null;
  supervision: { attended: number; required: number } | null;
  /** Pierwsze zaliczenie warsztatu, ISO 8601 UTC, albo `null`. */
  workshop_completed_at: string | null;
  hours_accepted: string;
  consultations: number;
  certificate_valid: boolean;
}

export interface RaportRokuProgramu {
  edition: RokProgramu;
  period: { from: string | null; to: string | null };
  program: LiczbyProgramu;
  students: LiczbyStudentow;
  people: OsobaZestawienia[];
}

/** Zakres dat `YYYY-MM-DD`; puste pole to brak zawężenia z tej strony. */
export interface OkresRaportu {
  from?: string;
  to?: string;
}

function parametryOkresu(okres: OkresRaportu): { from?: string; to?: string } {
  return { from: okres.from || undefined, to: okres.to || undefined };
}

export function fetchRaportRokuProgramu(okres: OkresRaportu = {}): Promise<unknown> {
  return api<unknown>(`/admin/report${zapytanie(parametryOkresu(okres))}`);
}

/** Zestawienie imienne do arkusza — dla Fundacji, nigdy dla grantodawcy. */
export function downloadZestawienieRokuProgramu(okres: OkresRaportu = {}): Promise<void> {
  return downloadFile(
    `${baseUrl()}/admin/report/export.csv${zapytanie({ uklad: "zestawienie", ...parametryOkresu(okres) })}`,
    "zestawienie-roku-programu.csv",
  );
}

/** Same liczby dla grantodawcy, bez nazwisk (`GrantorReportAggregates`). */
export function downloadLiczbyDlaGrantodawcy(okres: OkresRaportu = {}): Promise<void> {
  return downloadFile(
    `${baseUrl()}/admin/report/grantor/export.csv${zapytanie(parametryOkresu(okres))}`,
    "liczby-dla-grantodawcy.csv",
  );
}
