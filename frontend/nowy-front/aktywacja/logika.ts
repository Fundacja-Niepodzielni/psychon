import { ApiError } from "@/lib/api";

/**
 * Logika ekranu aktywacji — wyjęta z `app/aktywacja/page.tsx` bez zmiany zdań
 * ani rozstrzygnięć. Ekran woła te funkcje, a nie własne kopie warunków.
 */

export type StanAktywacji =
  | { krok: "sprawdzanie" }
  | { krok: "brak-sesji" }
  | { krok: "wiazanie" }
  | { krok: "sukces" }
  | { krok: "odmowa"; komunikat: string }
  | { krok: "blad"; komunikat: string; mozliwePonowienie: boolean };

export const KOMUNIKAT_BRAKU_TOKENU = "Link aktywacyjny nie zawiera tokenu.";
export const KOMUNIKAT_BRAKU_POLACZENIA = "Nie udało się połączyć z serwerem. Spróbuj ponownie za chwilę.";

/** Adres powrotu po logowaniu: ten sam ekran z tym samym tokenem. */
export function adresPowrotuAktywacji(token: string): string {
  return `/aktywacja?token=${encodeURIComponent(token)}`;
}

/**
 * Błąd wiązania → stan ekranu. `null` dla 401: klient API przekierowuje sam,
 * ekran nie rysuje niczego nowego. 403 to odmowa (bez ponowienia). Odpowiedź
 * serwera 4xx jest ostateczna; brak odpowiedzi albo 5xx — awaria z ponowieniem.
 */
export function stanPoBledzieWiazania(wyjatek: unknown): StanAktywacji | null {
  if (wyjatek instanceof ApiError && wyjatek.status === 401) return null;
  if (wyjatek instanceof ApiError && wyjatek.status === 403) return { krok: "odmowa", komunikat: wyjatek.message };
  const mozliwePonowienie = !(wyjatek instanceof ApiError) || wyjatek.status >= 500;
  const komunikat = wyjatek instanceof ApiError ? wyjatek.message : KOMUNIKAT_BRAKU_POLACZENIA;
  return { krok: "blad", komunikat, mozliwePonowienie };
}

/** Zdanie stanu oczekiwania (sprawdzanie sesji, wiązanie, sukces). */
export function zdanieOczekiwania(krok: "sprawdzanie" | "wiazanie" | "sukces"): string {
  return krok === "sukces" ? "Konto powiązane. Przekierowuję…" : "Trwa łączenie konta…";
}
