import { KONTO_BINDING_AWARIA, KOD_KONTO_ZABLOKOWANE, type AccountBindingCheck } from "@/lib/api";

/**
 * Logika ekranów logowania nowego frontu — wyjęta ze starych stron
 * (`app/logowanie/page.tsx`, `konta/page.tsx`, `niepowiazane/page.tsx`) bez
 * zmiany zdań, kodów, limitów ani adresów. Ekrany wołają te funkcje, a nie
 * własne kopie warunków.
 */

export const KOMUNIKATY_BLEDU: Record<string, string> = {
  OAuthCallbackError: "Konto Niepodzielni nie potwierdziło logowania. Spróbuj ponownie.",
  OAuthSignInError: "Nie udało się rozpocząć logowania przez Konta Niepodzielni.",
  AccessDenied: "Logowanie zostało anulowane.",
  Configuration: "Logowanie jest chwilowo niedostępne. Spróbuj ponownie później.",
};

export const KOMUNIKAT_NIEZNANEGO_BLEDU = "Logowanie się nie powiodło. Spróbuj ponownie.";
export const KOMUNIKAT_LIMITU_CZASU = "Logowanie nie odpowiedziało w wyznaczonym czasie. Spróbuj ponownie.";
export const KOMUNIKAT_BRAKU_POLACZENIA = "Nie udało się połączyć z serwerem. Spróbuj ponownie za chwilę.";
export const PRZEKIEROWUJE = "Przekierowuję do logowania…";
export const TYTUL_LOGOWANIA = "Zaloguj się";
export const OPIS_LOGOWANIA = "Platforma szkoleniowa programu Niepodzielni. Logujesz się kontem Niepodzielni.";
export const ETYKIETA_LOGOWANIA = "Zaloguj przez konto Niepodzielni";

/** Dostawca logowania i adres powrotu — te same argumenty `signIn` co na starej stronie. */
export const DOSTAWCA_LOGOWANIA = "keycloak";
export const POWROT_PO_LOGOWANIU = { callbackUrl: "/logowanie" } as const;

/**
 * Granica czasu startu logowania. Własna stała ekranu — NIE alias
 * `KONTO_BINDING_LIMIT_MS` z ekranu niepowiązania (ta sama wartość, inna decyzja).
 */
export const LIMIT_CZASU_LOGOWANIA_MS = 8_000;

export const ADRES_ZABLOKOWANE = "/logowanie/zablokowane";
export const ADRES_LOGOWANIA = "/logowanie";

/** Komunikat dla kodu `?error=` od biblioteki logowania; kod nieznany dostaje zdanie zastępcze. */
export function komunikatBleduLogowania(kod: string): string {
  return Object.hasOwn(KOMUNIKATY_BLEDU, kod) ? KOMUNIKATY_BLEDU[kod] : KOMUNIKAT_NIEZNANEGO_BLEDU;
}

interface SesjaLogowania {
  user?: { id?: unknown } | null;
  error?: unknown;
}

/** Sesja liczy się jako żywa tylko z identyfikatorem osoby i bez błędu odświeżenia tokenu. */
export function czyZalogowana(sesja: SesjaLogowania | null | undefined): boolean {
  return Boolean(sesja?.user?.id) && !sesja?.error;
}

/** Wyjątek przy starcie logowania: zerwana sieć (`TypeError`) albo niedostępne logowanie. */
export function komunikatAwariiStartu(wyjatek: unknown): string {
  return wyjatek instanceof TypeError ? KOMUNIKAT_BRAKU_POLACZENIA : KOMUNIKATY_BLEDU.Configuration;
}

/** Stary adres `/logowanie/konta` przekierowuje na `/logowanie`, zachowując `?error=`. */
export function adresPrzekierowaniaKont(blad: string | null): string {
  return blad ? `/logowanie?error=${encodeURIComponent(blad)}` : ADRES_LOGOWANIA;
}

export type StanNiepowiazania =
  | { rodzaj: "sprawdzanie" }
  | { rodzaj: "identyfikator"; sub: string }
  | { rodzaj: "brak-powiazania" }
  | { rodzaj: "awaria" }
  | { rodzaj: "zablokowane" };

/**
 * Wynik sprawdzenia powiązania → stan ekranu. `null` (brak tokenu albo konto
 * jednak powiązane) nie uzasadnia zdania o braku powiązania — to awaria.
 */
export function stanZWyniku(wynik: AccountBindingCheck | null): StanNiepowiazania {
  if (wynik === null) return { rodzaj: "awaria" };
  if (wynik.code === KOD_KONTO_ZABLOKOWANE) return { rodzaj: "zablokowane" };
  if (wynik.code === "konto_niepowiazane" && wynik.sub) return { rodzaj: "identyfikator", sub: wynik.sub };
  if (wynik.code === KONTO_BINDING_AWARIA) return { rodzaj: "awaria" };
  return { rodzaj: "brak-powiazania" };
}

/** Nagłówek mówi o braku połączenia dopiero, gdy to wiadomo. */
export function naglowekNiepowiazania(stan: StanNiepowiazania): string {
  return stan.rodzaj === "identyfikator" || stan.rodzaj === "brak-powiazania"
    ? "Konto nie jest jeszcze połączone"
    : "Twoje konto w PsychON";
}

/**
 * Sprawdzenie z własnym limitem czasu: pierwsze rozstrzygnięcie wygrywa. Po
 * limicie zapytanie jest przerywane, a wynik to awaria — spóźniona odpowiedź
 * nie wraca już na ekran. Odrzucenie zapytania to też awaria.
 */
export function sprawdzZLimitem(
  sprawdz: (sygnal: AbortSignal) => Promise<AccountBindingCheck | null>,
  limitMs: number,
): Promise<AccountBindingCheck | null> {
  const przerwanie = new AbortController();
  return new Promise((rozstrzygnij) => {
    const zegar = setTimeout(() => {
      przerwanie.abort();
      rozstrzygnij({ code: KONTO_BINDING_AWARIA });
    }, limitMs);

    void sprawdz(przerwanie.signal).then(
      (wynik) => {
        clearTimeout(zegar);
        rozstrzygnij(wynik);
      },
      () => {
        clearTimeout(zegar);
        rozstrzygnij({ code: KONTO_BINDING_AWARIA });
      },
    );
  });
}
