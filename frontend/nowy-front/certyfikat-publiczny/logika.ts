import {
  czyNumerCertyfikatu,
  czyTokenCertyfikatu,
  sciezkaWeryfikacjiNumeru,
  sciezkaWeryfikacjiTokenu,
} from "@/lib/certyfikat/ksztalt";

/** Wynik publicznej weryfikacji — kształt jak w `components/certyfikat/VerificationCard.tsx`. */
export interface WynikWeryfikacji {
  number: string;
  status: "valid" | "revoked";
  edition: string;
  issued_at: string | null;
}

export const KOMUNIKAT_NIE_ZNALEZIONO = "Nie znaleziono certyfikatu o podanym numerze.";
export const KOMUNIKAT_AWARII = "Nie udało się połączyć z serwerem. Spróbuj ponownie za chwilę.";

export type CelZAdresu = { rodzaj: "brak" } | { rodzaj: "bledny" } | { rodzaj: "sciezka"; sciezka: string };

/**
 * Wartość z adresu strony wchodzi do ścieżki żądania wyłącznie po sprawdzeniu
 * kształtu (białe znaki z brzegów obcięte). Wartość spoza kształtu daje to samo
 * co numer nieznany, bez pytania serwera. `token` ma pierwszeństwo przed
 * `number` — jak w `app/certyfikat/page.tsx`.
 */
export function celZAdresu(token: string | null, numer: string | null): CelZAdresu {
  if (token) {
    const wartosc = token.trim();
    return czyTokenCertyfikatu(wartosc)
      ? { rodzaj: "sciezka", sciezka: sciezkaWeryfikacjiTokenu(wartosc) }
      : { rodzaj: "bledny" };
  }
  if (numer) {
    const wartosc = numer.trim();
    return czyNumerCertyfikatu(wartosc)
      ? { rodzaj: "sciezka", sciezka: sciezkaWeryfikacjiNumeru(wartosc) }
      : { rodzaj: "bledny" };
  }
  return { rodzaj: "brak" };
}

/** Plakietka stanu certyfikatu. */
export function opisStatusu(status: WynikWeryfikacji["status"]): { wariant: "ok" | "error"; tekst: string } {
  return status === "valid" ? { wariant: "ok", tekst: "Ważny" } : { wariant: "error", tekst: "Unieważniony" };
}
