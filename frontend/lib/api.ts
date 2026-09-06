/**
 * Klient API zgodny z kontraktem (docs/hackathon/02-kontrakt-api.md).
 *
 * - baza: NEXT_PUBLIC_API_URL + "/api/v1"
 * - token Bearer — jedno źródło dla obu drzwi logowania (logowanie lokalne i
 *   logowanie przez konto Fundacji): sesja Auth.js, odczytana z
 *   `/api/auth/session` (ciasteczko HttpOnly, nigdy `localStorage` — czytelnego
 *   dla każdego skryptu, który trafi na stronę), patrz `getToken`.
 * - koperta odpowiedzi: { data, meta? } — api() zwraca samo `data`,
 *   apiPaged() zwraca { data, meta } (listy z paginacją)
 * - koperta błędu: { error: { status, code, message, errors?, reason? } }
 *   → rzucamy typowany ApiError
 * - 401 → wylogowanie sesji Auth.js + przekierowanie na /logowanie
 * - 403 `access_expired` (H04) → przekierowanie na /dostep-wygasl (ekran startera)
 */

import { signOut } from "next-auth/react";

export interface PaginationMeta {
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
  extra?: Record<string, unknown>;
}

export interface ApiErrorBody {
  status: number;
  code: string;
  message: string;
  errors?: Record<string, string[]>;
  reason?: Record<string, unknown> & { missing?: string[] };
}

export class ApiError extends Error {
  status: number;
  code: string;
  errors?: Record<string, string[]>;
  reason?: ApiErrorBody["reason"];

  constructor(body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiError";
    this.status = body.status;
    this.code = body.code;
    this.errors = body.errors;
    this.reason = body.reason;
  }
}

const SESSION_ENDPOINT = "/api/auth/session";

interface SessionState {
  token: string | null;
  expiresAt: number; // 0 = brak sesji / nieznane
}

let sessionCache: SessionState | null = null;
let sessionInFlight: Promise<SessionState> | null = null;

async function fetchSession(): Promise<SessionState> {
  if (typeof window === "undefined") return { token: null, expiresAt: 0 };
  try {
    const res = await fetch(SESSION_ENDPOINT, { credentials: "same-origin" });
    if (!res.ok) return { token: null, expiresAt: 0 };
    const json = (await res.json()) as {
      accessToken: string | null;
      expiresAt: number | null;
      error?: "RefreshAccessTokenError";
    };
    if (json.error === "RefreshAccessTokenError") {
      // The `jwt` callback tried to rotate the account-system token and
      // failed — the cookie may still exist, but the session behind it is
      // dead. Ending it here, rather than waiting for the next API call to
      // answer 401, is the "drop the session" half of token refresh: the
      // app must not keep saying "signed in" while the token is gone.
      void signOut({ redirect: false });
      return { token: null, expiresAt: 0 };
    }
    return { token: json.accessToken, expiresAt: json.expiresAt ?? 0 };
  } catch {
    return { token: null, expiresAt: 0 };
  }
}

/**
 * Zwraca token do nagłówka `Authorization`, jednakowo dla obu drzwi
 * logowania — oba trzymają swój token w tej samej sesji Auth.js, więc obie
 * odczytują ją stąd, podręcznie cache'owanej do jej wygaśnięcia
 * (`/api/auth/session`). Żaden token nie mieszka w `localStorage`.
 */
export async function getToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  const now = Date.now();
  if (sessionCache && sessionCache.expiresAt - 5000 > now) {
    return sessionCache.token;
  }
  if (!sessionInFlight) {
    sessionInFlight = fetchSession().finally(() => {
      sessionInFlight = null;
    });
  }
  sessionCache = await sessionInFlight;
  return sessionCache.token;
}

/** Czyści tylko podręczny cache po stronie przeglądarki — dla zakończenia
 * samej sesji Auth.js patrz `endSession`. */
function invalidateSessionCache(): void {
  sessionCache = { token: null, expiresAt: 0 };
  sessionInFlight = null;
}

/**
 * Kończy sesję Auth.js po obu drzwiach naraz (jeden mechanizm sesji, jedno
 * wylogowanie) i czyści podręczny cache. Wołane przez ekran „Twoje konto" i
 * automatycznie po nieoczekiwanym 401 z API — dawniej to drugie czyściło
 * tylko pamięć karty i zostawiało ciasteczko sesji nietknięte.
 */
export async function endSession(): Promise<void> {
  invalidateSessionCache();
  await signOut({ redirect: false });
}

export interface ApiOptions extends Omit<RequestInit, "body"> {
  /** Obiekt → JSON; FormData → multipart (uploady). */
  body?: unknown;
}

function baseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  return `${raw.replace(/\/+$/, "")}/api/v1`;
}

