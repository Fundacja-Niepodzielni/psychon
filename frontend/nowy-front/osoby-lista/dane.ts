import { ApiError, type PaginationMeta } from "@/lib/api/klient";
import { downloadAdminUsersCsv, type AdminUserFilters, type UserRole } from "@/lib/api/h18";
import {
  fetchAdminUsersWithSupervisor,
  type AdminUserListItemWithSupervisor,
  type CurrentSupervisor,
} from "@/lib/api/przypisanie-prowadzacego";
import { ROLE_LABELS } from "@/lib/h18/labels";

/**
 * Dane ekranu „Osoby” — `GET /admin/users`
 * (`backend/routes/api/h18.php:26`, `AdminUserController::index`, wiersz z
 * polem tylko do odczytu `supervisor`) i eksport
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
  data: AdminUserListItemWithSupervisor[];
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
  return fetchAdminUsersWithSupervisor(filtryZapytania(filtr, strona));
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

/**
 * Rola osoby, którą można przypisać do prowadzącego. Serwer przypisuje
 * wyłącznie konto z rolą wolontariusza (`SupervisorAssignmentService::assign`,
 * pomiar w `POMIAR-PRZYPISANIA.md`), więc tylko taki wiersz ma pole wyboru.
 */
export const ROLA_DO_PRZYPISANIA: UserRole = "volunteer";

/** Tekst w kolumnie „Prowadzący”, gdy osoba nie ma bieżącego prowadzącego. */
export const BRAK_PROWADZACEGO = "brak";

export type RodzajKolumnyOsob = "osoba" | "tekst" | "stan" | "akcja";

export interface KolumnaOsob {
  /** Nazwa kolumny: nagłówek od 640 px, podpis wartości poniżej 640 px. */
  nazwa: string;
  rodzaj: RodzajKolumnyOsob;
}

/** Kolumny listy osób: osoba (pod nazwą e-mail), rola, prowadzący, stan konta, akcja na końcu. */
export const KOLUMNY_OSOB: KolumnaOsob[] = [
  { nazwa: "Osoba", rodzaj: "osoba" },
  { nazwa: "Rola", rodzaj: "tekst" },
  { nazwa: "Prowadzący", rodzaj: "tekst" },
  { nazwa: "Stan", rodzaj: "stan" },
  { nazwa: "Akcja", rodzaj: "akcja" },
];

/** Osoba w zaznaczeniu — tyle, ile trzeba poza stroną, na której ją zaznaczono. */
export interface WybranaOsoba {
  id: number;
  nazwa: string;
  prowadzacy: CurrentSupervisor | null;
}

export interface WierszOsoby {
  id: number;
  nazwa: string;
  email: string;
  rola: string;
  prowadzacy: string;
  plakietka: { wariant: "ok" | "error"; tekst: string };
  akcja: { etykieta: string; etykietaDostepna: string; href: string };
  /** Osoba do przypisania — wiersz ma pole wyboru. */
  doWyboru: boolean;
  wybor: WybranaOsoba;
}

export function nazwaOsoby(osoba: { first_name: string; last_name: string }): string {
  return `${osoba.first_name} ${osoba.last_name}`;
}

/**
 * Wiersz osoby: imię i nazwisko, pod nim e-mail; rola po polsku, prowadzący
 * (albo „brak”), plakietka stanu małą literą (słownik 2.1), akcja „Otwórz”
 * (pełną nazwę „Otwórz kartę: …” słyszy tylko czytnik ekranu). Pole wyboru ma
 * wyłącznie wiersz osoby, którą serwer przypisze.
 */
export function wierszeOsob(osoby: AdminUserListItemWithSupervisor[]): WierszOsoby[] {
  return osoby.map((osoba) => {
    const nazwa = nazwaOsoby(osoba);
    const prowadzacy = osoba.supervisor ?? null;
    return {
      id: osoba.id,
      nazwa,
      email: osoba.email,
      rola: etykietaRoli(osoba.role),
      prowadzacy: prowadzacy?.name ?? BRAK_PROWADZACEGO,
      plakietka:
        osoba.status === "blocked"
          ? { wariant: "error", tekst: "konto zablokowane" }
          : { wariant: "ok", tekst: "konto aktywne" },
      akcja: { etykieta: "Otwórz", etykietaDostepna: `Otwórz kartę: ${nazwa}`, href: `${SCIEZKA_KARTY}/${osoba.id}` },
      doWyboru: osoba.role === ROLA_DO_PRZYPISANIA,
      wybor: { id: osoba.id, nazwa, prowadzacy },
    };
  });
}
