import { ApiError, api, apiPaged, type PaginationMeta } from "@/lib/api/klient";
import type { AdminCertificate, CertificateStatus } from "@/lib/h13/types";

/**
 * Dane ekranu „Certyfikaty” — `GET /admin/certificates`
 * (`backend/routes/api/h13.php`, `AdminCertificateController::index`) i
 * `POST /admin/certificates/{id}/revoke` (`AdminCertificateController::revoke`).
 * Żadnej innej trasy ekran nie woła. Lista przyjmuje `page`, `per_page`
 * (domyślnie 25, najwyżej 100) oraz dwa filtry płaskie: `number` (dokładny
 * numer) i `person` (imię, nazwisko albo e-mail osoby); kolejność jest stała
 * po stronie serwera (od najnowszego wydania). Bez filtra adres żądania jest
 * dokładnie taki jak na starym ekranie (`POMIAR-STAREGO-EKRANU.md`).
 *
 * Odczyt i unieważnienie biegną z przeglądarki (Bearer z sesji) — serwerowy
 * `@/auth` nie wstaje pod Vitest/jsdom.
 */

export const LICZBA_NA_STRONE = 25;
export const LIMIT_FILTRU = 255;

export interface FiltrCertyfikatow {
  number: string;
  person: string;
}

export const PUSTY_FILTR: FiltrCertyfikatow = { number: "", person: "" };

export interface StronaCertyfikatow {
  data: AdminCertificate[];
  meta?: PaginationMeta;
}

export function filtrAktywny(filtr: FiltrCertyfikatow): boolean {
  return filtr.number !== "" || filtr.person !== "";
}

/** Filtr po przycięciu białych znaków i ucięciu do limitu — to, co naprawdę trafia do żądania. */
export function oczyscFiltr(filtr: FiltrCertyfikatow): FiltrCertyfikatow {
  return {
    number: filtr.number.trim().slice(0, LIMIT_FILTRU),
    person: filtr.person.trim().slice(0, LIMIT_FILTRU),
  };
}

/** Adres listy: `page` i `per_page` jak dotąd, filtry dopisane tylko, gdy są niepuste. */
export function adresListy(filtr: FiltrCertyfikatow, strona: number): string {
  const parametry = new URLSearchParams({ page: String(strona), per_page: String(LICZBA_NA_STRONE) });
  const czysty = oczyscFiltr(filtr);
  if (czysty.number !== "") parametry.set("number", czysty.number);
  if (czysty.person !== "") parametry.set("person", czysty.person);
  return `/admin/certificates?${parametry.toString()}`;
}

export function pobierzCertyfikaty(filtr: FiltrCertyfikatow, strona: number): Promise<StronaCertyfikatow> {
  return apiPaged<AdminCertificate>(adresListy(filtr, strona));
}

/** Unieważnienie z powodem; zwrócony certyfikat ekran ignoruje, listę wczytuje od nowa. */
export function uniewaznijCertyfikat(id: number, powod: string): Promise<AdminCertificate> {
  return api<AdminCertificate>(`/admin/certificates/${id}/revoke`, { method: "POST", body: { reason: powod } });
}

export type RodzajBleduListy = "brak-uprawnien" | "blad" | "siec";

/**
 * Odmowa z powodu roli (401/403), błąd odpowiedzi serwera albo wyjątek bez
 * odpowiedzi (brak połączenia). Trzy różne stany, trzy różne zdania na ekranie.
 */
export function rodzajBledu(wyjatek: unknown): RodzajBleduListy {
  if (!(wyjatek instanceof ApiError)) return "siec";
  return wyjatek.status === 401 || wyjatek.status === 403 ? "brak-uprawnien" : "blad";
}

/** Zdanie serwera z koperty błędu; `null`, gdy wyjątek nie jest odpowiedzią serwera. */
export function zdanieSerwera(wyjatek: unknown): string | null {
  return wyjatek instanceof ApiError ? wyjatek.message : null;
}

export const ETYKIETA_STANU: Record<CertificateStatus, string> = {
  valid: "ważny",
  revoked: "unieważniony",
};

export const WARIANT_STANU: Record<CertificateStatus, "ok" | "error"> = {
  valid: "ok",
  revoked: "error",
};

export type WynikUniewaznienia =
  | { rodzaj: "ok" }
  /** Serwer odrzucił powód — zdanie ma stanąć pod polem. */
  | { rodzaj: "blad-pola"; komunikat: string }
  /** Każdy inny błąd — zdanie ma stanąć w oknie. */
  | { rodzaj: "blad"; komunikat: string };

export const KOMUNIKAT_BRAKU_POWODU = "Podaj powód unieważnienia.";
export const KOMUNIKAT_BLEDU_UNIEWAZNIENIA =
  "Nie udało się unieważnić certyfikatu. Sprawdź połączenie z internetem i spróbuj jeszcze raz.";

/** Wysyła unieważnienie i sprowadza każdy wynik do jednego z trzech rodzajów. */
export async function wyslijUniewaznienie(id: number, powod: string): Promise<WynikUniewaznienia> {
  try {
    await uniewaznijCertyfikat(id, powod);
    return { rodzaj: "ok" };
  } catch (wyjatek) {
    const bladPowodu = wyjatek instanceof ApiError ? wyjatek.errors?.reason?.[0] : undefined;
    if (bladPowodu !== undefined) return { rodzaj: "blad-pola", komunikat: bladPowodu };
    return { rodzaj: "blad", komunikat: zdanieSerwera(wyjatek) ?? KOMUNIKAT_BLEDU_UNIEWAZNIENIA };
  }
}
