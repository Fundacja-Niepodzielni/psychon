/**
 * Atrapy odpowiedzi `GET /me` i eksportu danych dla testów ekranu „Mój profil”. Klucze są
 * właściwościami `ProfileResource` i `DataExportResource` z zaplecza (typy w `../dane`).
 * Dane wyłącznie demonstracyjne; PESEL to zapisana w testach wartość próbna.
 */
import type { EksportDanych, Profil } from "../dane";

export const PROFIL: Profil = {
  id: 17,
  first_name: "Marta",
  last_name: "Demo",
  email: "marta@demo.pl",
  role: "volunteer",
  phone: "+48 600 100 200",
  pesel: "90010112345",
  address: { street: "Testowa 1", city: "Warszawa", zip: "00-001" },
  access_expires_at: "2027-02-01T00:00:00Z",
  program_completed_at: null,
  product_group: "psychon",
  consents: [
    {
      type: "regulamin",
      document_version: "v1",
      granted_at: "2026-09-01T10:00:00Z",
      withdrawn_at: null,
      status: "granted",
    },
    {
      type: "marketing",
      document_version: null,
      granted_at: "2026-09-02T10:00:00Z",
      withdrawn_at: "2026-09-20T10:00:00Z",
      status: "withdrawn",
    },
  ],
};

export function eksport(status: EksportDanych["status"], zmiany: Partial<EksportDanych> = {}): EksportDanych {
  return {
    id: "ex_9f2",
    status,
    requested_at: "2026-10-01T10:00:00Z",
    completed_at: status === "ready" ? "2026-10-01T10:00:05Z" : null,
    download_url: status === "ready" ? "http://localhost:8000/api/v1/me/exports/ex_9f2/download" : null,
    ...zmiany,
  };
}
