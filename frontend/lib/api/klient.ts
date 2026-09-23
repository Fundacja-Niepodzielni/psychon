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

async function request(path: string, options: ApiOptions = {}): Promise<unknown> {
  const { body, headers: extraHeaders, ...init } = options;

  const headers = new Headers(extraHeaders);
  headers.set("Accept", "application/json");

  const token = await getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body; // przeglądarka sama ustawi multipart boundary
  } else if (body !== undefined) {
    headers.set("Content-Type", "application/json");
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers,
    body: payload,
  });

  // 401 → patrz `handleUnauthorized` w `./logowanie` (rozróżnienie
  // „niepowiązany" / „sesja wygasła").
  if (res.status === 401) {
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
