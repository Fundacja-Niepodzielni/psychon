/**
 * Raport rozszerzony (H20 — `GET /admin/reports`, `GET /admin/reports/closing`).
 *
 * Osobny plik, nie `./h20.ts`: `./h20.ts` obsługuje istniejący
 * `GET /admin/report` (liczba pojedyncza) — inny, wcześniejszy ekran tego
 * samego pakietu. Ten plik woła nowy kontrakt (liczba mnoga), współdzielony
 * z zapleczem — kształt pól poniżej ma pozostać zgodny z opisem PR zaplecza,
 * gdy ten już stoi.
 *
 * Zestaw `summary` jest tu CELOWO liczony z tej samej listy `people`, którą
 * ekran pokazuje (a nie z osobnego zapytania jak w starym `/admin/report`)
 * — dokładnie po to, żeby każda liczba miała jedno źródło i dało się ją
 * bez wątpliwości powiązać z filtrem listy osób, z której pochodzi.
 */

import { api } from "./klient";
import type { UserRole, UserStatus } from "./h18";

/** Klucz etapu (kontrakt backendu: `kurs|staz|superwizja|warsztat|gotowa|certyfikat`). */
export type ReportStageKey = "kurs" | "staz" | "superwizja" | "warsztat" | "gotowa" | "certyfikat";

export interface ReportsPersonRow {
  id: number;
  first_name: string;
  last_name: string;
  role: UserRole;
  status: UserStatus;
  /** Etap ścieżki tej osoby — patrz `ReportStageKey`. */
  stage: ReportStageKey;
  /** Etykieta po polsku gotowa do wyświetlenia — backend jest jedynym źródłem tekstu. */
  stage_label: string;
  /** Liczba różnych zaliczonych testów tej osoby — osobna liczba, nie zlewa się z etapem. */
  tests_passed: number;
  hours_accepted: string;
  consultations: number;
  certificate_issued: boolean;
}

export interface ReportsSummary {
  admitted: number;
  active: number;
  completed: number;
  certificates_issued: number;
  /**
   * Liczba OSÓB z co najmniej jednym zaliczonym testem — nazwa jak w
   * odpowiedzi zaplecza (`ReportSummary::build()`). Celowo inna niż
   * `ReportsPersonRow.tests_passed`, które liczy TESTY jednej osoby.
   */
  people_with_passed_test: number;
  hours_accepted_total: string;
  consultations_total: number;
}

export interface ReportsData {
  summary: ReportsSummary;
  people: ReportsPersonRow[];
}

/** Zakres dat (ISO), oba pola opcjonalne; nazewnictwo jak w `ReportFilters` (`./h20.ts`). */
export interface ReportsFilters {
  from?: string;
  to?: string;
}

function reportsQuery(filters: ReportsFilters): string {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function fetchReports(filters: ReportsFilters = {}): Promise<ReportsData> {
  return api<ReportsData>(`/admin/reports${reportsQuery(filters)}`);
}

export interface ClosingReportPersonRow {
  id: number;
  first_name: string;
  last_name: string;
  role: UserRole;
  stage: ReportStageKey;
  stage_label: string;
  certificate_issued: boolean;
}

export interface ClosingReportEdition {
  id: number;
  name: string;
  ends_at: string | null;
}

export interface ClosingReportSummary {
  total: number;
  certified: number;
  not_certified: number;
}

export interface ClosingReportData {
  edition: ClosingReportEdition;
  summary: ClosingReportSummary;
  people: ClosingReportPersonRow[];
}

export function fetchClosingReport(editionId: number): Promise<ClosingReportData> {
  return api<ClosingReportData>(`/admin/reports/closing?edition=${editionId}`);
}
