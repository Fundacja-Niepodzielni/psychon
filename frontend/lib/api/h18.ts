/**
 * H18 — panel osób i karta osoby.
 */

import { api, apiPaged, PaginationMeta } from "./klient";
import { downloadFile } from "./pliki";

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

export interface SupervisorAssignment {
  volunteer_id: number;
  supervisor_id: number;
  assigned_at: string | null;
  unassigned_at: string | null;
}

/**
 * Nadanie prowadzącego (H12). O tym, czy przypisanie jest dopuszczalne
 * (osoba musi być wolontariuszką, wskazany użytkownik prowadzącym),
 * rozstrzyga serwer — 422 wraca jako `ApiError` do pokazania na ekranie.
 */
export function assignSupervisor(
  userId: number,
  supervisorId: number,
): Promise<SupervisorAssignment> {
  return api<SupervisorAssignment>(`/admin/users/${userId}/supervisor`, {
    method: "PUT",
    body: { supervisor_id: supervisorId },
  });
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
