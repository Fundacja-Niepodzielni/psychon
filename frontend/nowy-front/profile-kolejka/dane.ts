import { apiPaged, ApiError, type PaginationMeta } from "@/lib/api/klient";

/**
 * Dane ekranu wniosków o profil psychologa (administracja). Jedna trasa,
 * `GET /admin/profiles` (`backend/routes/api/h15.php:34`,
 * `AdminProfileController::index`, `AdminProfileController.php:24-31` — lista stanów,
 * odczyt `status` i `per_page`).
 * Kontroler przyjmuje wyłącznie parametr `status` (jedna z sześciu wartości
 * słownika; nieznana albo brak daje `submitted`) oraz `page` i `per_page`
 * (1–100). Kształt elementu: `AdminPsychologistProfileResource::toArray`
 * (`backend/app/Http/Resources/H15/AdminPsychologistProfileResource.php:15-37`).
 *
 * Wołane z przeglądarki przez `lib/api/klient.ts`.
 */

export type StanWniosku = "draft" | "submitted" | "returned" | "accepted" | "published" | "withdrawn";

export interface WniosekOProfil {
  id: number;
  user: { id: number; first_name: string; last_name: string };
  specializations: string[] | null;
  approach: string | null;
  city: string | null;
  bio: string | null;
  publication_consent_granted: boolean;
  status: string;
  return_reason: string | null;
  decided_at: string | null;
  documents: Array<{ id: number; type: string; uploaded_at: string | null; download_url: string }>;
  created_at: string | null;
  updated_at: string | null;
}

export interface StronaWnioskow {
  wnioski: WniosekOProfil[];
  meta: PaginationMeta | undefined;
}

export const NA_STRONE = 25;

/** Stan wniosku, który czeka na decyzję — domyślny filtr i domyślna wartość serwera. */
export const STAN_DO_DECYZJI: StanWniosku = "submitted";

type WariantPlakietki = "neutral" | "ok" | "warn" | "error" | "pending";

/** Etykiety stanów wniosku (kontrakt §3.4 `profile.status`) — nigdy surowy kod. */
const STANY: Record<StanWniosku, { etykieta: string; wariant: WariantPlakietki }> = {
  submitted: { etykieta: "Czeka na decyzję", wariant: "pending" },
  returned: { etykieta: "Do poprawy", wariant: "warn" },
  accepted: { etykieta: "Zatwierdzony", wariant: "ok" },
  published: { etykieta: "Opublikowany", wariant: "ok" },
  withdrawn: { etykieta: "Zgoda wycofana", wariant: "neutral" },
  draft: { etykieta: "Wersja robocza", wariant: "neutral" },
};

export const OPCJE_STANU: Array<{ wartosc: StanWniosku; etykieta: string }> = (
  ["submitted", "returned", "accepted", "published", "withdrawn", "draft"] as const
).map((wartosc) => ({ wartosc, etykieta: STANY[wartosc].etykieta }));

export function plakietkaStanu(status: string): { etykieta: string; wariant: WariantPlakietki } {
  return STANY[status as StanWniosku] ?? { etykieta: "Stan nieznany", wariant: "neutral" };
}

export function nazwaOsoby(wniosek: WniosekOProfil): string {
  return `${wniosek.user.first_name} ${wniosek.user.last_name}`;
}

/** Adres ekranu decyzji o wniosku (obok tej trasy, osobny ekran). */
export function adresWniosku(id: number): string {
  return `/nowy-front/admin/profile/${id}`;
}

/** Jedna linia podpisu wiersza: miasto, nurt i liczba załączników. */
export function podpisWniosku(wniosek: WniosekOProfil): string {
  return [
    wniosek.city ?? "miasto nie podane",
    wniosek.approach ?? "nurt nie podany",
    `załączniki: ${wniosek.documents.length}`,
  ].join(" · ");
}

export async function pobierzWnioski(stan: StanWniosku, strona: number): Promise<StronaWnioskow> {
  const { data, meta } = await apiPaged<WniosekOProfil>(
    `/admin/profiles?status=${stan}&page=${strona}&per_page=${NA_STRONE}`,
  );
  return { wnioski: data, meta };
}

/** Odmowa roli (401/403) to osobny stan ekranu, reszta błędów to błąd sieci. */
export function czyBrakUprawnien(blad: unknown): boolean {
  return blad instanceof ApiError && (blad.status === 401 || blad.status === 403);
}
