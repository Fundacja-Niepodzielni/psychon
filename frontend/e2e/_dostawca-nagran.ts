import type { Page, Route } from "@playwright/test";

/**
 * Atrapa dostawcy nagrań mówiąca protokołem TUS: utworzenie wgrania, pytanie
 * o postęp i kawałki pliku. Żadne żądanie nie wychodzi poza przeglądarkę.
 */

export const DOSTAWCA = "https://nagrania.atrapa.test";
export const MB = 1024 * 1024;
/** Rozmiar kawałka, którym aplikacja wysyła plik. */
const KAWALEK = 5 * MB;

const NAGLOWKI = {
  "access-control-allow-origin": "*",
  "access-control-expose-headers": "Location, Upload-Offset",
};

export interface OpcjeDostawcy {
  /** Ile kawałków pliku dostawca przyjmuje, zanim zacznie się „potem”. */
  przyjeteKawalki?: number;
  /** Co dzieje się z kolejnym kawałkiem: zostaje bez odpowiedzi (wysyłanie „trwa”) albo kończy się błędem sieci. */
  potem?: "wisi" | "blad";
}

export interface KawalekDostawcy {
  /** Przesunięcie z nagłówka żądania. */
  od: number;
  /** Ile bajtów niesie kawałek: do końca pliku, najwyżej rozmiar kawałka. */
  bajty: number;
  przyjety: boolean;
}

export interface AtrapaDostawcy {
  /** Ile razy założono wgranie. */
  utworzone: number;
  /** Ile razy aplikacja zapytała, ile bajtów dostawca już ma. */
  pytaniaOPostep: number;
  kawalki: KawalekDostawcy[];
  /** Ile bajtów dostawca ma pod bieżącym adresem wgrania. */
  przyjete: number;
  /** Rozmiar pliku zgłoszony przy zakładaniu wgrania. */
  rozmiar: number;
  /** Od teraz dostawca przyjmuje wszystko; kawałki bez odpowiedzi dostają ją teraz. */
  przyjmujWszystko(): Promise<void>;
}

export async function instalujDostawce(page: Page, opcje: OpcjeDostawcy = {}): Promise<AtrapaDostawcy> {
  let limit = opcje.przyjeteKawalki ?? 0;
  let przyjeteKawalki = 0;
  const wiszace: { route: Route; koniec: number }[] = [];

  const dostawca: AtrapaDostawcy = {
    utworzone: 0,
    pytaniaOPostep: 0,
    kawalki: [],
    przyjete: 0,
    rozmiar: 0,
    async przyjmujWszystko() {
      limit = Number.POSITIVE_INFINITY;
      for (const { route, koniec } of wiszace.splice(0)) {
        dostawca.przyjete = koniec;
        await route.fulfill({ status: 204, headers: { ...NAGLOWKI, "Upload-Offset": String(koniec) } }).catch(() => undefined);
      }
    },
  };

  await page.route(`${DOSTAWCA}/**`, async (route) => {
    const zadanie = route.request();
    const metoda = zadanie.method();
    if (metoda === "POST") {
      dostawca.utworzone += 1;
      dostawca.przyjete = 0;
      dostawca.rozmiar = Number(zadanie.headers()["upload-length"] ?? 0);
      return route.fulfill({
        status: 201,
        headers: { ...NAGLOWKI, Location: `${DOSTAWCA}/tusupload/${dostawca.utworzone}` },
      });
    }
    if (metoda === "HEAD") {
      dostawca.pytaniaOPostep += 1;
      return route.fulfill({ status: 200, headers: { ...NAGLOWKI, "Upload-Offset": String(dostawca.przyjete) } });
    }
    if (metoda === "PATCH") {
      const od = Number(zadanie.headers()["upload-offset"] ?? 0);
      const bajty = Math.min(KAWALEK, dostawca.rozmiar - od);
      const koniec = od + bajty;
      if (przyjeteKawalki < limit) {
        przyjeteKawalki += 1;
        dostawca.przyjete = koniec;
        dostawca.kawalki.push({ od, bajty, przyjety: true });
        return route.fulfill({ status: 204, headers: { ...NAGLOWKI, "Upload-Offset": String(koniec) } });
      }
      dostawca.kawalki.push({ od, bajty, przyjety: false });
      if (opcje.potem === "blad") return route.abort("failed");
      // Bez odpowiedzi: żądanie wisi do przerwania przez osobę, do `przyjmujWszystko` albo do końca próby.
      wiszace.push({ route, koniec });
      return;
    }
    return route.fulfill({ status: 204, headers: NAGLOWKI });
  });

  return dostawca;
}
