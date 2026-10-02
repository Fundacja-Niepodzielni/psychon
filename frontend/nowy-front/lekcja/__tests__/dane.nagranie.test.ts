import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Stan nagrania lekcji z punktu widzenia uczestnika: pięć wartości
 * `video_status`, dwa kody odmowy linku, 503 i inne błędy linku oraz zasób
 * lekcji bez pola `video_status` (zachowanie dotychczasowe). Żadnych żądań poza
 * atrapą `api`: dostawca nagrań nie jest pytany.
 */

const apiMock = vi.fn();

vi.mock("@/lib/api/klient", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api/klient")>();
  return { ...original, api: (...args: unknown[]) => apiMock(...args) };
});

const { ApiError } = await import("@/lib/api/klient");
const { pobierzDaneLekcji } = await import("../dane");

const LEKCJA = {
  id: 21,
  title: "Wprowadzenie do wywiadu",
  description: "Opis lekcji",
  content: null,
  topic: null,
  duration_seconds: 1800,
  position_seconds: 0,
  watched_seconds: 0,
  active_seconds: 0,
  is_completed: false,
  completable: false,
  completable_at_percent: 60,
};

const LINK = { url: "https://nagrania.atrapa.test/lista.m3u8", expires_at: 1, video_id: "wideo-21" };

function odmowa(code: string, status = 404) {
  return new ApiError({ status, code, message: "Odmowa." });
}

function sciezki(): string[] {
  return apiMock.mock.calls.map(([sciezka]) => String(sciezka));
}

beforeEach(() => {
  apiMock.mockReset();
});

describe("video_status z zasobu lekcji rozstrzyga widok", () => {
  it("`ready` i link wydany → odtwarzacz ze źródłem nagrania", async () => {
    const dane = { ...LEKCJA, video_status: "ready" as const };
    apiMock.mockResolvedValueOnce(dane).mockResolvedValueOnce(LINK);
    expect(await pobierzDaneLekcji("21")).toEqual({
      status: "ok",
      dane,
      bezNagrania: false,
      zrodloNagrania: { adres: LINK.url },
    });
    expect(sciezki()).toEqual(["/lessons/21", "/lessons/21/video-link"]);
  });

  it("link niesie adres osadzenia i czas jego wygaśnięcia: źródło je przekazuje", async () => {
    const dane = { ...LEKCJA, video_status: "ready" as const };
    apiMock
      .mockResolvedValueOnce(dane)
      .mockResolvedValueOnce({ ...LINK, embed_url: "https://ramka.atrapa.test/osadz/1", embed_expires_at: 1790000000 });
    const wynik = await pobierzDaneLekcji("21");
    expect(wynik).toMatchObject({
      status: "ok",
      bezNagrania: false,
      zrodloNagrania: { adres: LINK.url, adresOsadzenia: "https://ramka.atrapa.test/osadz/1", osadzenieWygasaO: 1790000000 },
    });
  });

  it.each(["uploading", "processing"] as const)("`%s` → nagranie w przygotowaniu, bez pytania o link", async (kod) => {
    const dane = { ...LEKCJA, video_status: kod };
    apiMock.mockResolvedValueOnce(dane);
    expect(await pobierzDaneLekcji("21")).toEqual({ status: "ok", dane, bezNagrania: true, nagranie: "w-przygotowaniu" });
    expect(sciezki()).toEqual(["/lessons/21"]);
  });

  it("`error` → nagranie nie działa (nie „w przygotowaniu”), bez pytania o link", async () => {
    const dane = { ...LEKCJA, video_status: "error" as const };
    apiMock.mockResolvedValueOnce(dane);
    expect(await pobierzDaneLekcji("21")).toEqual({ status: "ok", dane, bezNagrania: true, nagranie: "nie-dziala" });
    expect(sciezki()).toEqual(["/lessons/21"]);
  });

  it("`none` → lekcja bez nagrania, bez pytania o link", async () => {
    const dane = { ...LEKCJA, video_status: "none" as const };
    apiMock.mockResolvedValueOnce(dane);
    const wynik = await pobierzDaneLekcji("21");
    expect(wynik).toEqual({ status: "ok", dane, bezNagrania: true });
    expect(wynik).not.toHaveProperty("nagranie");
    expect(sciezki()).toEqual(["/lessons/21"]);
  });
});

