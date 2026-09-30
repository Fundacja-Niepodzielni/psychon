/**
 * Dane ekranu decyzji o zgłoszeniu rekrutacyjnym — trasy `backend/routes/api/h03.php:33-35,37`
 * (`Admin/ApplicationController`: `show`, `accept`, `reject`, `diplomaScan`).
 *
 * Moduł nie zna Reacta: każda operacja zwraca wynik opisany rodzajem (nie rzuca),
 * więc ekran tylko wybiera, co pokazać. Kody i komunikaty pochodzą z koperty błędu.
 */
import { api, ApiError, baseUrl } from "@/lib/api/klient";
import { downloadFile } from "@/lib/api/pliki";
import type { ApplicationItem, ApplicationRole } from "@/lib/h03/types";
import { ROLE_LABELS } from "@/lib/h18/labels";
import { formatujDate } from "../wspolne/daty";

/** `ApplicationResource` (`backend/app/Http/Resources/H03/ApplicationResource.php:15-40`). */
export type Zgloszenie = ApplicationItem & {
  consent_regulamin_at: string | null;
  consent_polityka_at: string | null;
};

export type WynikOdczytu =
  | { rodzaj: "gotowy"; zgloszenie: Zgloszenie }
  | { rodzaj: "brak-uprawnien" }
  | { rodzaj: "nie-znaleziono" }
  | { rodzaj: "blad" };

export type WynikAkceptacji =
  | { rodzaj: "zaakceptowano"; userId: number; zaproszenie: "sent" | "failed" }
  | { rodzaj: "istnieje-konto"; komunikat: string; istniejacaOsoba: number | null }
  | { rodzaj: "limit-miejsc"; komunikat: string; limit: number | null; zajete: number | null }
  | { rodzaj: "rozstrzygniete"; komunikat: string }
  | { rodzaj: "bledy-pol"; komunikat: string; bledy: Record<string, string[]> }
  | { rodzaj: "brak-uprawnien"; komunikat: string }
  | { rodzaj: "nie-znaleziono"; komunikat: string }
  | { rodzaj: "blad"; komunikat: string };

export type WynikOdrzucenia =
  | { rodzaj: "odrzucono"; zgloszenie: Zgloszenie }
  | { rodzaj: "bledy-pol"; komunikat: string; bledy: Record<string, string[]> }
  | { rodzaj: "rozstrzygniete"; komunikat: string }
  | { rodzaj: "brak-uprawnien"; komunikat: string }
  | { rodzaj: "nie-znaleziono"; komunikat: string }
  | { rodzaj: "blad"; komunikat: string };

export type WynikSkanu = { rodzaj: "pobrano" } | { rodzaj: "blad"; komunikat: string };

interface OdpowiedzAkceptacji {
  user_id: number;
  access_expires_at: string;
  invitation_mail: "sent" | "failed";
}

/** Role wybierane przy akceptacji. Rola `super_admin` nie jest oferowana: nadaje ją wyłącznie Super Admin (`AcceptApplicationRequest.php:14-17`). */
export const ROLE_PRZY_AKCEPTACJI: ApplicationRole[] = ["volunteer", "student", "instructor", "project_manager"];

export const OPCJE_ROL = ROLE_PRZY_AKCEPTACJI.map((rola) => ({ wartosc: rola, etykieta: ROLE_LABELS[rola] }));

/** Rola z formularza zgłoszenia jest wartością domyślną wyboru; Super Admin z wniosku nie jest przenoszony. */
export function rolaDomyslna(rolaZeZgloszenia: ApplicationRole): ApplicationRole {
  return ROLE_PRZY_AKCEPTACJI.includes(rolaZeZgloszenia) ? rolaZeZgloszenia : "volunteer";
}

export function etykietaRoli(rola: string): string {
  return ROLE_LABELS[rola as ApplicationRole] ?? "";
}

export function poprawneId(id: string): number | null {
  return /^[1-9][0-9]*$/.test(id) ? Number(id) : null;
}

/** Adres karty osoby w istniejącej trasie produktu (`app/(administracja)/admin/uczestniczki/[id]`). */
export function adresKartyOsoby(idOsoby: number): string {
  return `/admin/uczestniczki/${idOsoby}`;
}

export function dataPl(iso: string | null): string {
  return formatujDate(iso);
}

