/**
 * H12 — administracja terminami superwizji oraz sprawy zgłaszane
 * administracji przez prowadzącego.
 */

import { apiPaged, api } from "./klient";

export interface AdminSupervisionSignup {
  user: { id: number; first_name: string; last_name: string };
  // Kolumna jest nullable w bazie — dziś zawsze wypełniona, ale typ nie ma
  // obiecywać więcej, niż baza gwarantuje.
  signed_up_at: string | null;
  attendance: "present" | "absent" | null;
}

export interface AdminSupervisionSlot {
  id: number;
  starts_at: string;
  duration_minutes: number;
  seats_limit: number;
  // Zmierzone na żywej odpowiedzi: 1 termin na 10 miał `null`.
  location_or_link: string | null;
  // Znika z koperty, gdy relacja `supervisor` nie jest wczytana po stronie
  // API — pole opcjonalne, nie zawsze obecne.
  supervisor?: { id: number; first_name: string; last_name: string };
  active_signups_count: number;
  available_seats: number;
  signups: AdminSupervisionSignup[];
}

/**
 * Wszystkie terminy wszystkich prowadzących (widok administracji) — kryterium
 * pozycji 6: „potwierdzenie odbycia widoczne (...) w administracji". Obecność
 * (`attendance`) odnotowuje prowadzący na swoim ekranie; tu jest tylko do odczytu.
 *
 * Kontroler nie paginuje — koperta ma wyłącznie `data`, `meta` nigdy nie przychodzi.
 */
export function fetchAdminSupervisionSlots(): Promise<{
  data: AdminSupervisionSlot[];
}> {
  return apiPaged<AdminSupervisionSlot>("/admin/supervision/slots").then(
    ({ data }) => ({ data }),
  );
}

export interface SupervisionCasePerson {
  id: number;
  first_name: string;
  last_name: string;
}

export interface SupervisionCase {
  id: number;
  subject: string;
  body: string;
  created_at: string;
  // Zmierzone na żywej odpowiedzi: klucz obecny w obu wywołaniach kontrolera,
  // bo relacja jest zawsze dociągana razem z rekordem — ale zawężony jako
  // opcjonalny, bo zasobem rządzi `whenLoaded` (ten sam mechanizm, który
  // potrafi zgubić `supervisor` w AdminSupervisionSlot wyżej).
  reporter?: SupervisionCasePerson;
  // Zmierzone: gdy sprawa nie dotyczy konkretnej osoby, klucz zostaje —
  // wartością jest `null`, nie znika (inaczej niż `reporter` powyżej).
  volunteer: SupervisionCasePerson | null;
}

export interface CreateInstructorCasePayload {
  subject: string;
  body: string;
  volunteer_id: number | null;
}

/**
 * Zgłoszenie sprawy przez prowadzącego (pozycja 14). Serwer sam sprawdza, że
 * wskazana osoba należy do grupy zgłaszającego (422 `volunteer_id`, zmierzone
 * na żywo) — front nie powtarza tej reguły.
 */
export function createInstructorCase(
  payload: CreateInstructorCasePayload,
): Promise<SupervisionCase> {
  return api<SupervisionCase>("/instructor/cases", {
    method: "POST",
    body: payload,
  });
}

/**
 * Lista spraw zgłoszonych przez prowadzących (widok administracji).
 * Kontroler nie paginuje — koperta ma wyłącznie `data`, tak samo jak
 * `fetchAdminSupervisionSlots` wyżej.
 */
export function fetchAdminSupervisionCases(): Promise<{
  data: SupervisionCase[];
}> {
  return apiPaged<SupervisionCase>("/admin/supervision/cases").then(
    ({ data }) => ({ data }),
  );
}
