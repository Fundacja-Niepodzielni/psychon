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

/** Najdłuższa nazwa pobieranego pliku, jaką zostawiamy (znaki, nie bajty). */
const NAJDLUZSZA_NAZWA_PLIKU = 200;

function usunZnakiSterujace(napis: string): string {
  let wynik = "";
  for (const znak of napis) {
    const kod = znak.codePointAt(0) ?? 0;
    if (kod > 0x1f && kod !== 0x7f && !(kod >= 0x80 && kod <= 0x9f)) wynik += znak;
  }
  return wynik;
}

/** Zostawia ostatni człon ścieżki, bez znaków sterujących; pusty wynik albo same kropki — `null`. */
function bezpiecznaNazwa(surowa: string): string | null {
  const ostatni = usunZnakiSterujace(surowa).split(/[\\/]/).pop() ?? "";
  const nazwa = ostatni.trim().slice(0, NAJDLUZSZA_NAZWA_PLIKU);
  if (nazwa === "" || /^\.+$/.test(nazwa)) return null;
  return nazwa;
}

/**
 * Nazwa pobieranego pliku z nagłówka `Content-Disposition` odpowiedzi serwera.
 * Postać `filename*=` (RFC 5987, kodowanie procentowe) ma pierwszeństwo przed
 * `filename=`. Wynik nie niesie ukośników (zostaje ostatni człon ścieżki) ani
 * znaków sterujących. Gdy nagłówka brak, przeglądarka go nie udostępnia
 * (odpowiedź między domenami bez `Access-Control-Expose-Headers`) albo nie
 * zawiera użytecznej nazwy — zwraca `domyslna`.
 */
export function nazwaPlikuZNaglowka(naglowek: string | null | undefined, domyslna: string): string {
  if (!naglowek) return domyslna;

  const rozszerzona = /filename\*\s*=\s*([^;]*)/i.exec(naglowek);
  if (rozszerzona) {
    const wartosc = rozszerzona[1].trim().replace(/^[^']*'[^']*'/, "");
    try {
      const nazwa = bezpiecznaNazwa(decodeURIComponent(wartosc));
      if (nazwa) return nazwa;
    } catch {
      // niepoprawne kodowanie procentowe — próbujemy zwykłego `filename=`
    }
  }

  const zwykla = /(?:^|[;\s])filename\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^;]*))/i.exec(naglowek);
  if (zwykla) {
    const surowa = zwykla[1] !== undefined ? zwykla[1].replace(/\\(["\\])/g, "$1") : zwykla[2].trim();
    const nazwa = bezpiecznaNazwa(surowa);
    if (nazwa) return nazwa;
  }

  return domyslna;
}
