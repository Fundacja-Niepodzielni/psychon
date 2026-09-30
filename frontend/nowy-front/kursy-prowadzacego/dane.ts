import { api } from "@/lib/api/klient";

/**
 * Warstwa danych ekranu „Moje kursy” (prowadzący). Jedna trasa:
 * `GET /instructor/courses` (`backend/routes/api/h09.php:37`) —
 * `MyInstructorProfileController::courses`
 * (`backend/app/Http/Controllers/Api/V1/H09/MyInstructorProfileController.php:61-74`):
 * wyłącznie kursy z aktywnym przypisaniem prowadzącego, bez stronicowania,
 * koperta `{ data: [...] }`. Kształt wiersza to tablica w w. 64-69 (kontroler
 * nie ma osobnego zasobu); schemat `backend/openapi.json`
 * (`/v1/instructor/courses`, `get`) jest z nim zgodny.
 *
 * Odczyt biegnie z przeglądarki (token sesji z klienta API) — ten sam powód co
 * w pozostałych ekranach nowego frontu: serwerowy `@/auth` nie wstaje pod
 * testami jsdom.
 */

/** Wiersz odpowiedzi `courses` (w. 64-69). */
export interface KursProwadzacego {
  id: number;
  slug: string;
  title: string;
  sequence_order: number | null;
}

export function pobierzKursyProwadzacego(): Promise<KursProwadzacego[]> {
  return api<KursProwadzacego[]>("/instructor/courses");
}