describe("odmowa linku do nagrania", () => {
  const dane = { ...LEKCJA, video_status: "ready" as const };

  it("404 `video_not_ready` → nagranie w przygotowaniu, nie brak nagrania", async () => {
    apiMock.mockResolvedValueOnce(dane).mockRejectedValueOnce(odmowa("video_not_ready"));
    expect(await pobierzDaneLekcji("21")).toEqual({ status: "ok", dane, bezNagrania: true, nagranie: "w-przygotowaniu" });
  });

  it("404 `video_missing` → brak nagrania", async () => {
    apiMock.mockResolvedValueOnce(dane).mockRejectedValueOnce(odmowa("video_missing"));
    const wynik = await pobierzDaneLekcji("21");
    expect(wynik).toEqual({ status: "ok", dane, bezNagrania: true });
    expect(wynik).not.toHaveProperty("nagranie");
  });

  it("503 `video_not_configured` → nagranie nie działa, nigdy „brak nagrania”", async () => {
    apiMock.mockResolvedValueOnce(dane).mockRejectedValueOnce(odmowa("video_not_configured", 503));
    expect(await pobierzDaneLekcji("21")).toEqual({ status: "ok", dane, bezNagrania: true, nagranie: "nie-dziala" });
  });

  it.each([
    ["błąd serwera", odmowa("server_error", 500)],
    ["błąd sieci", new TypeError("Failed to fetch")],
    ["inny kod 404", odmowa("not_found")],
  ])("%s → nagranie nie działa, nie cichy brak nagrania", async (_nazwa, blad) => {
    apiMock.mockResolvedValueOnce(dane).mockRejectedValueOnce(blad);
    expect(await pobierzDaneLekcji("21")).toEqual({ status: "ok", dane, bezNagrania: true, nagranie: "nie-dziala" });
  });
});

describe("zasób lekcji bez pola video_status — zachowanie dotychczasowe", () => {
  it("link wydany → odtwarzacz", async () => {
    apiMock.mockResolvedValueOnce(LEKCJA).mockResolvedValueOnce(LINK);
    expect(await pobierzDaneLekcji("21")).toEqual({
      status: "ok",
      dane: LEKCJA,
      bezNagrania: false,
      zrodloNagrania: { adres: LINK.url },
    });
  });

  it.each([
    ["404 `video_missing`", odmowa("video_missing")],
    ["błąd serwera", odmowa("server_error", 500)],
    ["błąd sieci", new TypeError("Failed to fetch")],
  ])("%s → lekcja bez nagrania, treść nie jest blokowana", async (_nazwa, blad) => {
    apiMock.mockResolvedValueOnce(LEKCJA).mockRejectedValueOnce(blad);
    const wynik = await pobierzDaneLekcji("21");
    expect(wynik).toEqual({ status: "ok", dane: LEKCJA, bezNagrania: true });
    expect(wynik).not.toHaveProperty("nagranie");
  });

  it("503 → nagranie nie działa nawet bez pola video_status", async () => {
    apiMock.mockResolvedValueOnce(LEKCJA).mockRejectedValueOnce(odmowa("video_not_configured", 503));
    expect(await pobierzDaneLekcji("21")).toEqual({ status: "ok", dane: LEKCJA, bezNagrania: true, nagranie: "nie-dziala" });
  });

  it("404 `video_not_ready` → nagranie w przygotowaniu", async () => {
    apiMock.mockResolvedValueOnce(LEKCJA).mockRejectedValueOnce(odmowa("video_not_ready"));
    expect(await pobierzDaneLekcji("21")).toEqual({ status: "ok", dane: LEKCJA, bezNagrania: true, nagranie: "w-przygotowaniu" });
  });
});
