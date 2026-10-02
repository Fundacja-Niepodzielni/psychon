/**
 * Dane ekranu „Mój profil” (uczestnik). Dokładnie te trasy co stara strona profilu
 * (`app/(uczestnik)/panel/profil/page.tsx`), z tymi samymi polami:
 *  - `GET /me`                            — profil i zgody;
 *  - `PATCH /me`                          — zapis danych osobowych (bez `email`);
 *  - `POST /me/exports`                   — zlecenie eksportu danych;
 *  - `GET /me/exports/{id}`               — stan eksportu;
 *  - `GET /me/exports/{id}/download`      — pobranie pliku (Bearer, zapis jako `moje-dane-{id}.json`).
 *
 * Trasy: `backend/routes/api/h01.php`; kształty: `ProfileResource`, `DataExportResource`,
 * reguły zapisu: `Http/Requests/H01/UpdateProfileRequest.php`. Odczyty i zapisy biegną
 * z przeglądarki — ten sam powód co w `nowy-front/pulpit/dane.ts`.
 */
import { api, baseUrl } from "@/lib/api/klient";
import { downloadFile } from "@/lib/api/pliki";

export interface Zgoda {
  type: string;
  document_version: string | null;
  granted_at: string | null;
  withdrawn_at: string | null;
  status: "granted" | "withdrawn";
}

export interface Profil {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  phone: string | null;
  pesel: string | null;
  address: { street: string | null; city: string | null; zip: string | null };
  access_expires_at: string | null;
  program_completed_at: string | null;
  product_group: string;
  consents: Zgoda[];
}

/** Po 24 godzinach zadanie sprzątające ustawia `expired` i kasuje plik. */
export type StatusEksportu = "queued" | "processing" | "ready" | "expired" | "failed";

export interface EksportDanych {
  id: string;
  status: StatusEksportu;
  requested_at: string | null;
  completed_at: string | null;
  download_url: string | null;
}

/** Ciało `PATCH /me`: puste pola wysyłamy jako `null`, `email` nie jest polem wejściowym. */
export interface ZadanieZapisuProfilu {
  first_name: string;
  last_name: string;
  phone: string | null;
  pesel: string | null;
  address: { street: string | null; city: string | null; zip: string | null };
}

export function pobierzProfil(): Promise<Profil> {
  return api<Profil>("/me");
}

export function zapiszProfil(zadanie: ZadanieZapisuProfilu): Promise<Profil> {
  return api<Profil>("/me", { method: "PATCH", body: zadanie });
}

export function zlecEksport(): Promise<EksportDanych> {
  return api<EksportDanych>("/me/exports", { method: "POST" });
}

export function pobierzStanEksportu(id: string): Promise<EksportDanych> {
  return api<EksportDanych>(`/me/exports/${encodeURIComponent(id)}`);
}

/** Pobiera plik eksportu z nagłówkiem Bearer; 404 (paczki już nie ma) wraca jako `ApiError`. */
export function pobierzPlikEksportu(id: string): Promise<void> {
  return downloadFile(`${baseUrl()}/me/exports/${encodeURIComponent(id)}/download`, `moje-dane-${id}.json`);
}
