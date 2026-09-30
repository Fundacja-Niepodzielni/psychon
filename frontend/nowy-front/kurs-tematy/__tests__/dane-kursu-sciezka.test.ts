import { afterEach, describe, expect, it, vi } from "vitest";
import { pobierzDaneKursu } from "@/nowy-front/kurs-publikacja/dane";

/**
 * Trasa `/nowy-front/kurs/[id]` czyta kurs tą samą ścieżką API co przed
 * montażem ekranu A-12: `pobierzDaneKursu` z `nowy-front/kurs-publikacja/dane.ts`,
 * dwa żądania GET tras prowadzącego (`backend/routes/api/h08.php` w. 81 i 84).
 * Atrapa na `fetch` — próba czyta prawdziwy adres i metodę.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pobierzDaneKursu — ścieżka i metoda żądań", () => {
  it("GET /instructor/courses/{id} i GET /instructor/courses/{id}/lessons, nic więcej", async () => {
    const fetchMock = vi.fn(async (...argumenty: [RequestInfo | URL, RequestInit?]) => ({
      ok: true,
      status: 200,
      json: async () =>
        String(argumenty[0]).endsWith("/lessons")
          ? { data: [] }
          : { data: { id: 4, title: "Kurs", description: null, lessons_count: 0, materials_count: 0 } },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const wynik = await pobierzDaneKursu("4", "token-test");

    expect(wynik.status).toBe("pusty");
    const wolania = fetchMock.mock.calls.map(([adres, init]) => ({
      sciezka: new URL(String(adres)).pathname,
      metoda: init?.method ?? "GET",
    }));
    expect(wolania).toEqual([
      { sciezka: "/api/v1/instructor/courses/4", metoda: "GET" },
      { sciezka: "/api/v1/instructor/courses/4/lessons", metoda: "GET" },
    ]);
  });
});
