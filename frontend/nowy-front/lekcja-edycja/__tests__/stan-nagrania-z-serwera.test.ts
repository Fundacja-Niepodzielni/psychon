import { describe, expect, it } from "vitest";
import type { LekcjaAdmin, StanNagrania } from "../dane";
import {
  ODSTEP_PYTAN_O_STAN_MS,
  ZDANIE_BLEDU_PRZETWARZANIA,
  czasDoPytaniaOStan,
  nagranieZSerwera,
  poWyslaniuCalegoPliku,
  stanKartyZSerwera,
  stanLekcji,
  type NagranieZSerwera,
  type StanKartyNagrania,
} from "../nagranie";

/**
 * Stan nagrania czytany z pól serwera (`video_status`, `video_ready`,
 * `video_pending`): każdy stan słownika, wymiana (dotychczasowe gra, nowe w
 * drodze albo z błędem), stan nieustalony i odpowiedź bez pól. Do tego: kiedy
 * strona pyta o stan ponownie i co mówi karta „Stan lekcji”.
 */

const PODGLAD = "https://podglad.atrapa.test/osadzenie";

function odpowiedz(reszta: Partial<Extract<StanNagrania, { status: "processing" | "finished" | "error" }>>): StanNagrania {
  return { status: "finished", duration_seconds: 1500, preview_embed_url: PODGLAD, ...reszta };
}

describe("stan karty z pól serwera", () => {
  it("brak nagrania: `none`", () => {
    const stan: StanNagrania = { status: "no_video", video_status: "none", video_status_at: null, video_ready: false, video_pending: false };
    expect(nagranieZSerwera(stan)).toEqual({ karta: { rodzaj: "brak" }, serwerZnaStan: true, wDrodze: false });
  });

  it("plik w drodze do dostawcy, lekcja nie ma gotowego: `uploading`", () => {
    const stan = odpowiedz({ status: "processing", video_status: "uploading", video_ready: false, video_pending: true });
    expect(nagranieZSerwera(stan)).toEqual({ karta: { rodzaj: "wysylane" }, serwerZnaStan: true, wDrodze: true });
  });

  it("przetwarzanie, lekcja nie ma gotowego: `processing`", () => {
    const stan = odpowiedz({ status: "processing", video_status: "processing", video_ready: false, video_pending: true });
    expect(nagranieZSerwera(stan)).toEqual({ karta: { rodzaj: "przetwarzanie" }, serwerZnaStan: true, wDrodze: true });
  });

  it("gotowe: `ready` — czas trwania i podgląd z odpowiedzi", () => {
    const stan = odpowiedz({ video_status: "ready", video_ready: true, video_pending: false });
    expect(nagranieZSerwera(stan)).toEqual({
      karta: { rodzaj: "gotowe", czasSekundy: 1500, podglad: PODGLAD },
      serwerZnaStan: true,
      wDrodze: false,
    });
  });

  it("błąd, lekcja nie ma gotowego: `error`", () => {
    const stan = odpowiedz({ status: "error", video_status: "error", video_ready: false, video_pending: false });
    expect(nagranieZSerwera(stan)).toEqual({
      karta: { rodzaj: "blad", zdanie: ZDANIE_BLEDU_PRZETWARZANIA },
      serwerZnaStan: true,
      wDrodze: false,
    });
  });

  it("stan nieustalony (`null`) jest jak gotowe i nie wymaga pytań o stan", () => {
    const stan = odpowiedz({ status: "processing", video_status: null, video_ready: true, video_pending: false });
    expect(nagranieZSerwera(stan)).toEqual({
      karta: { rodzaj: "gotowe", czasSekundy: 1500, podglad: PODGLAD },
      serwerZnaStan: true,
      wDrodze: false,
    });
  });
});

