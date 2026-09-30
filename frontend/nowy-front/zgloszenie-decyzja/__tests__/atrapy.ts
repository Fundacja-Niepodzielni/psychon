import type { Zgloszenie } from "../dane";

/**
 * Atrapa odpowiedzi `GET /admin/applications/{id}` — klucze dokładnie z
 * `ApplicationResource::toArray` (test kluczy czyta ten plik zaplecza).
 */
export const ZGLOSZENIE: Zgloszenie = {
  id: 31,
  edition_id: 1,
  first_name: "Marta",
  last_name: "Demo",
  email: "marta.demo@example.test",
  phone: "+48 600 100 200",
  source: "formularz",
  role: "volunteer",
  payload: null,
  university: "Uniwersytet Demo",
  graduation_year: 2025,
  consent_regulamin_at: "2026-09-01T10:00:00Z",
  consent_polityka_at: "2026-09-01T10:00:00Z",
  status: "new",
  rejection_reason: null,
  decided_by: null,
  decided_at: null,
  user_id: null,
  has_diploma_scan: true,
  diploma_scan_url: "http://localhost:8000/api/v1/admin/applications/31/diploma-scan",
  created_at: "2026-09-10T08:00:00Z",
  updated_at: "2026-09-10T08:00:00Z",
};

export const ZGLOSZENIE_ZAAKCEPTOWANE: Zgloszenie = {
  ...ZGLOSZENIE,
  status: "accepted",
  decided_by: 3,
  decided_at: "2026-09-12T09:00:00Z",
  user_id: 44,
};

export const ZGLOSZENIE_ODRZUCONE: Zgloszenie = {
  ...ZGLOSZENIE,
  status: "rejected",
  rejection_reason: "Brak dyplomu ukończonych studiów psychologicznych.",
  decided_by: 3,
  decided_at: "2026-09-12T09:00:00Z",
};
