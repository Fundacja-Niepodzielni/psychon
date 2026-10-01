/**
 * Klient API zgodny z kontraktem (docs/hackathon/02-kontrakt-api.md).
 *
 * - baza: NEXT_PUBLIC_API_URL + "/api/v1"; token Bearer z sesji Auth.js
 *   (`/api/auth/session`, nigdy `localStorage`) — patrz `getToken`.
 * - koperta odpowiedzi: { data, meta? } — api() zwraca `data`, apiPaged()
 *   zwraca { data, meta }; koperta błędu → typowany `ApiError`.
 * - 401/whoami/powiązanie konta → `./logowanie` (`handleUnauthorized`,
 *   `checkAccountBinding`); pliki do pobrania → `./pliki` (`downloadFile`).
 */

import { signOut } from "next-auth/react";
import { handleUnauthorized } from "./logowanie";
import { adresWBazie, zgodnaZLiteralem } from "./adres-straznik";
import { czyOdczytKonta, czySciezkaMe, odczytajMe, wyczyscPamiecMe } from "./pamiec-me";

export interface PaginationMeta {
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
  extra?: Record<string, unknown>;
}

export interface ApiErrorBody {
  status: number;
  code: string;
  message: string;
  errors?: Record<string, string[]>;
  reason?: Record<string, unknown> & { missing?: string[] };
}

export class ApiError extends Error {
  status: number;
  code: string;
  errors?: Record<string, string[]>;
  reason?: ApiErrorBody["reason"];

  constructor(body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiError";
    this.status = body.status;
    this.code = body.code;
    this.errors = body.errors;
    this.reason = body.reason;
  }
}

/**
 * Ścieżka żądania nie przeszła kontroli (`adresApi`) — żądania nie wysłano i
 * tokenu nie odczytano. To wyjątek KLIENTA, nie odpowiedź serwera: nie ma kodu
 * HTTP, a komunikat celowo nie niesie odrzuconej ścieżki (wartość mogła przyjść
 * z adresu strony — nie trafia do konsoli ani dziennika).
 */
export class NieprawidlowaSciezkaApi extends Error {
  constructor() {
    super("Odrzucono żądanie do API: niedozwolona ścieżka.");
    this.name = "NieprawidlowaSciezkaApi";
  }
}

const SESSION_ENDPOINT = "/api/auth/session";

interface SessionState {
  token: string | null;
  expiresAt: number; // 0 = brak sesji / nieznane
}

let sessionCache: SessionState | null = null;
let sessionInFlight: Promise<SessionState> | null = null;

async function fetchSession(): Promise<SessionState> {
  if (typeof window === "undefined") return { token: null, expiresAt: 0 };
  try {
    const res = await fetch(SESSION_ENDPOINT, { credentials: "same-origin" });
    if (!res.ok) return { token: null, expiresAt: 0 };
    const json = (await res.json()) as {
      accessToken: string | null;
      expiresAt: number | null;
      error?: "RefreshAccessTokenError";
    };
    if (json.error === "RefreshAccessTokenError") {
      // The `jwt` callback tried to rotate the account-system token and
      // failed — the cookie may still exist, but the session behind it is
      // dead. Ending it here, rather than waiting for the next API call to
      // answer 401, is the "drop the session" half of token refresh: the
      // app must not keep saying "signed in" while the token is gone.
      wyczyscPamiecMe();
      void signOut({ redirect: false });
      return { token: null, expiresAt: 0 };
    }
    return { token: json.accessToken, expiresAt: json.expiresAt ?? 0 };
  } catch {
    return { token: null, expiresAt: 0 };
  }
}

/**
 * Zwraca token do nagłówka `Authorization` — z sesji Auth.js, podręcznie
 * cache'owanej do jej wygaśnięcia (`/api/auth/session`). Żaden token nie
 * mieszka w `localStorage`.
 */
export async function getToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  const now = Date.now();
  if (sessionCache && sessionCache.expiresAt - 5000 > now) {
    return sessionCache.token;
  }
  if (!sessionInFlight) {
    sessionInFlight = fetchSession().finally(() => {
      sessionInFlight = null;
    });
  }
  sessionCache = await sessionInFlight;
  return sessionCache.token;
}

/** Czyści tylko podręczny cache po stronie przeglądarki — dla zakończenia
 * samej sesji Auth.js patrz `endSession`. */
function invalidateSessionCache(): void {
  sessionCache = { token: null, expiresAt: 0 };
  sessionInFlight = null;
  wyczyscPamiecMe();
}

/** Kończy sesję Auth.js i czyści podręczny cache — patrz `handleUnauthorized`
 * w `./logowanie` (gałąź „sesja naprawdę nieważna"). */
export async function endSession(): Promise<void> {
  invalidateSessionCache();
  await signOut({ redirect: false });
}