describe("wymiana nagrania: dotychczasowe gra", () => {
  it.each([
    ["uploading", "wysylanie", true],
    ["processing", "przetwarzanie", true],
    ["error", "blad", false],
  ] as const)("nowe nagranie `%s` obok gotowego → gotowe z dopiskiem „%s”", (kod, nowe, wDrodze) => {
    const stan = odpowiedz({ status: "processing", video_status: kod, video_ready: true, video_pending: kod !== "error" });
    expect(nagranieZSerwera(stan)).toEqual({
      karta: { rodzaj: "gotowe", czasSekundy: 1500, podglad: PODGLAD, nowe },
      serwerZnaStan: true,
      wDrodze,
    });
  });

  it("błąd nowego nagrania nie odbiera dotychczasowego: karta nie jest w stanie błędu", () => {
    const stan = odpowiedz({ status: "error", video_status: "error", video_ready: true, video_pending: true });
    expect(stanKartyZSerwera(stan).rodzaj).toBe("gotowe");
  });
});

describe("odpowiedź bez pól stanu — zachowanie dotychczasowe", () => {
  it.each<[string, StanNagrania | null, StanKartyNagrania]>([
    ["brak odpowiedzi", null, { rodzaj: "nieznany" }],
    ["brak nagrania", { status: "no_video" }, { rodzaj: "brak" }],
    ["przetwarzanie", { status: "processing", duration_seconds: 0, preview_embed_url: PODGLAD }, { rodzaj: "przetwarzanie" }],
    ["gotowe", { status: "finished", duration_seconds: 125, preview_embed_url: PODGLAD }, { rodzaj: "gotowe", czasSekundy: 125 }],
    ["błąd", { status: "error", duration_seconds: 0, preview_embed_url: PODGLAD }, { rodzaj: "blad", zdanie: ZDANIE_BLEDU_PRZETWARZANIA }],
  ])("%s: ten sam stan karty co dotąd, bez pytań o stan i bez obietnicy zachowania nagrania", (_nazwa, stan, karta) => {
    expect(nagranieZSerwera(stan)).toEqual({ karta, serwerZnaStan: false, wDrodze: false });
  });
});

describe("trasa stanu nie odpowiedziała: stan z pól zasobu lekcji", () => {
  const lekcja = (pola: Pick<LekcjaAdmin, "video_status" | "video_ready">) => ({ duration_seconds: 900, ...pola });

  it("lekcja niesie pola: przetwarzanie obok gotowego", () => {
    expect(nagranieZSerwera(null, lekcja({ video_status: "processing", video_ready: true }))).toEqual({
      karta: { rodzaj: "gotowe", czasSekundy: 900, podglad: null, nowe: "przetwarzanie" },
      serwerZnaStan: true,
      wDrodze: true,
    });
  });

  it("lekcja niesie stan nieustalony: jak gotowe", () => {
    expect(nagranieZSerwera(null, lekcja({ video_status: null, video_ready: true })).karta.rodzaj).toBe("gotowe");
  });

  it("lekcja bez pól: stan nieznany, jak dotąd", () => {
    expect(nagranieZSerwera(null, lekcja({}))).toEqual({ karta: { rodzaj: "nieznany" }, serwerZnaStan: false, wDrodze: false });
  });
});

describe("cały plik u dostawcy, a trasa stanu jeszcze nie widzi nagrania", () => {
  it("serwer zna stan i lekcja ma gotowe nagranie: dotychczasowe zostaje, nowe się przetwarza", () => {
    const przed: NagranieZSerwera = { karta: { rodzaj: "gotowe", czasSekundy: 60 }, serwerZnaStan: true, wDrodze: false };
    expect(poWyslaniuCalegoPliku(przed)).toEqual({
      karta: { rodzaj: "gotowe", czasSekundy: 60, nowe: "przetwarzanie" },
      serwerZnaStan: true,
      wDrodze: true,
    });
  });

  it("serwer bez pól stanu: przetwarzanie, bez pytań o stan", () => {
    const przed: NagranieZSerwera = { karta: { rodzaj: "gotowe", czasSekundy: 60 }, serwerZnaStan: false, wDrodze: false };
    expect(poWyslaniuCalegoPliku(przed)).toEqual({ karta: { rodzaj: "przetwarzanie" }, serwerZnaStan: false, wDrodze: false });
  });
});

