import type { KolumnaRecordList, WierszRecordList } from "@/design-system/organizmy/RecordList/RecordList";
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
 * Dane ekranu „Osoby” — `GET /admin/users`
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

/**
 * Ścieżka karty osoby: trasa produktu `/admin/uczestniczki/[id]` (przy włączonej
 * grupie `kartaOsoby` niesie ekran A-07, przy wyłączonej starą kartę), nie trasa
 * poligonu.
 */
export const SCIEZKA_KARTY = "/admin/uczestniczki";

/**
 * Ścieżka listy zgłoszeń rekrutacyjnych (trasa produktu grupy `nabor`) — skąd
 * biorą się osoby w programie. Dawna zakładka „Zgłoszenia” tego ekranu.
 */
export const SCIEZKA_ZGLOSZEN = "/admin/nabor";

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

/** Wybrane filtry jednym zdaniem dla wiersza zwiniętych filtrów: rola, a przy frazie także ona. */
export function podsumowanieFiltra(filtr: FiltrOsob): string {
  const rola =
    filtr.role === "" ? "Wszystkie osoby" : (OPCJE_ROLI.find((opcja) => opcja.wartosc === filtr.role)?.etykieta ?? filtr.role);
  const fraza = filtr.search.trim();
  return fraza === "" ? rola : `${rola} · „${fraza}”`;
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

/** Kolumny listy osób: osoba (pod nazwą e-mail), rola, stan konta, akcja na końcu. */
export const KOLUMNY_OSOB: KolumnaRecordList[] = [
  { nazwa: "Osoba", rodzaj: "tekst" },
  { nazwa: "Rola", rodzaj: "tekst", klucz: "rola" },
  { nazwa: "Stan", rodzaj: "stan" },
  { nazwa: "Akcja", rodzaj: "akcja" },
];

/**
 * Wiersz osoby: imię i nazwisko, pod nim e-mail; rola po polsku we własnej
 * kolumnie, plakietka stanu małą literą (słownik 2.1), akcja „Otwórz” (pełną
 * nazwę „Otwórz kartę: …” słyszy tylko czytnik ekranu).
 */
export function wierszeOsob(osoby: AdminUserListItem[]): WierszRecordList[] {
  return osoby.map((osoba) => {
    const nazwa = `${osoba.first_name} ${osoba.last_name}`;
    return {
      id: String(osoba.id),
      tytul: nazwa,
      podpowiedz: osoba.email,
      komorki: { rola: { tekst: etykietaRoli(osoba.role) } },
      plakietka:
        osoba.status === "blocked"
          ? { wariant: "error", tekst: "konto zablokowane" }
          : { wariant: "ok", tekst: "konto aktywne" },
      akcja: { etykieta: "Otwórz", etykietaDostepna: `Otwórz kartę: ${nazwa}`, href: `${SCIEZKA_KARTY}/${osoba.id}` },
    };
  });
}
