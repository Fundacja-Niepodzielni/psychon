/**
 * H01 — zgłoszenie dalszej współpracy (po zakończeniu programu) i jego
 * obsługa w administracji. Trasy z aneksu kontraktu przyjętego jako stan
 * już istniejącego kodu (kontrakt dogonił kod, nie odwrotnie):
 * `CooperationRequestController` / `AdminCooperationRequestController`,
 * `backend/routes/api/h01.php`.
 *
 * Bez `access.active` na trasach osoby (§ komentarz `h01.php`) — dostęp do
 * zgłoszenia współpracy ma zostać osiągalny nawet po wygaśnięciu dostępu do
 * kursów.
 */

import { api, apiPaged, type PaginationMeta } from "./klient";

export type CooperationRequestStatus = "new" | "answered" | "closed";

/** Zasób widziany przez osobę zgłaszającą — bez danych administracji
 * (`CooperationRequestResource`). */
export interface CooperationRequest {
  id: number;
  body: string;
  status: CooperationRequestStatus;
  response: string | null;
  responded_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/** Osoba zgłaszająca — wyłącznie pola z `AdminCooperationRequestResource`,
 * żadnych innych pól konta. */
export interface CooperationRequestUser {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
}

/** Zasób administracyjny — zasób osoby rozszerzony o `responded_by` i
 * `user` (`AdminCooperationRequestResource`). */
export interface AdminCooperationRequest extends CooperationRequest {
  responded_by: number | null;
  user: CooperationRequestUser | null;
}

/** Wycinek `GET /me` potrzebny temu ekranowi — nie cały profil (§ kontrakt
 * H01/M2), tylko dwa pola rządzące widocznością formularza. */
export interface DaneJa {
  program_completed_at: string | null;
  role: string;
}

/** `GET /me` (`ProfileController::show`, `backend/routes/api/h01.php:27`). */
export function pobierzJa(): Promise<DaneJa> {
  return api<DaneJa>("/me");
}

/**
 * `POST /cooperation-requests` (`CooperationRequestController::store`) →
 * 201, pełny zasób osoby. 403 `program_not_completed`; 409
 * `cooperation_request_open` (jest już zgłoszenie `new`); 422
 * `errors.body` (≤ 2000 znaków).
 */
export function zglosWspolprace(body: string): Promise<CooperationRequest> {
  return api<CooperationRequest>("/cooperation-requests", {
    method: "POST",
    body: { body },
  });
}

export interface ParametryMoichZgloszen {
  page?: number;
  per_page?: number;
}

/**
 * `GET /cooperation-requests/mine` (`CooperationRequestController::mine`) —
 * wyłącznie własne zgłoszenia, najnowsze pierwsze (serwer sortuje malejąco
 * po `created_at`, potem po `id`). Rola inna niż `volunteer`/`student` →
 * 403 `forbidden`.
 */
export function pobierzMojeZgloszenia(
  parametry: ParametryMoichZgloszen = {},
): Promise<{ data: CooperationRequest[]; meta?: PaginationMeta }> {
  const query = new URLSearchParams();
  if (parametry.page !== undefined) query.set("page", String(parametry.page));
  if (parametry.per_page !== undefined) query.set("per_page", String(parametry.per_page));
  const przyrostek = query.toString();
  return apiPaged<CooperationRequest>(`/cooperation-requests/mine${przyrostek ? `?${przyrostek}` : ""}`);
}

export interface ParametryZgloszenAdministracji {
  status?: CooperationRequestStatus;
  page?: number;
  per_page?: number;
}

/**
 * `GET /admin/cooperation-requests` (`AdminCooperationRequestController::index`,
 * dostęp: `project_manager`, `super_admin`) — filtr `status`, sortowanie
 * rosnąco po `created_at`, potem po `id` (serwer).
 */
export function pobierzZgloszeniaAdministracji(
  parametry: ParametryZgloszenAdministracji = {},
): Promise<{ data: AdminCooperationRequest[]; meta?: PaginationMeta }> {
  const query = new URLSearchParams();
  if (parametry.status !== undefined) query.set("status", parametry.status);
  if (parametry.page !== undefined) query.set("page", String(parametry.page));
  if (parametry.per_page !== undefined) query.set("per_page", String(parametry.per_page));
  const przyrostek = query.toString();
  return apiPaged<AdminCooperationRequest>(`/admin/cooperation-requests${przyrostek ? `?${przyrostek}` : ""}`);
}

export interface PayloadOdpowiedzi {
  response: string;
  status: "answered" | "closed";
}

/**
 * `PATCH /admin/cooperation-requests/{id}` (`AdminCooperationRequestController::respond`)
 * → 200, pełny zasób administracyjny. 403 `cooperation_request_closed`
 * (decyzja już zapadła); 404 `not_found`; 422 `errors` (`response`/`status`).
 */
export function odpowiedzNaZgloszenie(
  id: number,
  payload: PayloadOdpowiedzi,
): Promise<AdminCooperationRequest> {
  return api<AdminCooperationRequest>(`/admin/cooperation-requests/${id}`, {
    method: "PATCH",
    body: payload,
  });
}
