/**
 * Pobieranie plików chronionych autoryzacją (Bearer) — używane m.in. przy
 * eksportach CSV (H18, H20) i dokumentach z profilu (H14).
 */

import { ApiError, ApiErrorBody, baseUrl, getToken } from "./klient";

/**
 * Błąd pomocnika pobierania: adres pliku nie należy do API. Rzucany przed
 * odczytem tokenu i przed jakimkolwiek żądaniem; komunikat celowo nie niesie
 * adresu.
 */
export class NieprawidlowyAdresPliku extends Error {
  constructor() {
    super("Odrzucono pobranie pliku: adres spoza API.");
    this.name = "NieprawidlowyAdresPliku";
  }
}

/**
 * Czy adres pliku ma to samo pochodzenie (schemat, host, port) co baza API.
 * Porównywane są pochodzenia adresów rozebranych parserem `URL` — tym samym,
 * którego używa `fetch` — a nie początki napisów. Adres musi być bezwzględny:
 * adres względny i adres zaczynający się od `//` nie przechodzą.
 */
export function adresTegoSamegoApi(adres: string, baza: string = baseUrl()): boolean {
  if (typeof adres !== "string") return false;
  try {
    const plik = new URL(adres);
    const api = new URL(baza);
    return plik.origin !== "null" && plik.origin === api.origin;
  } catch {
    return false;
  }
}

/**
 * Pobiera plik przez `fetch` z nagłówkiem Bearer i zapisuje go jako blob —
 * zwykły `<a href>` nie przeniósłby tokenu do trasy chronionej autoryzacją
 * (kontrakt §2, H14 „Pobranie podpisanym wygasającym linkiem").
 *
 * Token dostaje wyłącznie adres tego samego API ({@link adresTegoSamegoApi});
 * każdy inny adres kończy się wyjątkiem {@link NieprawidlowyAdresPliku} bez
 * odczytu tokenu i bez żądania.
 */
export async function downloadFile(url: string, filename: string): Promise<void> {
  if (!adresTegoSamegoApi(url)) {
    throw new NieprawidlowyAdresPliku();
  }

  const headers = new Headers();
  const token = await getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(url, { headers });

  if (!res.ok) {
    let body: { error?: Partial<ApiErrorBody> } | null = null;
    try {
      body = await res.json();
    } catch {
      // brak JSON-a w odpowiedzi błędu
    }
    throw new ApiError({
      status: body?.error?.status ?? res.status,
      code: body?.error?.code ?? "unknown_error",
      message: body?.error?.message ?? "Nie udało się pobrać pliku.",
    });
  }

  const blob = await res.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
}
