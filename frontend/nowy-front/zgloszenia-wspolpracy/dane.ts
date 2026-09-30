import { ApiError } from "@/lib/api/klient";
import type { AdminCooperationRequest, CooperationRequestStatus } from "@/lib/api/h01-wspolpraca";

/**
 * Logika danych ekranu zgłoszeń dalszej współpracy (administracja):
 * słownik statusów, opcje filtra, klasyfikacja błędów odczytu i zapisu
 * odpowiedzi. Ekran tylko wybiera szablon i wstawia organizmy.
 */

export type WariantPlakietki = "neutral" | "ok" | "warn" | "error" | "pending";
export type FiltrStatusu = CooperationRequestStatus | "";

export const LICZBA_ZNAKOW_MAX = 2000;

export const PLAKIETKA_STATUSU: Record<CooperationRequestStatus, { wariant: WariantPlakietki; tekst: string }> = {
  new: { wariant: "pending", tekst: "nowe" },
  answered: { wariant: "ok", tekst: "z odpowiedzią" },
  closed: { wariant: "neutral", tekst: "zamknięte" },
};

export const OPCJE_FILTRA: { wartosc: FiltrStatusu; etykieta: string }[] = [
  { wartosc: "", etykieta: "Wszystkie" },
  { wartosc: "new", etykieta: "Nowe" },
  { wartosc: "answered", etykieta: "Z odpowiedzią" },
  { wartosc: "closed", etykieta: "Zamknięte" },
];

export const OPCJE_STATUSU_PO_ODPOWIEDZI = [
  { wartosc: "answered", etykieta: "Z odpowiedzią" },
  { wartosc: "closed", etykieta: "Zamknięte" },
];

export function nazwaOsoby(zgloszenie: AdminCooperationRequest): string {
  return zgloszenie.user ? `${zgloszenie.user.first_name} ${zgloszenie.user.last_name}` : "Osoba nieznana";
}

/** Odczyt listy: odmowa roli (401/403) to osobny stan, reszta to błąd sieci. */
export function czyBrakUprawnien(blad: unknown): boolean {
  return blad instanceof ApiError && (blad.status === 401 || blad.status === 403);
}

/** Odpowiedź można napisać na zgłoszenie nowe i już odpowiedziane; zamknięte jest ostateczne. */
export function moznaOdpowiedziec(zgloszenie: AdminCooperationRequest): boolean {
  return zgloszenie.status !== "closed";
}

export type BladOdpowiedzi =
  | { rodzaj: "pola"; bledy: Record<string, string[]> }
  | { rodzaj: "zamkniete"; komunikat: string }
  | { rodzaj: "brak-zgloszenia"; komunikat: string }
  | { rodzaj: "inny"; komunikat: string };

const KOMUNIKAT_SIECI = "Nie udało się zapisać odpowiedzi. Spróbuj ponownie.";

export function sklasyfikujBladOdpowiedzi(blad: unknown): BladOdpowiedzi {
  if (blad instanceof ApiError) {
    if (blad.errors) return { rodzaj: "pola", bledy: blad.errors };
    if (blad.status === 403 && blad.code === "cooperation_request_closed") {
      return { rodzaj: "zamkniete", komunikat: blad.message };
    }
    if (blad.status === 404) return { rodzaj: "brak-zgloszenia", komunikat: "Zgłoszenie nie istnieje." };
    return { rodzaj: "inny", komunikat: blad.message };
  }
  return { rodzaj: "inny", komunikat: KOMUNIKAT_SIECI };
}

/** Po odpowiedzi zgłoszenie może wypaść spod aktywnego filtra statusu. */
export function czyPasujeDoFiltra(zgloszenie: AdminCooperationRequest, filtr: FiltrStatusu): boolean {
  return filtr === "" || zgloszenie.status === filtr;
}
