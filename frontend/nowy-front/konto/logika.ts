import { ApiError } from "@/lib/api";

/** Usterka odczytu tożsamości — rozstrzygnięcia jak w `app/konto/page.tsx`. */
export type Usterka =
  | { rodzaj: "sesja"; komunikat: string }
  | { rodzaj: "odmowa"; komunikat: string }
  | { rodzaj: "awaria"; komunikat: string };

/** Powrót po nieudanym odczycie adresu wylogowania — ten sam co na starej stronie. */
export const ADRES_POWROTU_KONTA = "/logowanie/konta";

/**
 * 401 — komunikat sesji z kodem, bez ponowienia; 403 — odmowa roli, bez
 * ponowienia; każdy inny błąd (5xx, sieć) — awaria z ponowieniem, bez kodu.
 */
export function usterkaZBledu(wyjatek: unknown): Usterka {
  if (wyjatek instanceof ApiError && wyjatek.status === 401) {
    return { rodzaj: "sesja", komunikat: `${wyjatek.message} (kod: ${wyjatek.code})` };
  }
  if (wyjatek instanceof ApiError && wyjatek.status === 403) {
    return { rodzaj: "odmowa", komunikat: wyjatek.message };
  }
  return {
    rodzaj: "awaria",
    komunikat: wyjatek instanceof ApiError ? wyjatek.message : "Nie udało się połączyć z serwerem.",
  };
}
