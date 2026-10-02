import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Nowy link nagrania po wygaśnięciu adresu osadzenia: jedyna droga odtwarzacza do zaplecza.
 * Zawsze dokładnie jedno żądanie `GET /lessons/{id}/video-link`, każda odmowa to `null`
 * (bez wyjątku i bez ponawiania), a odczyt lekcji z nieskonfigurowanym dostawcą pyta o link raz.
 */

const apiMock = vi.fn();

vi.mock("@/lib/api/klient", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api/klient")>();
  return { ...original, api: (...args: unknown[]) => apiMock(...args) };
});

const { ApiError } = await import("@/lib/api/klient");
const { odswiezLinkNagrania, pobierzDaneLekcji } = await import("../dane");

const LINK = {
  url: "https://nagrania.atrapa.test/lista.m3u8",
  embed_url: "https://odtwarzacz.atrapa.test/embed/1/lekcja-21?token=nowy",
  embed_expires_at: 1790000000,
};

const LEKCJA = {
  id: 21,
  title: "Wprowadzenie do wywiadu",
  description: null,
  content: null,
  topic: null,
  duration_seconds: 1800,
  position_seconds: 0,
  watched_seconds: 0,
  active_seconds: 0,
  is_completed: false,
  completable: false,
  completable_at_percent: 60,
  video_status: "ready" as const,
};

function sciezki(): string[] {
  return apiMock.mock.calls.map(([sciezka]) => String(sciezka));
}

beforeEach(() => {
  apiMock.mockReset();
});

describe("odswiezLinkNagrania", () => {
  it("udany odczyt: źródło z adresem osadzenia i czasem wygaśnięcia, jedno żądanie", async () => {
    apiMock.mockResolvedValueOnce(LINK);

    expect(await odswiezLinkNagrania("21")).toEqual({
      adres: LINK.url,
      adresOsadzenia: LINK.embed_url,
      osadzenieWygasaO: LINK.embed_expires_at,
    });
    expect(sciezki()).toEqual(["/lessons/21/video-link"]);
  });

  it.each([
    ["404 video_not_ready (w przygotowaniu)", new ApiError({ status: 404, code: "video_not_ready", message: "Nagranie w przygotowaniu." })],
    ["404 video_missing (brak nagrania)", new ApiError({ status: 404, code: "video_missing", message: "Brak nagrania." })],
    ["503 video_not_configured (dostawca nieskonfigurowany)", new ApiError({ status: 503, code: "video_not_configured", message: "Nie skonfigurowano." })],
    ["403 lesson_locked (lekcja zamknięta)", new ApiError({ status: 403, code: "lesson_locked", message: "Zamknięta." })],
    ["błąd sieci", new TypeError("Failed to fetch")],
  ])("%s: wynik null, bez wyjątku i bez drugiego żądania", async (_nazwa, blad) => {
    apiMock.mockRejectedValue(blad);

    await expect(odswiezLinkNagrania("21")).resolves.toBeNull();
    expect(apiMock).toHaveBeenCalledTimes(1);
  });
});

describe("dostawca nieskonfigurowany przy odczycie lekcji", () => {
  it("503 video_not_configured: nagranie nie działa, jedno żądanie o link i brak ponawiania", async () => {
    apiMock
      .mockResolvedValueOnce(LEKCJA)
      .mockRejectedValue(new ApiError({ status: 503, code: "video_not_configured", message: "Nie skonfigurowano." }));

    expect(await pobierzDaneLekcji("21")).toMatchObject({ status: "ok", bezNagrania: true, nagranie: "nie-dziala" });
    expect(sciezki()).toEqual(["/lessons/21", "/lessons/21/video-link"]);
  });

  it("lekcja zamknięta kolejnością przy odczycie lekcji: żadnego żądania o link", async () => {
    apiMock.mockRejectedValueOnce(
      new ApiError({ status: 403, code: "lesson_locked", message: "Zamknięta.", reason: { required_lesson_id: 20 } }),
    );

    expect(await pobierzDaneLekcji("21")).toMatchObject({ status: "lekcja-zamknieta" });
    expect(sciezki()).toEqual(["/lessons/21"]);
  });
});
