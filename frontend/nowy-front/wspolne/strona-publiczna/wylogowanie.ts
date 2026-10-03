import { endSession } from "@/lib/api";

/** Adres, pod którym serwer aplikacji podaje adres wylogowania z Kont Niepodzielni. */
export const ADRES_KONCA_SESJI = "/api/auth/end-session-url";

interface Nawigacja {
  /** Pełne przejście pod adres Kont (`window.location.assign`). */
  wyjdz: (url: string) => void;
  /** Powrót w aplikacji, gdy adresu Kont nie da się odczytać. */
  wroc: () => void;
}

/**
 * Wylogowanie z ekranów konta — ten sam przebieg co na starych stronach
 * `/logowanie/niepowiazane`, `/logowanie/zablokowane` i `/konto`: najpierw
 * odczyt adresu wylogowania Kont (niesie podpowiedź z ciasteczka bieżącej
 * sesji, której po `endSession()` już nie ma), potem koniec sesji aplikacji,
 * na końcu pełne przejście pod ten adres. Gdy odczyt zawiedzie, sesja i tak
 * się kończy, a ekran wraca w aplikacji. Zwraca `true` po wyjściu pod adres
 * Kont, `false` po powrocie.
 */
export async function wylogujZKont({ wyjdz, wroc }: Nawigacja): Promise<boolean> {
  try {
    const odpowiedz = await fetch(ADRES_KONCA_SESJI);
    const { url } = (await odpowiedz.json()) as { url: string };
    await endSession();
    wyjdz(url);
    return true;
  } catch {
    await endSession();
    wroc();
    return false;
  }
}
