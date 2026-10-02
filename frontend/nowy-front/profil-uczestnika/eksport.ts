import { ApiError } from "@/lib/api/klient";
import { odmien } from "../wspolne/odmiana";
import type { StatusEksportu } from "./dane";

/** Co ile czekamy przed kolejnym sprawdzeniem stanu eksportu (jedno żądanie naraz). */
export const CZAS_SPRAWDZANIA_MS = 2000;

/** Eksport wciąż się buduje: sprawdzamy go dalej. */
export function czyPrzygotowywany(status: StatusEksportu): boolean {
  return status === "queued" || status === "processing";
}

export const KOMUNIKAT_PRZYGOTOWANIE_NIEUDANE = "Przygotowanie eksportu nie powiodło się. Spróbuj ponownie.";
export const KOMUNIKAT_SPRAWDZANIE_NIEUDANE = "Nie udało się sprawdzić statusu eksportu.";
export const KOMUNIKAT_EKSPORT_WYGASL = "Ten eksport wygasł i plik został usunięty. Przygotuj nowy.";
export const KOMUNIKAT_POBRANIE_NIEUDANE = "Nie udało się pobrać pliku. Spróbuj ponownie.";
export const KOMUNIKAT_ZLECENIE_NIEUDANE = "Nie udało się zlecić eksportu danych.";

/** Liczba sekund z `reason.retry_after_seconds` odmowy 429; bez poprawnej liczby — `null`. */
function sekundyDoPonowienia(wyjatek: ApiError): number | null {
  const surowa = wyjatek.reason?.retry_after_seconds;
  const sekundy = typeof surowa === "number" ? surowa : Number(surowa);
  return Number.isFinite(sekundy) && sekundy > 0 ? Math.ceil(sekundy) : null;
}

/**
 * Zdanie po nieudanym zleceniu eksportu. Trzy odmowy znaczą trzy różne rzeczy:
 * 429 to limit żądań (można spróbować później), 409 to reguła „jedna ważna paczka na osobę”
 * (serwer podaje gotowe zdanie — nie powtarzamy go tutaj), reszta to awaria.
 */
export function komunikatBleduZlecenia(wyjatek: unknown): string {
  if (!(wyjatek instanceof ApiError)) return KOMUNIKAT_ZLECENIE_NIEUDANE;
  if (wyjatek.code === "too_many_requests") {
    const sekundy = sekundyDoPonowienia(wyjatek);
    return sekundy === null
      ? "Za dużo żądań eksportu. Spróbuj ponownie za chwilę."
      : `Za dużo żądań eksportu. Spróbuj ponownie za ${sekundy} ${odmien(sekundy, "sekundę", "sekundy", "sekund")}.`;
  }
  return wyjatek.message;
}