export interface ApiOptions extends Omit<RequestInit, "body"> {
  /** Obiekt → JSON; FormData → multipart (uploady). */
  body?: unknown;
}

/** Zbudowana baza adresu API — używana też przez `./logowanie` (whoami,
 * sprawdzenie powiązania konta). */
export function baseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  return `${raw.replace(/\/+$/, "")}/api/v1`;
}

/** Ile razy wolno zdekodować ścieżkę, szukając pod kodowaniem zakazanych znaków. */
const MAKS_DEKODOWAN_SCIEZKI = 3;

/** Znaki sterujące: C0 (z tabulacją i końcami wierszy), DEL i C1. */
const ZNAKI_STEROWANIE = /[\u0000-\u001F\u007F-\u009F]/;

export { adresWBazie, zgodnaZLiteralem };

/**
 * Pełny adres żądania albo wyjątek {@link NieprawidlowaSciezkaApi}. Do ścieżki
 * wchodzą wartości z adresu strony, parametrów trasy i pól formularzy, a
 * `fetch` (i serwer za nim) zwija `..`, `%2e%2e` i `\`, więc taka wartość
 * mogłaby skierować żądanie z tokenem osoby pod całkiem inną ścieżkę niż
 * zamierzona. Ścieżka jest przyjmowana, gdy:
 * - zaczyna się od dokładnie jednego `/` i nie zawiera `#`;
 * - cały napis nie zawiera znaków sterujących wprost (parser `URL` usuwa
 *   tabulator i końce wierszy po cichu, więc adres wyglądałby inaczej, niż go
 *   napisano); znak sterujący zakodowany w ZAPYTANIU (`%09` z `URLSearchParams`)
 *   jest zwykłą wartością i nie jest odrzucany;
 * - część przed `?`, zdekodowana procentowo (najwyżej 3 razy, błąd dekodowania
 *   odrzuca), nie zawiera znaków sterujących, `%`, `\`, `//` ani segmentu `.` /
 *   `..`; zapytanie musi się poprawnie dekodować, ale jego treść nie jest
 *   oceniana;
 * - nie zawiera zakodowanego ukośnika (`%2f` w dowolnej wielkości liter, także
 *   kodowanego wielokrotnie) — wartość z ukośnikiem wstawia się segment po
 *   segmencie;
 * - po sklejeniu z bazą zgadzają się origin i przedrostek `pathname` bazy;
 * - ścieżka po normalizacji parsera `URL` ma tę samą liczbę i treść segmentów
 *   co napisana ({@link zgodnaZLiteralem}) — to jest ocena PO normalizacji, bo
 *   końcowa spacja przy `..` zmienia go w segment kropkowy dopiero w parserze.
 * Część po `?` nie podlega kontroli segmentów. Zwracany jest ten sam napis co
 * zawsze (`${baza}${ścieżka}`); komunikat wyjątku nie niesie ścieżki.
 *
 * Adres powstaje przez sklejenie napisów, nigdy przez `new URL(ścieżka, baza)`:
 * to drugie zamienia `//host` i `https://host` w adres innego hosta i gubi
 * przedrostek bazy, więc `URL` służy tu wyłącznie do oceny adresu.
 */
export function adresApi(path: string, base: string): string {
  const odrzuc = (): never => {
    throw new NieprawidlowaSciezkaApi();
  };

  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || path.includes("#")) {
    return odrzuc();
  }

  const znakZapytania = path.indexOf("?");
  const literal = znakZapytania === -1 ? path : path.slice(0, znakZapytania);
  const zapytanie = znakZapytania === -1 ? "" : path.slice(znakZapytania);
  // Bez zapytania parser przycina końcowe spacje całego adresu przed zwinięciem
  // segmentów, więc segmenty ocenia się na ścieżce już przyciętej (także po
  // zdekodowaniu: `%252e%252e ` to dla parsera `%252e%252e`, a po dekodowaniu `..`).
  let sciezka = znakZapytania === -1 ? literal.replace(/ +$/, "") : literal;
  let zakodowanyUkosnik = false;
  try {
    for (let dekodowan = 0; dekodowan < MAKS_DEKODOWAN_SCIEZKI && /%[0-9a-f]{2}/i.test(sciezka); dekodowan += 1) {
      if (/%2f/i.test(sciezka)) zakodowanyUkosnik = true;
      sciezka = decodeURIComponent(sciezka);
    }
    // Zapytanie tylko sprawdzamy pod kątem poprawnego kodowania procentowego;
    // zdekodowana wartość jest daną, nie ścieżką.
    decodeURIComponent(zapytanie);
  } catch {
    return odrzuc();
  }

  if (
    zakodowanyUkosnik ||
    ZNAKI_STEROWANIE.test(path) ||
    ZNAKI_STEROWANIE.test(sciezka) ||
    sciezka.includes("%") ||
    sciezka.includes("\\") ||
    sciezka.includes("//") ||
    /(^|\/)\.{1,2}(\/|$)/.test(sciezka)
  ) {
    return odrzuc();
  }

  const czysta = base.replace(/\/+$/, "");
  const wzglednyOrigin = "http://wzgledny.invalid";
  const bazaUrl = new URL(`${czysta}/`, wzglednyOrigin);
  const adresUrl = new URL(`${czysta}${path}`, wzglednyOrigin);
  if (!adresWBazie(adresUrl, bazaUrl)) {
    return odrzuc();
  }
  if (!zgodnaZLiteralem(czysta, literal, zapytanie, adresUrl, wzglednyOrigin)) {
    return odrzuc();
  }
  return `${czysta}${path}`;
}

