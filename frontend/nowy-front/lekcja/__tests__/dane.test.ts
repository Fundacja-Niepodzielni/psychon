import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const apiMock = vi.fn();

vi.mock("@/lib/api/klient", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api/klient")>();
  return { ...original, api: (...args: unknown[]) => apiMock(...args) };
});

const { ApiError } = await import("@/lib/api/klient");
const { pobierzDaneLekcji, procentAktywnegoCzasu, ukonczLekcje } = await import("../dane");

const LEKCJA_SUROWA = {
  id: 21,
  title: "Wprowadzenie do wywiadu",
  description: "Opis lekcji",
  content: null,
  topic: null,
  duration_seconds: 1800,
  position_seconds: 0,
  watched_seconds: 812,
  active_seconds: 700,
  is_completed: false,
  completable: false,
  completable_at_percent: 60,
};

beforeEach(() => {
  apiMock.mockReset();
});

describe("pobierzDaneLekcji", () => {
  it("dane lekcji + nagranie osiągalne → status ok, bezNagrania: false", async () => {
    apiMock.mockResolvedValueOnce(LEKCJA_SUROWA).mockResolvedValueOnce({
      url: "https://cdn.example/playlist.m3u8",
      expires_at: 1,
      video_id: "abc",
    });

    const wynik = await pobierzDaneLekcji("21");

    expect(wynik).toEqual({ status: "ok", dane: LEKCJA_SUROWA, bezNagrania: false });
  });

  it("nagranie 404 video_missing → status ok, bezNagrania: true (kontrola dodatnia: sam błąd nie blokuje treści)", async () => {
    apiMock
      .mockResolvedValueOnce(LEKCJA_SUROWA)
      .mockRejectedValueOnce(new ApiError({ status: 404, code: "video_missing", message: "Brak nagrania." }));

    const wynik = await pobierzDaneLekcji("21");

    expect(wynik).toEqual({ status: "ok", dane: LEKCJA_SUROWA, bezNagrania: true });
  });

  it("403 course_locked → status zablokowany z treścią message koperty", async () => {
    apiMock.mockRejectedValueOnce(
      new ApiError({ status: 403, code: "course_locked", message: "Ukończ najpierw etap 2." }),
    );

    const wynik = await pobierzDaneLekcji("21");

    expect(wynik).toEqual({ status: "zablokowany", komunikat: "Ukończ najpierw etap 2." });
  });

  it("404 not_found → status nie-znaleziono", async () => {
    apiMock.mockRejectedValueOnce(new ApiError({ status: 404, code: "not_found", message: "Nie znaleziono." }));

    const wynik = await pobierzDaneLekcji("21");

    expect(wynik).toEqual({ status: "nie-znaleziono" });
  });

  it("błąd sieci (wyjątek spoza ApiError) → status blad", async () => {
    apiMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const wynik = await pobierzDaneLekcji("21");

    expect(wynik).toEqual({ status: "blad" });
  });
});

describe("procentAktywnegoCzasu", () => {
  it("liczy zaokrąglony procent obciętym do 100", () => {
    expect(procentAktywnegoCzasu({ active_seconds: 700, duration_seconds: 1800 })).toBe(39);
    expect(procentAktywnegoCzasu({ active_seconds: 1800, duration_seconds: 1800 })).toBe(100);
    expect(procentAktywnegoCzasu({ active_seconds: 5000, duration_seconds: 1800 })).toBe(100);
  });

  it("lekcja z duration_seconds = 0 nigdy nie liczy procentu z dzielenia przez zero", () => {
    expect(procentAktywnegoCzasu({ active_seconds: 0, duration_seconds: 0 })).toBe(0);
  });
});

describe("ukonczLekcje", () => {
  it("200 → status ok z completed_at z odpowiedzi", async () => {
    apiMock.mockResolvedValueOnce({ is_completed: true, completed_at: "2026-10-03T12:30:00Z" });

    const wynik = await ukonczLekcje("21");

    expect(wynik).toEqual({ status: "ok", completed_at: "2026-10-03T12:30:00Z" });
  });

  it("422 not_enough_active_time → status za-malo-czasu", async () => {
    apiMock.mockRejectedValueOnce(
      new ApiError({ status: 422, code: "not_enough_active_time", message: "Obejrzyj więcej materiału." }),
    );

    const wynik = await ukonczLekcje("21");

    expect(wynik).toEqual({ status: "za-malo-czasu" });
  });

  it("inny błąd → status blad", async () => {
    apiMock.mockRejectedValueOnce(new ApiError({ status: 500, code: "server_error", message: "Błąd serwera." }));

    const wynik = await ukonczLekcje("21");

    expect(wynik).toEqual({ status: "blad" });
  });
});

/**
 * Positive control against the generated schema: this list is read straight
 * out of `openapi.json`, not retyped by hand. Removing a required key from
 * either side (the resource this module reads, or the document) turns the
 * assertion red — the two lists have to stay exactly equal, not merely
 * overlapping.
 */
describe("kształt zasobu lekcji zgodny z openapi.json", () => {
  it("klucze DaneLekcji = klucze wymagane w openapi.json dla GET /lessons/{id}", () => {
    const katalogTestu = dirname(fileURLToPath(import.meta.url));
    const sciezkaOpenapi = resolve(katalogTestu, "../../../../backend/openapi.json");
    const dokument = JSON.parse(readFileSync(sciezkaOpenapi, "utf-8")) as {
      paths: Record<string, { get?: { responses?: { "200"?: { content?: Record<string, unknown> } } } }>;
    };
    const schemat = dokument.paths["/v1/lessons/{id}"]?.get?.responses?.["200"]?.content?.[
      "application/json"
    ] as { schema: { properties: { data: { required: string[] } } } };
    const kluczeOpenapi = [...schemat.schema.properties.data.required].sort();

    const kluczeModulu = Object.keys(LEKCJA_SUROWA).sort();

    expect(kluczeModulu).toEqual(kluczeOpenapi);
  });
});
