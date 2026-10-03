/**
 * Prowadzący osoby na liście osób i przypisanie jednego prowadzącego wielu
 * osobom naraz (`POST /admin/supervisor-assignments`).
 *
 * Lista osób (`GET /admin/users`) i karta osoby (`GET /admin/users/{id}`)
 * niosą pole tylko do odczytu `supervisor` — bieżącego prowadzącego albo
 * `null`; karta niesie też `account` (stan i data założenia konta). Typy
 * poniżej rozszerzają kształty z `./h18`, nie zmieniając ich.
 */

import { api, type PaginationMeta } from "./klient";
import {
  fetchAdminUsers,
  type AdminUserCard,
  type AdminUserFilters,
  type AdminUserListItem,
  type AccountStatus,
} from "./h18";

/** Bieżący prowadzący osoby: identyfikator i imię z nazwiskiem. */
export interface CurrentSupervisor {
  id: number;
  name: string;
}

export interface AdminUserListItemWithSupervisor extends AdminUserListItem {
  supervisor: CurrentSupervisor | null;
}

export interface AdminUserCardWithSupervisor extends AdminUserCard {
  supervisor: CurrentSupervisor | null;
  account: { status: AccountStatus; created_at: string | null };
}

/** Najwięcej osób w jednym żądaniu przypisania — ten sam limit co na serwerze. */
export const MAX_PEOPLE_AT_ONCE = 100;

/** Wynik dla jednej osoby: przypisano, bez zmian, odmowa (z kodem powodu), nie znaleziono. */
export type SupervisorAssignmentOutcome = "assigned" | "unchanged" | "refused" | "not_found";

export interface SupervisorAssignmentResult {
  user_id: number;
  result: SupervisorAssignmentOutcome;
  /**
   * Kod powodu odmowy: `not_assignable` (inna rola niż wolontariusz albo konto
   * zablokowane lub zanonimizowane); `null` poza odmową.
   */
  reason: string | null;
}

export interface SupervisorAssignmentToManyResponse {
  supervisor_id: number;
  results: SupervisorAssignmentResult[];
  summary: Record<"requested" | SupervisorAssignmentOutcome, number>;
}

/** Lista osób razem z bieżącym prowadzącym każdej z nich. */
export async function fetchAdminUsersWithSupervisor(
  filters: AdminUserFilters = {},
): Promise<{ data: AdminUserListItemWithSupervisor[]; meta?: PaginationMeta }> {
  const strona = await fetchAdminUsers(filters);
  return strona as { data: AdminUserListItemWithSupervisor[]; meta?: PaginationMeta };
}

/** Najwięcej stron listy prowadzących czytanych przy jednym otwarciu okna. */
const LIMIT_STRON_PROWADZACYCH = 10;

/**
 * Wszyscy kandydaci na prowadzącego: aktywne konta z rolą „Psycholog
 * prowadzący”, strona po stronie po 100. Serwer przyjmuje przy przypisaniu
 * wielu osób wyłącznie aktywne konto prowadzącego, więc okno nie pokazuje
 * zablokowanych.
 */
export async function fetchInstructors(): Promise<AdminUserListItem[]> {
  const wynik: AdminUserListItem[] = [];
  for (let strona = 1; strona <= LIMIT_STRON_PROWADZACYCH; strona += 1) {
    const { data, meta } = await fetchAdminUsers({ role: "instructor", status: "active", page: strona, per_page: 100 });
    wynik.push(...data);
    if (meta === undefined || meta.current_page >= meta.last_page) break;
  }
  return wynik;
}

/**
 * Przypisanie jednego prowadzącego wielu osobom. Częściowy sukces jest
 * dozwolony: odpowiedź `200` niesie wynik każdej osoby w kolejności żądania.
 */
export function assignSupervisorToMany(
  supervisorId: number,
  userIds: number[],
): Promise<SupervisorAssignmentToManyResponse> {
  return api<SupervisorAssignmentToManyResponse>("/admin/supervisor-assignments", {
    method: "POST",
    body: { supervisor_id: supervisorId, user_ids: userIds },
  });
}
