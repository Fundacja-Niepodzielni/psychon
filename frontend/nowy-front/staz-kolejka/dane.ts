import { api, apiPaged, ApiError, type PaginationMeta } from "@/lib/api/klient";

/**
 * Dane ekranu decyzji o dyżurach (dziennik stażu, administracja). Trasy
 * wyłącznie z `backend/routes/api/h11.php:34-40`:
 *  - `GET  /admin/internship/pending`        — lista dyżurów czekających na decyzję,
 *  - `POST /admin/internship/{id}/accept`    — zatwierdzenie (bez ciała),
 *  - `POST /admin/internship/{id}/return`    — prośba o poprawkę, `{ comment }` wymagany,
 *  - `POST /admin/internship/{id}/reject`    — odrzucenie, `{ comment }` wymagany.
 * Kształt elementu listy: `AdminInternshipEntryResource::toArray`
 * (`backend/app/Http/Resources/H11/AdminInternshipEntryResource.php:15-31`).
 *
 * Wołane z przeglądarki przez `lib/api/klient.ts` — token płynie z sesji,
 * tak samo jak na pozostałych ekranach nowego frontu.
 */

export type FormaDyzuru = "phone_duty" | "chat_duty" | "other";

export interface WpisDoDecyzji {
  id: number;
  /** Data kalendarzowa `RRRR-MM-DD`. */
  date: string | null;
  /** Dziesiętny string z serwera — nigdy liczba. */
  hours: string;
  form: FormaDyzuru;
  consultations_count: number;
  description: string | null;
  status: string;
  review_comment: string | null;
  decided_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  user: { id: number; first_name: string; last_name: string };
}

export interface StronaWpisow {
  wpisy: WpisDoDecyzji[];
  meta: PaginationMeta | undefined;
}

/** Liczba wpisów na stronę — kontroler przyjmuje 1–100, domyślnie 25. */
export const NA_STRONE = 25;

/** Etykiety form dyżuru (kontrakt, słownik `internship.form`). */
const ETYKIETY_FORM: Record<FormaDyzuru, string> = {
  phone_duty: "dyżur telefoniczny",
  chat_duty: "czat",
  other: "inna",
};

export function etykietaFormy(forma: string): string {
  return ETYKIETY_FORM[forma as FormaDyzuru] ?? ETYKIETY_FORM.other;
}

/** `2026-08-27` → `27.08.2026`; wartość w innym kształcie wraca bez zmian. */
export function dataPolska(data: string | null): string {
  if (data === null) return "brak daty";
  const dopasowanie = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  return dopasowanie ? `${dopasowanie[3]}.${dopasowanie[2]}.${dopasowanie[1]}` : data;
}

export function nazwaOsoby(wpis: WpisDoDecyzji): string {
  return `${wpis.user.first_name} ${wpis.user.last_name}`;
}

export async function pobierzWpisyDoDecyzji(strona: number): Promise<StronaWpisow> {
  const { data, meta } = await apiPaged<WpisDoDecyzji>(
    `/admin/internship/pending?page=${strona}&per_page=${NA_STRONE}`,
  );
  return { wpisy: data, meta };
}

export type RodzajDecyzji = "zatwierdz" | "odeslij" | "odrzuc";

/**
 * Jedna decyzja o dyżurze. `zatwierdz` nie niesie ciała; `odeslij` i `odrzuc`
 * wysyłają `{ comment }` dokładnie tak, jak wpisała osoba (po przycięciu
 * białych znaków na brzegach) — pustego komentarza nie sprawdza klient:
 * odpowiada serwer kodem 422 z błędem pola `comment`.
 */
export function zapiszDecyzje(rodzaj: RodzajDecyzji, id: number, komentarz: string): Promise<WpisDoDecyzji> {
  if (rodzaj === "zatwierdz") {
    return api<WpisDoDecyzji>(`/admin/internship/${id}/accept`, { method: "POST" });
  }
  const sciezka = rodzaj === "odeslij" ? "return" : "reject";
  return api<WpisDoDecyzji>(`/admin/internship/${id}/${sciezka}`, {
    method: "POST",
    body: { comment: komentarz.trim() },
  });
}

/** Odczyt listy: odmowa roli (401/403) to osobny stan, reszta to błąd sieci. */
export function czyBrakUprawnien(blad: unknown): boolean {
  return blad instanceof ApiError && (blad.status === 401 || blad.status === 403);
}

export type BladDecyzji =
  | { rodzaj: "pola"; bledy: Record<string, string[]> }
  | { rodzaj: "rozstrzygniety"; komunikat: string }
  | { rodzaj: "brak-wpisu"; komunikat: string }
  | { rodzaj: "inny"; komunikat: string };

const KOMUNIKAT_SIECI = "Nie udało się zapisać decyzji. Sprawdź połączenie i spróbuj ponownie.";

export function sklasyfikujBladDecyzji(blad: unknown): BladDecyzji {
  if (!(blad instanceof ApiError)) return { rodzaj: "inny", komunikat: KOMUNIKAT_SIECI };
  if (blad.status === 422 && blad.errors) return { rodzaj: "pola", bledy: blad.errors };
  if (blad.status === 403 && blad.code === "entry_locked") {
    return { rodzaj: "rozstrzygniety", komunikat: blad.message };
  }
  if (blad.status === 404) return { rodzaj: "brak-wpisu", komunikat: blad.message };
  return { rodzaj: "inny", komunikat: blad.message };
}
