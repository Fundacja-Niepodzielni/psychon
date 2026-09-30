import type { WierszRecordList } from "@/design-system/organizmy/RecordList/RecordList";
import { ApiError, type PaginationMeta } from "@/lib/api/klient";
import {
  downloadAdminUsersCsv,
  fetchAdminUsers,
  type AdminUserFilters,
  type AdminUserListItem,
  type UserRole,
} from "@/lib/api/h18";
import { ROLE_LABELS } from "@/lib/h18/labels";

/**
 * Dane ekranu „Uczestnicy programu” — `GET /admin/users`
 * (`backend/routes/api/h18.php:26`, `AdminUserController::index`) i eksport
 * `GET /admin/users/export.csv` (`h18.php:25`, `AdminUserController::export`).
 * Oba czytają te same filtry z `AdminUserQuery`: `role`, `search`, `status`,
 * `sort`; ekran używa `role` i `search` (kontrakt, „Panel — osoby”), kolejność
 * to domyślne `-created_at`. Stronicowanie: `page`, `per_page` (max 100).
 *
 * Odczyt i pobranie biegną z przeglądarki (Bearer z sesji) — serwerowy
 * `@/auth` nie wstaje pod Vitest/jsdom.
 */

export const LICZBA_NA_STRONE = 25;
export const LIMIT_SZUKANEJ_FRAZY = 255;

/** Ścieżka ekranu karty osoby (A-07). */
export const SCIEZKA_KARTY = "/nowy-front/admin/uczestniczki";

/** Ścieżka ekranu zgłoszeń rekrutacyjnych — skąd biorą się osoby w programie. */
export const SCIEZKA_ZGLOSZEN = "/nowy-front/admin/zgloszenia";

export interface FiltrOsob {
  role: UserRole | "";
  search: string;
}

export const PUSTY_FILTR: FiltrOsob = { role: "", search: "" };

export interface StronaOsob {
  data: AdminUserListItem[];
  meta?: PaginationMeta;
}

export const OPCJE_ROLI: { wartosc: string; etykieta: string }[] = [
  { wartosc: "", etykieta: "Wszystkie role" },
  ...(Object.keys(ROLE_LABELS) as UserRole[]).map((rola) => ({ wartosc: rola, etykieta: ROLE_LABELS[rola] })),
];

export function filtrAktywny(filtr: FiltrOsob): boolean {
  return filtr.role !== "" || filtr.search !== "";
}

/** Filtry zapytania wyłącznie z pól, które ekran ustawia (puste pomijane). */
export function filtryZapytania(filtr: FiltrOsob, strona?: number): AdminUserFilters {
  const fraza = filtr.search.trim().slice(0, LIMIT_SZUKANEJ_FRAZY);
  return {
    role: filtr.role === "" ? undefined : filtr.role,
    search: fraza === "" ? undefined : fraza,
    page: strona,
    per_page: strona === undefined ? undefined : LICZBA_NA_STRONE,
  };
}

export function pobierzOsoby(filtr: FiltrOsob, strona: number): Promise<StronaOsob> {
  return fetchAdminUsers(filtryZapytania(filtr, strona));
}

/** Pobranie tabeli dla bieżącego filtra — bez stronicowania (kontroler zwraca całość). */
export function pobierzTabele(filtr: FiltrOsob): Promise<void> {
  return downloadAdminUsersCsv(filtryZapytania(filtr));
}

/** Odmowa z powodu roli (401/403) albo każdy inny błąd, w tym sieci. */
export function rodzajBledu(wyjatek: unknown): "brak-uprawnien" | "siec" {
  if (wyjatek instanceof ApiError && (wyjatek.status === 401 || wyjatek.status === 403)) {
    return "brak-uprawnien";
  }
  return "siec";
}

export function etykietaRoli(rola: string): string {
  return (ROLE_LABELS as Record<string, string>)[rola] ?? "Nieznana rola";
}

export function wierszeOsob(osoby: AdminUserListItem[]): WierszRecordList[] {
  return osoby.map((osoba) => ({
    id: String(osoba.id),
    tytul: `${osoba.first_name} ${osoba.last_name}`,
    podpowiedz: `${osoba.email} · ${etykietaRoli(osoba.role)}`,
    plakietka:
      osoba.status === "blocked"
        ? { wariant: "error", tekst: "Konto zablokowane" }
        : { wariant: "ok", tekst: "Konto aktywne" },
    akcja: { etykieta: "Otwórz kartę", href: `${SCIEZKA_KARTY}/${osoba.id}` },
  }));
}
