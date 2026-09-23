/**
 * H20 — raporty i dziennik działań.
 */

import { api, apiPaged, PaginationMeta } from "./klient";
import { downloadFile } from "./pliki";
import { UserRole } from "./h18";

export interface ReportSummaryData {
  admitted: number;
  active: number;
  completed: number;
  hours_accepted_total: string;
  hours_accepted_average: string;
  consultations_total: number;
  certificates_issued: number;
}

export interface ReportPersonRow {
  id: number;
  first_name: string;
  last_name: string;
  role: UserRole;
  hours_accepted: string;
  consultations: number;
  certificate_issued: boolean;
  /** Klucz etapu (kontrakt backendu: `kurs|staz|superwizja|warsztat|gotowa|certyfikat`). */
  stage: string;
  /** Etykieta po polsku gotowa do wyświetlenia — backend jest jedynym źródłem tekstu. */
  stage_label: string;
}

export interface ReportData {
  summary: ReportSummaryData;
  people: ReportPersonRow[];
}

/** Zakres dat (ISO), oba pola opcjonalne; nazwy jak w `AuditFilters`. */
export interface ReportFilters {
  from?: string;
  to?: string;
}

function reportQuery(filters: ReportFilters): string {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function fetchReport(filters: ReportFilters = {}): Promise<ReportData> {
  return api<ReportData>(`/admin/report${reportQuery(filters)}`);
}

export function downloadReportCsv(filters: ReportFilters = {}): Promise<void> {
  const raw = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const url = `${raw.replace(/\/+$/, "")}/api/v1/admin/report/export.csv${reportQuery(filters)}`;
  return downloadFile(url, "raport.csv");
}

/** Rejestr slugów akcji audytu (kontrakt §3.2) — jedyne dopuszczalne w filtrze. */
export const AUDIT_ACTIONS = [
  "application.accepted",
  "application.rejected",
  "access.extended",
  "course.created",
  "course.updated",
  "course.deleted",
  "assignment.created",
  "assignment.removed",
  "attempt.finished",
  "attempts.reset",
  "workshop.completed",
  "internship.accepted",
  "internship.returned",
  "internship.rejected",
  "supervisor.assigned",
  "certificate.issued",
  "document.generated",
  "profile.accepted",
  "profile.returned",
  "profile.withdrawn",
  "user.created",
  "user.updated",
  "user.blocked",
  "edition.updated",
  "sensitive.viewed",
  "certificate.revoked",
  "legal_document.published",
  "legal_document.accepted",
  "supervision.attendance_marked",
  "user.anonymized",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditActor {
  id: number;
  first_name: string;
  last_name: string;
}

export interface AuditLogEntryDto {
  id: number;
  action: string;
  actor: AuditActor | null;
  subject_type: string | null;
  subject_id: number | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditFilters {
  action?: string;
  user_id?: number;
  from?: string;
  to?: string;
  page?: number;
  per_page?: number;
}

function auditQuery(filters: AuditFilters): string {
  const params = new URLSearchParams();
  if (filters.action) params.set("action", filters.action);
  if (filters.user_id) params.set("user_id", String(filters.user_id));
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.per_page) params.set("per_page", String(filters.per_page));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function fetchAuditLog(
  filters: AuditFilters = {},
): Promise<{ data: AuditLogEntryDto[]; meta?: PaginationMeta }> {
  return apiPaged<AuditLogEntryDto>(`/admin/audit${auditQuery(filters)}`);
}

export function downloadAuditLogCsv(filters: AuditFilters = {}): Promise<void> {
  const raw = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const url = `${raw.replace(/\/+$/, "")}/api/v1/admin/audit/export.csv${auditQuery(
    { ...filters, page: undefined, per_page: undefined },
  )}`;
  return downloadFile(url, "dziennik.csv");
}