function liczbaZReason(reason: ApiError["reason"], klucz: string): number | null {
  const wartosc = reason?.[klucz];
  return typeof wartosc === "number" ? wartosc : null;
}

export async function wczytajZgloszenie(id: number): Promise<WynikOdczytu> {
  try {
    const zgloszenie = await api<Zgloszenie>(`/admin/applications/${id}`);
    return { rodzaj: "gotowy", zgloszenie };
  } catch (blad) {
    if (blad instanceof ApiError && (blad.status === 401 || blad.status === 403)) return { rodzaj: "brak-uprawnien" };
    if (blad instanceof ApiError && blad.status === 404) return { rodzaj: "nie-znaleziono" };
    return { rodzaj: "blad" };
  }
}

export async function zaakceptujZgloszenie(id: number, rola: ApplicationRole, wymusLimit: boolean): Promise<WynikAkceptacji> {
  try {
    const dane = await api<OdpowiedzAkceptacji>(`/admin/applications/${id}/accept`, {
      method: "POST",
      body: wymusLimit ? { role: rola, force: true } : { role: rola },
    });
    return { rodzaj: "zaakceptowano", userId: dane.user_id, zaproszenie: dane.invitation_mail };
  } catch (blad) {
    if (!(blad instanceof ApiError)) {
      return { rodzaj: "blad", komunikat: "Nie udało się zaakceptować zgłoszenia. Spróbuj ponownie." };
    }
    if (blad.status === 409 && blad.code === "email_already_registered") {
      return { rodzaj: "istnieje-konto", komunikat: blad.message, istniejacaOsoba: liczbaZReason(blad.reason, "existing_user_id") };
    }
    if (blad.status === 409 && blad.code === "edition_capacity_exceeded") {
      return {
        rodzaj: "limit-miejsc",
        komunikat: blad.message,
        limit: liczbaZReason(blad.reason, "capacity"),
        zajete: liczbaZReason(blad.reason, "active"),
      };
    }
    if (blad.status === 409 && blad.code === "application_already_decided") {
      return { rodzaj: "rozstrzygniete", komunikat: blad.message };
    }
    if (blad.status === 422 && blad.errors) return { rodzaj: "bledy-pol", komunikat: blad.message, bledy: blad.errors };
    if (blad.status === 401 || blad.status === 403) return { rodzaj: "brak-uprawnien", komunikat: blad.message };
    if (blad.status === 404) return { rodzaj: "nie-znaleziono", komunikat: blad.message };
    return { rodzaj: "blad", komunikat: blad.message };
  }
}

export async function odrzucZgloszenie(id: number, powod: string): Promise<WynikOdrzucenia> {
  try {
    const zgloszenie = await api<Zgloszenie>(`/admin/applications/${id}/reject`, { method: "POST", body: { reason: powod } });
    return { rodzaj: "odrzucono", zgloszenie };
  } catch (blad) {
    if (!(blad instanceof ApiError)) {
      return { rodzaj: "blad", komunikat: "Nie udało się odrzucić zgłoszenia. Spróbuj ponownie." };
    }
    if (blad.status === 422 && blad.errors) return { rodzaj: "bledy-pol", komunikat: blad.message, bledy: blad.errors };
    if (blad.status === 409 && blad.code === "application_already_decided") {
      return { rodzaj: "rozstrzygniete", komunikat: blad.message };
    }
    if (blad.status === 401 || blad.status === 403) return { rodzaj: "brak-uprawnien", komunikat: blad.message };
    if (blad.status === 404) return { rodzaj: "nie-znaleziono", komunikat: blad.message };
    return { rodzaj: "blad", komunikat: blad.message };
  }
}

/** Skan otwiera się z tokenem osoby; serwer zapisuje wgląd w dzienniku (`DiplomaScanAccess.php:41-52`). */
export async function pobierzSkanDyplomu(id: number): Promise<WynikSkanu> {
  try {
    await downloadFile(`${baseUrl()}/admin/applications/${id}/diploma-scan`, `skan-dyplomu-${id}`);
    return { rodzaj: "pobrano" };
  } catch (blad) {
    return {
      rodzaj: "blad",
      komunikat: blad instanceof ApiError ? blad.message : "Nie udało się pobrać skanu dyplomu. Spróbuj ponownie.",
    };
  }
}