async function request(path: string, options: ApiOptions = {}): Promise<unknown> {
  const { body, headers: extraHeaders, ...init } = options;

  const headers = new Headers(extraHeaders);
  headers.set("Accept", "application/json");

  const token = await getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body; // przeglądarka sama ustawi multipart boundary
  } else if (body !== undefined) {
    headers.set("Content-Type", "application/json");
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers,
    body: payload,
  });

  // 401 = brak/nieważny token → koniec sesji + przekierowanie na /logowanie
  if (res.status === 401) {
    if (typeof window !== "undefined") {
      void endSession().finally(() => {
        window.location.assign(new URL("/logowanie", window.location.origin));
      });
    }
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // brak JSON-a (np. 502 z proxy) — obsłużone niżej
  }

  const envelope = json as { error?: Partial<ApiErrorBody> } | null;
  const err = envelope?.error;

  // 403 access_expired (H04) → wspólny ekran startera "Dostęp wygasł"
  if (res.status === 403 && err?.code === "access_expired" && typeof window !== "undefined") {
    window.location.assign(new URL("/dostep-wygasl", window.location.origin));
  }

  if (!res.ok) {
    throw new ApiError({
      status: err?.status ?? res.status,
      code: err?.code ?? "unknown_error",
      message:
        err?.message ?? "Coś poszło nie tak. Spróbuj ponownie za chwilę.",
      errors: err?.errors,
      reason: err?.reason,
    });
  }

  return json;
}

/** Zwraca `data` z koperty odpowiedzi. */
export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const json = (await request(path, options)) as { data: T };
  return json.data;
}

/** Dla list z paginacją — zwraca `data` oraz `meta`. */
export async function apiPaged<T>(
  path: string,
  options: ApiOptions = {},
): Promise<{ data: T[]; meta?: PaginationMeta }> {
  return (await request(path, options)) as { data: T[]; meta?: PaginationMeta };
}

export interface WhoAmI {
  sub: string;
  roles: string[];
}

/**
 * `GET /sso/whoami` — jedyny punkt, który potwierdza, że wywołanie API
 * niesie token z sesji konta Fundacji, i pokazuje dokładnie to, co ten token
 * niesie (`sub`, `roles`). Odpowiedź NIE jest owinięta w kopertę `{ data }`
 * jak reszta API, więc woła `request()`-owy fetch niżej wprost, a nie przez
 * `api<T>()`.
 */
