import { vi } from "vitest";

/**
 * Atrapa dostawcy nagrań mówiąca protokołem TUS: zakłada wgranie, odpowiada,
 * ile bajtów już ma, i przyjmuje kawałki. Żadne żądanie nie wychodzi z próby.
 * Dostawca przyjmuje z każdego kawałka najwyżej `bajtowNaKawalek` bajtów, więc
 * mały plik idzie kilkoma żądaniami i da się go przerwać w połowie.
 */

export const ADRES_DOSTAWCY = "https://nagrania.atrapa.test/tusupload";

export interface ZadanieDostawcy {
  metoda: string;
  adres: string;
  naglowki: Record<string, string>;
  /** Ile bajtów niosło ciało żądania. */
  bajty: number;
}

interface OpcjeDostawcy {
  bajtowNaKawalek?: number;
  /** Po tylu przyjętych kawałkach następny kończy się błędem sieci; `null` = bez przerwania. */
  przerwijPo?: number | null;
  /** Dostawca nie zna wgrania spod zapamiętanego adresu (odpowiada 404 na pytanie o postęp). */
  nieZnaWgrania?: boolean;
}

export function atrapaDostawcy(opcje: OpcjeDostawcy = {}) {
  const dostawca = {
    zadania: [] as ZadanieDostawcy[],
    /** Ile bajtów dostawca ma pod bieżącym adresem wgrania. */
    przyjete: 0,
    bajtowNaKawalek: opcje.bajtowNaKawalek ?? 3,
    przerwijPo: opcje.przerwijPo ?? null,
    nieZnaWgrania: opcje.nieZnaWgrania ?? false,
    wgran: 0,
    metody(): string[] {
      return dostawca.zadania.map((zadanie) => zadanie.metoda);
    },
    /** Bajty wysłane w żądaniach od podanego miejsca na liście żądań. */
    bajtyOd(indeks: number): number {
      return dostawca.zadania.slice(indeks).reduce((suma, zadanie) => suma + zadanie.bajty, 0);
    },
  };
  let kawalki = 0;

  const atrapa = vi.fn(async (adres: string, zadanie: { method: string; headers: Record<string, string>; body?: Blob; signal?: AbortSignal }) => {
    if (zadanie.signal?.aborted) throw new DOMException("Przerwano", "AbortError");
    dostawca.zadania.push({ metoda: zadanie.method, adres, naglowki: zadanie.headers, bajty: zadanie.body?.size ?? 0 });

    if (zadanie.method === "POST") {
      dostawca.wgran += 1;
      dostawca.przyjete = 0;
      return new Response(null, { status: 201, headers: { Location: `/tusupload/${dostawca.wgran}` } });
    }
    if (zadanie.method === "HEAD") {
      if (dostawca.nieZnaWgrania) return new Response(null, { status: 404 });
      return new Response(null, { status: 200, headers: { "Upload-Offset": String(dostawca.przyjete) } });
    }
    if (dostawca.przerwijPo !== null && kawalki >= dostawca.przerwijPo) {
      throw new TypeError("Sieć niedostępna");
    }
    kawalki += 1;
    dostawca.przyjete = Number(zadanie.headers["Upload-Offset"]) + Math.min(zadanie.body?.size ?? 0, dostawca.bajtowNaKawalek);
    return new Response(null, { status: 204, headers: { "Upload-Offset": String(dostawca.przyjete) } });
  });
  vi.stubGlobal("fetch", atrapa);
  return dostawca;
}

/** Pamięć przeglądarki w próbie: zwykła mapa za interfejsem `Storage`. */
export function pamiecProbna(): Storage {
  const dane = new Map<string, string>();
  return {
    get length() {
      return dane.size;
    },
    clear: () => dane.clear(),
    getItem: (klucz) => dane.get(klucz) ?? null,
    key: (indeks) => [...dane.keys()][indeks] ?? null,
    removeItem: (klucz) => void dane.delete(klucz),
    setItem: (klucz, wartosc) => void dane.set(klucz, String(wartosc)),
  };
}