describe("odstęp między pytaniami o stan", () => {
  it("odstęp to 30 sekund", () => {
    expect(ODSTEP_PYTAN_O_STAN_MS).toBe(30_000);
  });

  it("do kolejnego pytania zostaje reszta odstępu; po odstępie — zero, nigdy mniej", () => {
    expect(czasDoPytaniaOStan(1_000, 1_000)).toBe(30_000);
    expect(czasDoPytaniaOStan(1_000, 11_000)).toBe(20_000);
    expect(czasDoPytaniaOStan(1_000, 31_000)).toBe(0);
    expect(czasDoPytaniaOStan(1_000, 90_000)).toBe(0);
  });
});

describe("karta „Stan lekcji” ze stanem z serwera", () => {
  const zapisana = { title: "Tytuł", description: "", content: "Treść", duration_seconds: 600 };

  it("plik wysyłany skądinąd: czekamy na nagranie, bez procentu", () => {
    expect(stanLekcji(zapisana, 0, { rodzaj: "wysylane" }).czekamy).toEqual(["nagranie się wysyła"]);
  });

  it("wymiana: nagranie jest gotowe, a nowe czeka albo wymaga uwagi", () => {
    const gotowe = { rodzaj: "gotowe", czasSekundy: 60 } as const;
    const wysylane = stanLekcji(zapisana, 0, { ...gotowe, nowe: "wysylanie" });
    expect(wysylane.gotowe).toContain("nagranie");
    expect(wysylane.czekamy).toEqual(["nowe nagranie się wysyła"]);

    const przetwarzane = stanLekcji(zapisana, 0, { ...gotowe, nowe: "przetwarzanie" });
    expect(przetwarzane.gotowe).toContain("nagranie");
    expect(przetwarzane.czekamy).toEqual(["nowe nagranie się przetwarza"]);

    const zBledem = stanLekcji(zapisana, 0, { ...gotowe, nowe: "blad" });
    expect(zBledem.gotowe).toContain("nagranie");
    expect(zBledem.czekamy).toEqual([]);
    expect(zBledem.uwaga).toEqual(["nowe nagranie trzeba wysłać ponownie"]);
  });

  it("wysyłanie stąd przy grającym dotychczasowym: nagranie zostaje w gotowych", () => {
    const wysylanie: StanKartyNagrania = { rodzaj: "wysylanie", nazwa: "a.mp4", rozmiar: 100, wyslano: 62, zostaloSekund: null };
    const stan = stanLekcji(zapisana, 0, wysylanie, true);
    expect(stan.gotowe).toContain("nagranie");
    expect(stan.czekamy).toEqual([`nowe nagranie się wysyła (62${String.fromCharCode(160)}%)`]);

    const przerwane: StanKartyNagrania = { rodzaj: "przerwane", nazwa: "a.mp4", rozmiar: 100, wyslano: 62, innyPlik: false };
    const poPrzerwaniu = stanLekcji(zapisana, 0, przerwane, true);
    expect(poPrzerwaniu.gotowe).toContain("nagranie");
    expect(poPrzerwaniu.uwaga).toEqual(["wysyłanie nowego nagrania przerwane"]);
  });

  it("wysyłanie stąd bez dotychczasowego nagrania: jak dotąd", () => {
    const wysylanie: StanKartyNagrania = { rodzaj: "wysylanie", nazwa: "a.mp4", rozmiar: 100, wyslano: 62, zostaloSekund: null };
    const stan = stanLekcji(zapisana, 0, wysylanie);
    expect(stan.gotowe).not.toContain("nagranie");
    expect(stan.czekamy).toEqual([`nagranie się wysyła (62${String.fromCharCode(160)}%)`]);
  });
});
