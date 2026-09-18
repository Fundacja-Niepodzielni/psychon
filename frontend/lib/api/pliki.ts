/**
 * Pobieranie plików chronionych autoryzacją (Bearer) — używane m.in. przy
 * eksportach CSV (H18, H20) i dokumentach z profilu (H14).
 */

import { ApiError, ApiErrorBody, getToken } from "./klient";

/**
 * Pobiera plik przez `fetch` z nagłówkiem Bearer i zapisuje go jako blob —
 * zwykły `<a href>` nie przeniósłby tokenu do trasy chronionej autoryzacją
 * (kontrakt §2, H14 „Pobranie podpisanym wygasającym linkiem").
 */
export async function downloadFile(url: string, filename: string): Promise<void> {
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
