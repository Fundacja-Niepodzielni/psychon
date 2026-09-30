import { api } from "@/lib/api/klient";

export interface LicznikiPulpitu {
  participants: number;
  completed: number;
  certificates: number;
}

export interface KolejkaPulpitu {
  key: string;
  count: number;
  link: string;
}

export interface PulpitAdministracji {
  counters: LicznikiPulpitu;
  queues: KolejkaPulpitu[];
}

/**
 * `GET /admin/dashboard` (`DashboardController::show`,
 * `backend/routes/api/h19.php:25`; kształt: `DashboardSummary::build`,
 * `backend/app/Services/H19/DashboardSummary.php:26-63`, i schemat
 * `backend/openapi.json`, ścieżka `/v1/admin/dashboard`). Trasa dostępna dla
 * `project_manager` i `super_admin`. Odczyt z przeglądarki: token płynie przez
 * `lib/api/klient.ts` (`/api/auth/session`), tak jak w pozostałych ekranach
 * nowego frontu. Zwraca surową odpowiedź — kształt sprawdza `odczytajPulpit`.
 */
export function pobierzPulpitAdministracji(): Promise<unknown> {
  return api<unknown>("/admin/dashboard");
}