/**
 * Jedno żądanie do API z kopertą i obsługą błędów. Każde żądanie klienta
 * (`api`, `apiPaged`) przechodzi tędy i najpierw przez kontrolę ścieżki
 * (`adresApi`) — przed pamięcią konta, przed odczytem tokenu i przed `fetch`.
 * Odczyt `GET /me` idzie
 * przez krótką pamięć (`./pamiec-me`) — strażnik roli, powłoka i ekran
 * pytają o to samo konto jedno po drugim, a strona ma kosztować jedno
 * żądanie. Reszta ścieżek jest bez pamięci.
 */
async function request(path: string, options: ApiOptions = {}): Promise<unknown> {
  // Pierwsza instrukcja: ścieżka z `..` pod przedrostkiem `/me` nie może trafić
  // do pamięci konta, a odrzucone żądanie nie czyta tokenu.
  adresApi(path, baseUrl());

  const metoda = (options.method ?? "GET").toUpperCase();

  if (czySciezkaMe(path)) {
    if (metoda !== "GET") {
      // Zmiana konta (np. `PATCH /me`): pamięć czyścimy przed żądaniem i po
      // nim — odczyt wystartowany w trakcie nie może wrócić ze starą treścią.
      wyczyscPamiecMe();
      try {
        return await wyslij(path, options, await getToken());
      } finally {
        wyczyscPamiecMe();
      }
    }
    // Żądanie z własnym `signal` nie bierze udziału we wspólnym zadaniu —
    // jego przerwanie nie może unieważnić odpowiedzi innych wywołujących.
    if (czyOdczytKonta(path, metoda) && !options.signal) {
      const token = await getToken();
      return odczytajMe(token, () => wyslij(path, options, token));
    }
  }

  return wyslij(path, options, await getToken());
}

async function wyslij(path: string, options: ApiOptions, token: string | null): Promise<unknown> {
  const { body, headers: extraHeaders, ...init } = options;

  const headers = new Headers(extraHeaders);
  headers.set("Accept", "application/json");

  if (token) headers.set("Authorization", `Bearer ${token}`);

  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body; // przeglądarka sama ustawi multipart boundary
  } else if (body !== undefined) {
    headers.set("Content-Type", "application/json");
    payload = JSON.stringify(body);
  }

  const res = await fetch(adresApi(path, baseUrl()), {
    ...init,
    headers,
    body: payload,
    // API odpowiada kopertą JSON i niczego nie przekierowuje; żądanie z tokenem
    // nie idzie za przekierowaniem pod inny adres.
    redirect: "error",
  });

  // 401 → patrz `handleUnauthorized` w `./logowanie` (rozróżnienie
  // „niepowiązany" / „sesja wygasła").
  if (res.status === 401) {
    wyczyscPamiecMe();
    void handleUnauthorized();
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // brak JSON-a (np. 502 z proxy) — obsłużone niżej
  }

  const envelope = json as { error?: Partial<ApiErrorBody> } | null;
  const err = envelope?.error;

  // 403 access_expired (H04) → wspólny ekran startera "Dostęp wygasł"
  if (res.status === 403 && err?.code === "access_expired" && typeof window !== "undefined") {
    window.location.assign(new URL("/dostep-wygasl", window.location.origin));
  }

  if (!res.ok) {
    throw new ApiError({
      status: err?.status ?? res.status,
      code: err?.code ?? "unknown_error",
      message:
        err?.message ?? "Coś poszło nie tak. Spróbuj ponownie za chwilę.",
      errors: err?.errors,
      reason: err?.reason,
    });
  }

  return json;
}

/** Zwraca `data` z koperty odpowiedzi. */
export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const json = (await request(path, options)) as { data: T };
  return json.data;
}

/** Dla list z paginacją — zwraca `data` oraz `meta`. */
export async function apiPaged<T>(
  path: string,
  options: ApiOptions = {},
): Promise<{ data: T[]; meta?: PaginationMeta }> {
  return (await request(path, options)) as { data: T[]; meta?: PaginationMeta };
}
