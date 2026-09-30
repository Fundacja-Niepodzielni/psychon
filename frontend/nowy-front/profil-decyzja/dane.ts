/**
 * Dane ekranu decyzji o wniosku o profil psychologa — trasy `backend/routes/api/h15.php:35-38`
 * (`H15/AdminProfileController`: `show`, `accept`, `return`, `downloadDocument`).
 *
 * Moduł nie zna Reacta: każda operacja zwraca wynik opisany rodzajem (nie rzuca),
 * więc ekran tylko wybiera, co pokazać. Komunikaty pochodzą z koperty błędu.
 */
import { api, ApiError } from "@/lib/api/klient";
import { downloadFile } from "@/lib/api/pliki";
import { formatujDate } from "../wspolne/daty";
import type { AdminPsychologistProfile, ProfileDocumentType } from "@/lib/h15/types";

/** `AdminPsychologistProfileResource` (`backend/app/Http/Resources/H15/AdminPsychologistProfileResource.php:16-37`). */
export type Wniosek = AdminPsychologistProfile;

export type WynikOdczytu =
  | { rodzaj: "gotowy"; wniosek: Wniosek }
  | { rodzaj: "brak-uprawnien" }
  | { rodzaj: "nie-znaleziono" }
  | { rodzaj: "blad" };

/** Wynik decyzji: `rozstrzygniete` to 403 `entry_locked` (wniosek nie czeka już na decyzję). */
export type WynikDecyzji =
  | { rodzaj: "zapisano"; wniosek: Wniosek }
  | { rodzaj: "bledy-pol"; komunikat: string; bledy: Record<string, string[]> }
  | { rodzaj: "rozstrzygniete"; komunikat: string }
  | { rodzaj: "brak-uprawnien"; komunikat: string }
  | { rodzaj: "nie-znaleziono"; komunikat: string }
  | { rodzaj: "blad"; komunikat: string };

export type WynikZalacznika = { rodzaj: "pobrano" } | { rodzaj: "blad"; komunikat: string };

export const ETYKIETY_ZALACZNIKOW: Record<ProfileDocumentType, string> = {
  dyplom: "Dyplom",
  niekaralnosc: "Zaświadczenie o niekaralności",
  inne: "Inny dokument",
};

export function poprawneId(id: string): number | null {
  return /^[1-9][0-9]*$/.test(id) ? Number(id) : null;
}

export function dataPl(iso: string | null): string {
  return formatujDate(iso);
}

export async function wczytajWniosek(id: number): Promise<WynikOdczytu> {
  try {
    const wniosek = await api<Wniosek>(`/admin/profiles/${id}`);
    return { rodzaj: "gotowy", wniosek };
  } catch (blad) {
    if (blad instanceof ApiError && (blad.status === 401 || blad.status === 403)) return { rodzaj: "brak-uprawnien" };
    if (blad instanceof ApiError && blad.status === 404) return { rodzaj: "nie-znaleziono" };
    return { rodzaj: "blad" };
  }
}

async function zapiszDecyzje(sciezka: string, cialo: { reason: string } | undefined, zdanieBledu: string): Promise<WynikDecyzji> {
  try {
    const wniosek = await api<Wniosek>(sciezka, cialo ? { method: "POST", body: cialo } : { method: "POST" });
    return { rodzaj: "zapisano", wniosek };
  } catch (blad) {
    if (!(blad instanceof ApiError)) return { rodzaj: "blad", komunikat: zdanieBledu };
    if (blad.status === 422 && blad.errors) return { rodzaj: "bledy-pol", komunikat: blad.message, bledy: blad.errors };
    if (blad.status === 403 && blad.code === "entry_locked") return { rodzaj: "rozstrzygniete", komunikat: blad.message };
    if (blad.status === 401 || blad.status === 403) return { rodzaj: "brak-uprawnien", komunikat: blad.message };
    if (blad.status === 404) return { rodzaj: "nie-znaleziono", komunikat: blad.message };
    return { rodzaj: "blad", komunikat: blad.message };
  }
}

/** `POST /admin/profiles/{id}/accept` — bez ciała, wniosek musi być w stanie „złożony”. */
export function zaakceptujWniosek(id: number): Promise<WynikDecyzji> {
  return zapiszDecyzje(`/admin/profiles/${id}/accept`, undefined, "Nie udało się zaakceptować wniosku. Spróbuj ponownie.");
}

/** `POST /admin/profiles/{id}/return` z wymaganym polem `reason` (`ReturnProfileRequest.php:14-17`). */
export function odeslijWniosek(id: number, komentarz: string): Promise<WynikDecyzji> {
  return zapiszDecyzje(`/admin/profiles/${id}/return`, { reason: komentarz }, "Nie udało się odesłać wniosku. Spróbuj ponownie.");
}

/**
 * Załącznik pobiera się podpisanym adresem z odpowiedzi (`download_url`, ważny 15 minut) z tokenem
 * osoby; serwer zapisuje wgląd w dzienniku (`AdminProfileController.php:149-158`).
 */
export async function pobierzZalacznik(adres: string, nazwa: string): Promise<WynikZalacznika> {
  try {
    await downloadFile(adres, nazwa);
    return { rodzaj: "pobrano" };
  } catch (blad) {
    // Link do pliku wygasa po 15 minutach, a jego odrzucenie nie niesie polskiego komunikatu z serwera —
    // poza „nie znaleziono” ekran podaje własne zdanie z wskazówką.
    return {
      rodzaj: "blad",
      komunikat:
        blad instanceof ApiError && blad.status === 404
          ? blad.message
          : "Nie udało się pobrać załącznika. Odśwież stronę i spróbuj ponownie — link do pliku wygasa po 15 minutach.",
    };
  }
}
