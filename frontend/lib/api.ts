/**
 * Klient API zgodny z kontraktem (docs/hackathon/02-kontrakt-api.md).
 *
 * - baza: NEXT_PUBLIC_API_URL + "/api/v1"
 * - token Bearer w localStorage pod kluczem "np_token"
 * - koperta odpowiedzi: { data, meta? } — api() zwraca samo `data`,
 *   apiPaged() zwraca { data, meta } (listy z paginacją)
 * - koperta błędu: { error: { status, code, message, errors?, reason? } }
 *   → rzucamy typowany ApiError
 * - 401 (poza /auth/login) → czyszczenie tokenu + przekierowanie na /logowanie
 */

export const TOKEN_KEY = "np_token";

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

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
}

export interface ApiOptions extends Omit<RequestInit, "body"> {
  /** Obiekt → JSON; FormData → multipart (uploady). */
  body?: unknown;
}

function baseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  return `${raw.replace(/\/+$/, "")}/api/v1`;
}

async function request(path: string, options: ApiOptions = {}): Promise<unknown> {
  const { body, headers: extraHeaders, ...init } = options;

  const headers = new Headers(extraHeaders);
  headers.set("Accept", "application/json");

  const token = getToken();
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

  // 401 = brak/nieważny token → wylogowanie (poza samym logowaniem)
  if (res.status === 401 && !path.startsWith("/auth/login")) {
    clearToken();
    if (typeof window !== "undefined") {
      window.location.assign(new URL("/logowanie", window.location.origin));
    }
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // brak JSON-a (np. 502 z proxy) — obsłużone niżej
  }

  if (!res.ok) {
    const envelope = json as { error?: Partial<ApiErrorBody> } | null;
    const err = envelope?.error;
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