export async function fetchWhoAmI(): Promise<WhoAmI> {
  const token = await getToken();
  const headers = new Headers({ Accept: "application/json" });
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${baseUrl()}/sso/whoami`, { headers });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // brak JSON-a — obsłużone niżej przez rzucenie błędu z samym kodem HTTP
  }

  if (!res.ok) {
    const err = (json as { error?: Partial<ApiErrorBody> } | null)?.error;
    throw new ApiError({
      status: err?.status ?? res.status,
      code: err?.code ?? "unknown_error",
      message: err?.message ?? "Nie udało się potwierdzić tożsamości.",
      reason: err?.reason,
    });
  }

  const body = json as Partial<WhoAmI> | null;
  if (!body || typeof body.sub !== "string") {
    throw new ApiError({
      status: res.status,
      code: "unexpected_response",
      message: "Nieoczekiwana odpowiedź serwera.",
    });
  }
  return { sub: body.sub, roles: Array.isArray(body.roles) ? body.roles : [] };
}

/**
 * Pobiera plik przez `fetch` z nagłówkiem Bearer i zapisuje go jako blob —
 * zwykły `<a href>` nie przeniósłby tokenu do trasy chronionej autoryzacją
 * (kontrakt §2, H14 „Pobranie podpisanym wygasającym linkiem").
 */
export async function downloadFile(url: string, filename: string): Promise<void> {
  const headers = new Headers();
  const token = await getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(url, { headers });

  if (!res.ok) {
    let body: { error?: Partial<ApiErrorBody> } | null = null;
    try {
      body = await res.json();
    } catch {
      // brak JSON-a w odpowiedzi błędu
    }
    throw new ApiError({
      status: body?.error?.status ?? res.status,
      code: body?.error?.code ?? "unknown_error",
      message: body?.error?.message ?? "Nie udało się pobrać pliku.",
    });
  }

  const blob = await res.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
}

/* -------------------------------------------------------------------- */
/* H14 — dokumenty generowane z profilu                                  */
/* -------------------------------------------------------------------- */

export type DocumentType = "volunteer_agreement" | "internship_certificate";

export interface DocumentDto {
  id: number;
  type: DocumentType;
  number: string;
  generated_at: string;
  signature_status: "none" | "signed_offline" | "e_signed";
  download_url: string;
}

export interface DocumentTypeAvailability {
  available: boolean;
  reason?: "profile_incomplete" | "conditions_not_met" | "already_generated" | null;
  missing_fields?: string[];
  hours_accepted?: string;
  hours_required?: string;
  document_id?: number;
}

export type DocumentAvailableTypes = Record<DocumentType, DocumentTypeAvailability>;

export async function fetchDocuments(): Promise<{
  documents: DocumentDto[];
  availableTypes: DocumentAvailableTypes | null;
}> {
  const { data, meta } = await apiPaged<DocumentDto>("/documents");
  const availableTypes =
    (meta?.extra?.available_types as DocumentAvailableTypes | undefined) ?? null;

  return { documents: data, availableTypes };
}

export function generateDocument(type: DocumentType): Promise<DocumentDto> {
  return api<DocumentDto>("/documents/generate", {
    method: "POST",
    body: { type },
  });
}

/* -------------------------------------------------------------------- */
/* H18 — panel osób i karta osoby                                        */
/* -------------------------------------------------------------------- */

export type UserRole =
  | "super_admin"
  | "project_manager"
  | "instructor"
  | "volunteer"
  | "student";

export type UserStatus = "active" | "blocked";

export interface AdminUserListItem {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  product_group: "psychon" | "dobrostan" | "both";
  access_expires_at: string | null;
  program_completed_at: string | null;
  created_at: string | null;
}

export interface AdminUserProfile {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  role: UserRole;
  phone: string | null;
  pesel: string | null;
  address: { street: string | null; city: string | null; zip: string | null };
  access_expires_at: string | null;
  program_completed_at: string | null;
  product_group: string;
}

export interface AdminUserCard {
  profile: AdminUserProfile;
  progress: {
    courses_done: number;
    courses_total: number;
    hours_accepted: string;
    supervision_present: number;
    workshop_done: boolean;
  };
  documents: { id: number; type: string; number: string }[];
  recent_notifications: {
    id: number;
    type: string;
    title: string;
    body: string | null;
    link: string | null;
    read_at: string | null;
    created_at: string;
  }[];
  audit_entries: {
    id: number;
    action: string;
    actor_id: number | null;
    details: Record<string, unknown> | null;
    created_at: string | null;
  }[];
}

export interface AdminUserFilters {
  role?: string;
  status?: string;
  search?: string;
  sort?: string;
  page?: number;
  per_page?: number;
}

function adminUsersQuery(filters: AdminUserFilters): string {
  const params = new URLSearchParams();
  if (filters.role) params.set("role", filters.role);
  if (filters.status) params.set("status", filters.status);
  if (filters.search) params.set("search", filters.search);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.per_page) params.set("per_page", String(filters.per_page));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function fetchAdminUsers(
  filters: AdminUserFilters = {},
): Promise<{ data: AdminUserListItem[]; meta?: PaginationMeta }> {
  return apiPaged<AdminUserListItem>(`/admin/users${adminUsersQuery(filters)}`);
}

export function fetchAdminUser(id: number): Promise<AdminUserCard> {
  return api<AdminUserCard>(`/admin/users/${id}`);
}

export function createAdminUser(body: {
  first_name: string;
  last_name: string;
  email: string;
  role: UserRole;
}): Promise<AdminUserCard> {
  return api<AdminUserCard>("/admin/users", { method: "POST", body });
}

export function updateAdminUser(
  id: number,
  body: Record<string, unknown>,
): Promise<AdminUserCard> {
  return api<AdminUserCard>(`/admin/users/${id}`, { method: "PATCH", body });
}

export function blockAdminUser(
  id: number,
  reason: string,
): Promise<AdminUserCard> {
  return api<AdminUserCard>(`/admin/users/${id}/block`, {
    method: "POST",
    body: { reason },
  });
}

export function downloadAdminUsersCsv(
  filters: AdminUserFilters = {},
): Promise<void> {
  const raw = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const url = `${raw.replace(/\/+$/, "")}/api/v1/admin/users/export.csv${adminUsersQuery(
    { ...filters, page: undefined, per_page: undefined },
  )}`;
  return downloadFile(url, "osoby.csv");
}

/* -------------------------------------------------------------------- */
/* H20 — raporty i dziennik działań                                      */
/* -------------------------------------------------------------------- */

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
}

export interface ReportData {
  summary: ReportSummaryData;
  people: ReportPersonRow[];
}

export function fetchReport(): Promise<ReportData> {
  return api<ReportData>("/admin/report");
}

export function downloadReportCsv(): Promise<void> {
  const raw = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const url = `${raw.replace(/\/+$/, "")}/api/v1/admin/report/export.csv`;
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
