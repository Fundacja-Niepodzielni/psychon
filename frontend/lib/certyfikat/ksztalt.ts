/**
 * Kształt numeru certyfikatu i tokenu z kodu QR — jedno miejsce prawdy dla
 * ekranów, które wkładają taką wartość do ścieżki żądania (`/verify/{numer}`,
 * `/verify/qr/{token}`).
 *
 * Skąd te wzory (zaplecze, `backend/app/Jobs/GenerateCertificate.php`):
 * - numer to `NP/<rok>/<numer kolejny>`; rok z `sprintf('NP/%d/', …)`, numer
 *   kolejny z `sprintf('%03d', …)`, więc ma co najmniej trzy cyfry, a po
 *   tysiącu rośnie dalej (`NP/2026/1000`). Numer zawiera ukośniki — to jest
 *   jego prawidłowa postać, nie ślad wstrzyknięcia;
 * - token to `Str::random(40)`: dokładnie 40 znaków `[A-Za-z0-9]`.
 *
 * Wartość spoza kształtu nie jest numerem ani tokenem żadnego certyfikatu, więc
 * ekran nie ma po co o nią pytać serwera — pokazuje ten sam wynik co dla numeru
 * nieznanego (kontrakt: nieznany i błędny numer dają identyczną odpowiedź).
 * Funkcje sprawdzają wartość DOSŁOWNIE: białe znaki z brzegów obcina wołający
 * przed sprawdzeniem.
 */

import { sciezka } from "@/lib/api/sciezka";

const WZOR_NUMERU = /^NP\/\d{4}\/\d{3,}$/;
const WZOR_TOKENU = /^[A-Za-z0-9]{40}$/;

/** Czy `wartosc` ma kształt numeru certyfikatu (`NP/2026/017`). */
export function czyNumerCertyfikatu(wartosc: string): boolean {
  return WZOR_NUMERU.test(wartosc);
}

/** Czy `wartosc` ma kształt tokenu z kodu QR (40 liter i cyfr). */
export function czyTokenCertyfikatu(wartosc: string): boolean {
  return WZOR_TOKENU.test(wartosc);
}

/**
 * Ścieżka weryfikacji po numerze (`/verify/NP/2026/017`). Numer ma ukośniki, a
 * klient API odrzuca zakodowany ukośnik, więc numer wchodzi do ścieżki segment
 * po segmencie — każdy segment przez kodowanie wartości. Wartość spoza kształtu
 * numeru nie dostaje ścieżki: to błąd wołającego, który miał ją sprawdzić.
 */
export function sciezkaWeryfikacjiNumeru(numer: string): string {
  if (!czyNumerCertyfikatu(numer)) throw new Error("Wartość spoza kształtu numeru certyfikatu nie wchodzi do ścieżki.");
  const [prefiks, rok, kolejny] = numer.split("/");
  return sciezka`/verify/${prefiks}/${rok}/${kolejny}`;
}

/** Ścieżka weryfikacji po tokenie z kodu QR (`/verify/qr/<40 znaków>`). */
export function sciezkaWeryfikacjiTokenu(token: string): string {
  if (!czyTokenCertyfikatu(token)) throw new Error("Wartość spoza kształtu tokenu certyfikatu nie wchodzi do ścieżki.");
  return sciezka`/verify/qr/${token}`;
}
