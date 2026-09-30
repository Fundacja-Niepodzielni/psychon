import type { WierszRecordList } from "@/design-system/organizmy/RecordList/RecordList";
import { ApiError, apiPaged, type PaginationMeta } from "@/lib/api/klient";
import type { ApplicationItem, ApplicationStatus } from "@/lib/h03/types";
import { ROLE_LABELS } from "@/lib/h18/labels";

/**
 * Dane ekranu „Zgłoszenia rekrutacyjne” — wyłącznie `GET /admin/applications`
 * (`backend/routes/api/h03.php:31`, `ApplicationController::index`). Filtry,
 * które kontroler przyjmuje (`ListApplicationsRequest::rules`): `page`,
 * `per_page` (1–100), `status` (`new|accepted|rejected`), `search` (do 255
 * znaków), `sort`. Ekran używa pierwszych czterech; kolejność to domyślne
 * `-created_at` kontrolera.
 *
 * Odczyt biegnie z przeglądarki (`apiPaged` bierze Bearer z sesji) — ten sam
 * powód co w pozostałych ekranach nowego frontu: serwerowy `@/auth` nie wstaje
 * pod Vitest/jsdom.
 */

export const LICZBA_NA_STRONE = 25;
export const LIMIT_SZUKANEJ_FRAZY = 255;

/** Ścieżka ekranu szczegółu zgłoszenia (A-04). */
export const SCIEZKA_SZCZEGOLU = "/nowy-front/admin/zgloszenia";

/** Istniejąca strona wczytywania zgłoszeń z pliku (stary front, zakładka „Zgłoszenia”). */
export const SCIEZKA_WCZYTANIA_Z_PLIKU = "/admin/uczestniczki?zakladka=zgloszenia";

export interface FiltrZgloszen {
  status: ApplicationStatus | "";
  search: string;
}

export const PUSTY_FILTR: FiltrZgloszen = { status: "", search: "" };

export interface StronaZgloszen {
  data: ApplicationItem[];
  meta?: PaginationMeta;
}

type WariantPlakietki = "neutral" | "ok" | "warn" | "error" | "pending";

export const PLAKIETKA_STATUSU: Record<ApplicationStatus, { wariant: WariantPlakietki; tekst: string }> = {
  new: { wariant: "pending", tekst: "Czeka na decyzję" },
  accepted: { wariant: "ok", tekst: "Zaakceptowane" },
  rejected: { wariant: "error", tekst: "Odrzucone" },
};

export const OPCJE_STATUSU: { wartosc: string; etykieta: string }[] = [
  { wartosc: "", etykieta: "Wszystkie" },
  { wartosc: "new", etykieta: PLAKIETKA_STATUSU.new.tekst },
  { wartosc: "accepted", etykieta: PLAKIETKA_STATUSU.accepted.tekst },
  { wartosc: "rejected", etykieta: PLAKIETKA_STATUSU.rejected.tekst },
];

export function filtrAktywny(filtr: FiltrZgloszen): boolean {
  return filtr.status !== "" || filtr.search !== "";
}

/** Ścieżka zapytania z parametrami wyłącznie z listy kontrolera. */
export function sciezkaZapytania(filtr: FiltrZgloszen, strona: number): string {
  const parametry = new URLSearchParams();
  parametry.set("page", String(strona));
  parametry.set("per_page", String(LICZBA_NA_STRONE));
  if (filtr.status !== "") parametry.set("status", filtr.status);
  const fraza = filtr.search.trim().slice(0, LIMIT_SZUKANEJ_FRAZY);
  if (fraza !== "") parametry.set("search", fraza);
  return `/admin/applications?${parametry.toString()}`;
}

export function pobierzZgloszenia(filtr: FiltrZgloszen, strona: number): Promise<StronaZgloszen> {
  return apiPaged<ApplicationItem>(sciezkaZapytania(filtr, strona));
}

/** Odmowa z powodu roli (401/403) albo każdy inny błąd, w tym sieci. */
export function rodzajBledu(wyjatek: unknown): "brak-uprawnien" | "siec" {
  if (wyjatek instanceof ApiError && (wyjatek.status === 401 || wyjatek.status === 403)) {
    return "brak-uprawnien";
  }
  return "siec";
}

/** `2026-09-20T10:00:00Z` → `20.09.2026` (data UTC z ISO, bez stref czasowych przeglądarki). */
export function dataPl(iso: string | null): string {
  if (iso === null || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return "brak daty";
  const [rok, miesiac, dzien] = iso.slice(0, 10).split("-");
  return `${dzien}.${miesiac}.${rok}`;
}

export function etykietaRoli(rola: string): string {
  return (ROLE_LABELS as Record<string, string>)[rola] ?? "Nieznana rola";
}

export function wierszeZgloszen(zgloszenia: ApplicationItem[]): WierszRecordList[] {
  return zgloszenia.map((zgloszenie) => ({
    id: String(zgloszenie.id),
    tytul: `${zgloszenie.first_name} ${zgloszenie.last_name}`,
    podpowiedz: `${zgloszenie.email} · proponowana rola: ${etykietaRoli(zgloszenie.role)} · zgłoszono ${dataPl(zgloszenie.created_at)}`,
    plakietka: PLAKIETKA_STATUSU[zgloszenie.status],
    akcja: { etykieta: "Otwórz zgłoszenie", href: `${SCIEZKA_SZCZEGOLU}/${zgloszenie.id}` },
  }));
}
