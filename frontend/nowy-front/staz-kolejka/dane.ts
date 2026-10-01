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
 * Do panelu „Ile godzin ma teraz” dochodzą dwa ISTNIEJĄCE odczyty, bez nowych
 * tras i pól:
 *  - `GET /admin/users/{id}` -> `data.progress.hours_accepted` (zatwierdzone
 *    godziny osoby; `backend/routes/api/h18.php:28`, ten sam `ProgressAggregator`
 *    co karta osoby i certyfikat),
 *  - `GET /admin/edition` -> `internship_hours_required` (wymagane godziny;
 *    `backend/routes/api/h19.php:27`).
 * Obie trasy mają tę samą bramkę ról co kolejka (`project_manager`, `super_admin`).
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

/** Etykieta formy z wielkiej litery — wartość w panelu („Dyżur telefoniczny”). */
export function etykietaFormyZWielkiej(forma: string): string {
  const etykieta = etykietaFormy(forma);
  return etykieta.charAt(0).toUpperCase() + etykieta.slice(1);
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

/** Godziny osoby do panelu: zatwierdzone teraz i wymagane w edycji (`null`, gdy edycji nie udało się odczytać). */
export interface GodzinyOsoby {
  /** Dziesiętny string z karty osoby (`progress.hours_accepted`). */
  zaakceptowane: string;
  /** Wymagana liczba godzin jako string (`internship_hours_required`) albo `null`. */
  wymagane: string | null;
}

interface KartaZGodzinami {
  progress: { hours_accepted: string };
}

interface EdycjaZWymaganymiGodzinami {
  internship_hours_required: number;
}

/**
 * Odczyt przy otwarciu panelu. Karta osoby jest konieczna — jej błąd wraca
 * wołającemu, który nie pokazuje wtedy żadnej liczby. Wymagane godziny są
 * dodatkiem: gdy odczyt edycji zawiedzie, panel pokazuje same zatwierdzone
 * godziny, bez mianownika.
 */
export async function pobierzGodzinyOsoby(osobaId: number): Promise<GodzinyOsoby> {
  const [karta, edycja] = await Promise.allSettled([
    api<KartaZGodzinami>(`/admin/users/${osobaId}`),
    api<EdycjaZWymaganymiGodzinami>("/admin/edition"),
  ]);
  if (karta.status === "rejected") throw karta.reason;
  const wymagane = edycja.status === "fulfilled" ? edycja.value.internship_hours_required : null;
  return {
    zaakceptowane: karta.value.progress.hours_accepted,
    wymagane: typeof wymagane === "number" && Number.isFinite(wymagane) ? String(wymagane) : null,
  };
}

/**
 * Suma dwóch godzin podanych jako dziesiętne stringi („18” + „4” → „22”,
 * „21” + „0.5” → „21.5”). `null`, gdy któryś składnik nie jest liczbą —
 * panel wtedy nie podaje stanu „po zatwierdzeniu”.
 */
export function dodajGodziny(a: string, b: string): string | null {
  const suma = Number(a) + Number(b);
  return a.trim() === "" || b.trim() === "" || !Number.isFinite(suma) ? null : String(suma);
}

/** Procent wypełnienia paska: zatwierdzone godziny do wymaganych, w granicach 0–100. */
export function procentGodzin(zaakceptowane: string, wymagane: string): number {
  const wymagana = Number(wymagane);
  const zrobione = Number(zaakceptowane);
  if (!Number.isFinite(wymagana) || !Number.isFinite(zrobione) || wymagana <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((zrobione / wymagana) * 100)));
}
