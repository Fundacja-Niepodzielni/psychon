/**
 * Logowanie i powiązanie konta Niepodzielni z kontem PsychON — rozstrzyga,
 * co znaczy 401 z dowolnej trasy biznesowej (patrz `handleUnauthorized`
 * niżej, wołane z `request()` w `./klient`).
 */

import { ApiError, ApiErrorBody, baseUrl, endSession, getToken } from "./klient";

/** Ekran dla konta Niepodzielni z ważną sesją, które nie jest jeszcze
 * powiązane z żadnym kontem PsychON — patrz `handleUnauthorized` niżej. */
const UNBOUND_PATH = "/logowanie/niepowiazane";
const LOGIN_PATH = "/logowanie";

export interface WhoAmI {
  sub: string;
  roles: string[];
}

/**
 * `GET /sso/whoami` — jedyny punkt, który potwierdza, że wywołanie API
 * niesie token z sesji konta Fundacji, i pokazuje dokładnie to, co ten token
 * niesie (`sub`, `roles`). Odpowiedź NIE jest owinięta w kopertę `{ data }`
 * jak reszta API, więc woła surowy `fetch` wprost, a nie przez `api<T>()`.
 */
export async function fetchWhoAmI(): Promise<WhoAmI> {
  const token = await getToken();
  const headers = new Headers({ Accept: "application/json" });
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${baseUrl()}/sso/whoami`, { headers });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // brak JSON-a — obsłużone niżej przez rzucenie błędu z samym kodem HTTP
  }

  if (!res.ok) {
    const err = (json as { error?: Partial<ApiErrorBody> } | null)?.error;
    throw new ApiError({
      status: err?.status ?? res.status,
      code: err?.code ?? "unknown_error",
      message: err?.message ?? "Nie udało się potwierdzić tożsamości.",
      reason: err?.reason,
    });
  }

  const body = json as Partial<WhoAmI> | null;
  if (!body || typeof body.sub !== "string") {
    throw new ApiError({
      status: res.status,
      code: "unexpected_response",
      message: "Nieoczekiwana odpowiedź serwera.",
    });
  }
  return { sub: body.sub, roles: Array.isArray(body.roles) ? body.roles : [] };
}

/**
 * Rozstrzyga, co znaczy 401 z DOWOLNEJ trasy biznesowej (patrz `request()`
 * w `./klient`). Dwie przyczyny wyglądają dla przeglądarki identycznie (kod
 * 401), ale wymagają różnych ekranów:
 *
 * 1. Sesja konta Niepodzielni jest ważna, ale ten `sub` nie jest jeszcze
 *    powiązany z żadnym kontem PsychON — `GET /sso/whoami` (ten sam token)
 *    odpowiada 200. Kończenie sesji tutaj byłoby błędem: usunęłoby dokładnie
 *    to, co ekran `/logowanie/niepowiazane` ma pokazać razem z przyciskiem
 *    wylogowania. Bez tego rozróżnienia `/logowanie` (auto-start logowania
 *    przez konto Niepodzielni) i wciąż żywa sesja w Kontach dawały pętlę:
 *    401 → /logowanie → SSO wraca bez pytania o cokolwiek → /me znów 401.
 * 2. Sesja jest naprawdę nieważna — `whoami` na tym samym tokenie też
 *    odpowiada 401 (albo tokenu w ogóle nie ma). Wtedy sesja kończy się i
 *    przeglądarka wraca na `/logowanie`, które samo zacznie nowe logowanie.
 */
export async function handleUnauthorized(): Promise<void> {
  if (typeof window === "undefined") return;

  let sessionStillValidAtKeycloak = false;
  try {
    await fetchWhoAmI();
    sessionStillValidAtKeycloak = true;
  } catch {
    sessionStillValidAtKeycloak = false;
  }

  if (sessionStillValidAtKeycloak) {
    window.location.assign(new URL(UNBOUND_PATH, window.location.origin));
    return;
  }

  await endSession();
  window.location.assign(new URL(LOGIN_PATH, window.location.origin));
}

export interface AccountBindingCheck {
  code: string;
  /** Obecne wyłącznie, gdy `code === "konto_niepowiazane"` (koperta §1: `error.reason.sub`). */
  sub?: string;
}

/**
 * Kod zwracany przez {@link checkAccountBinding}, gdy `GET /me` PADNIE
 * inaczej niż odpowiedzią 401 (błąd sieci, 5xx, odpowiedź bez czytelnej
 * koperty JSON). To NIE jest kod z serwera — serwer o awarii nic nie mówi,
 * to rozstrzygnięcie klienta na podstawie tego, że w ogóle nie dostał
 * koperty 401. Ekran musi odróżnić to od „wiem, że nie masz roli"
 * (401 z czytelną kopertą) — inaczej kłamie o przyczynie.
 */
export const KONTO_BINDING_AWARIA = "awaria" as const;

/**
 * Limit czasu (ms) na sprawdzenie powiązania konta. Zapytanie, które nie
 * rozstrzyga się do tego czasu, jest PRZERYWANE i liczone jak awaria — bo
 * ekran bez limitu zostaje na komunikacie o braku powiązania, który przy
 * wiszącym zapytaniu jest nieprawdą (`fetch` sam z siebie nie ma limitu).
 *
 * 8 s: z zapasem powyżej realnej odpowiedzi `GET /me` na sieci komórkowej
 * (setki ms, przy słabym zasięgu pojedyncze sekundy), a wyraźnie poniżej
 * progu, po którym użytkownik uzna nieruchomy ekran za prawdziwą odpowiedź
 * i zadzwoni do administratora z fałszywą diagnozą.
 */
export const KONTO_BINDING_LIMIT_MS = 8_000;

/**
 * Sprawdza WPROST (surowy `fetch`, nie `request()`/`api()`), czy sesja jest
 * ważna, ale `sub` z tokena nie jest jeszcze powiązany z żadnym kontem
 * PsychON — używane wyłącznie przez ekran `/logowanie/niepowiazane`, żeby
 * pokazać identyfikator z kopert błędu (`error.code`, `error.reason.sub`).
 *
 * Ominięcie `request()` jest celowe: ten sam 401 uruchomiłby tam
 * `handleUnauthorized()`, a ten przekierowałby z powrotem na TĘ SAMĄ stronę —
 * pętlę przeładowań, którą `lib/__tests__/api-401-bez-petli.test.ts` już
 * pilnuje dla innej ścieżki.
 *
 * Identyfikator z odpowiedzi ląduje wyłącznie w stanie komponentu (pamięć
 * przeglądarki, znika przy odświeżeniu) — nigdy w adresie URL, w parametrach
 * zapytania ani w `localStorage`/`sessionStorage`, i nigdy nie trafia do
 * `console.log`/`console.error`.
 *
 * Zwraca `null`, gdy: brak tokena, `GET /me` odpowiedziało 2xx (konto jednak
 * powiązane) — obie sytuacje ekran traktuje jak „nie potrafię tego rozstrzygnąć"
 * (ta sama gałąź co awaria, z przyciskiem „spróbuj ponownie"), nigdy jak
 * „konto nie jest powiązane". Zwraca
 * `{ code: KONTO_BINDING_AWARIA }`, gdy zapytanie w ogóle nie dostało
 * czytelnej odpowiedzi 401 (sieć padła, serwer oddał 5xx albo coś, co nie
 * parsuje się jak koperta błędu) — WYŁĄCZNIE ta gałąź ma dać ekranowi znać
 * o chwilowej awarii; ścieżki 401 z czytelną kopertą zostają bez zmian.
 *
 * `signal` pozwala wołającemu PRZERWAĆ zapytanie (limit czasu ekranu,
 * odmontowanie komponentu). Przerwane zapytanie odrzuca obietnicę `fetch`,
 * więc wraca tą samą gałęzią co błąd sieci: `{ code: KONTO_BINDING_AWARIA }`.
 */
export async function checkAccountBinding(
  signal?: AbortSignal,
): Promise<AccountBindingCheck | null> {
  const token = await getToken();
  if (!token) return null;

  const headers = new Headers({ Accept: "application/json", Authorization: `Bearer ${token}` });
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}/me`, { headers, signal });
  } catch {
    return { code: KONTO_BINDING_AWARIA };
  }
  if (res.ok) return null;
  if (res.status !== 401) return { code: KONTO_BINDING_AWARIA };

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    return { code: KONTO_BINDING_AWARIA };
  }

  const err = (json as { error?: Partial<ApiErrorBody> } | null)?.error;
  if (!err?.code) return { code: KONTO_BINDING_AWARIA };
  const sub = typeof err.reason?.sub === "string" ? err.reason.sub : undefined;
  return { code: err.code, sub };
}
