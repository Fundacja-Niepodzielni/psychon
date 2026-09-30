import type { ZlecenieWgrania } from "./dane";

/**
 * Wgranie nagrania PROSTO do Bunny Stream protokołem TUS 1.0.0 — serwer
 * PsychON nie przyjmuje bajtów wideo, wydaje tylko podpisane pozwolenie
 * (`BunnyVideoAdminController::createUpload`, `backend/app/Http/Controllers/
 * Api/V1/Admin/BunnyVideoAdminController.php:47-112`). Bez nowej zależności:
 * dwa rodzaje żądań (utworzenie wgrania i wysyłka kawałków) wystarczą na
 * `fetch`.
 *
 * Nagłówki pozwolenia (`AuthorizationSignature`, `AuthorizationExpire`,
 * `VideoId`, `LibraryId`) idą na każdym żądaniu, tak jak w kliencie
 * `tus-js-client` opisanym w dokumentacji dostawcy.
 */

const WERSJA_TUS = "1.0.0";
const ROZMIAR_KAWALKA = 5 * 1024 * 1024;

export interface PostepWgrania {
  wyslano: number;
  razem: number;
}

function naBase64(tekst: string): string {
  const bajty = new TextEncoder().encode(tekst);
  let binarnie = "";
  for (const bajt of bajty) binarnie += String.fromCharCode(bajt);
  return btoa(binarnie);
}

function naglowkiPozwolenia(zlecenie: ZlecenieWgrania): Record<string, string> {
  return {
    "Tus-Resumable": WERSJA_TUS,
    AuthorizationSignature: zlecenie.signature,
    AuthorizationExpire: String(zlecenie.expiration_time),
    VideoId: zlecenie.video_id,
    LibraryId: zlecenie.library_id,
  };
}

/** Wgrywa `plik` i rzuca `Error` z polskim zdaniem, gdy dostawca odmówi. */
export async function wgrajNagranie(
  plik: File,
  zlecenie: ZlecenieWgrania,
  tytul: string,
  naPostep?: (postep: PostepWgrania) => void,
): Promise<void> {
  if (plik.size === 0) {
    throw new Error("Plik nagrania jest pusty.");
  }
  const podstawa = naglowkiPozwolenia(zlecenie);

  const utworzenie = await fetch(zlecenie.upload_url, {
    method: "POST",
    headers: {
      ...podstawa,
      "Upload-Length": String(plik.size),
      "Upload-Metadata": `filetype ${naBase64(plik.type)},title ${naBase64(tytul)}`,
    },
  });
  const adres = utworzenie.headers.get("Location");
  if (utworzenie.status !== 201 || !adres) {
    throw new Error("Nie udało się rozpocząć wgrywania nagrania.");
  }
  const adresWgrania = new URL(adres, zlecenie.upload_url).toString();

  let przesuniecie = 0;
  naPostep?.({ wyslano: 0, razem: plik.size });
  while (przesuniecie < plik.size) {
    const kawalek = plik.slice(przesuniecie, przesuniecie + ROZMIAR_KAWALKA);
    const odpowiedz = await fetch(adresWgrania, {
      method: "PATCH",
      headers: {
        ...podstawa,
        "Content-Type": "application/offset+octet-stream",
        "Upload-Offset": String(przesuniecie),
      },
      body: kawalek,
    });
    if (odpowiedz.status !== 204) {
      throw new Error("Wgrywanie nagrania zostało przerwane. Spróbuj ponownie.");
    }
    const potwierdzone = Number(odpowiedz.headers.get("Upload-Offset"));
    przesuniecie = Number.isFinite(potwierdzone) && potwierdzone > przesuniecie ? potwierdzone : przesuniecie + kawalek.size;
    naPostep?.({ wyslano: Math.min(przesuniecie, plik.size), razem: plik.size });
  }
}
