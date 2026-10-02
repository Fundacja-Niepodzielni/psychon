import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Klient zaliczenia warsztatu (`lib/api/h10.ts`) — atrapa na poziomie `fetch`:
 * próba czyta adres, metodę i ciało, z którymi prawdziwy `api()` naprawdę woła.
 */

vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

function atrapaFetch(status: number, cialo: unknown) {
  const fetchMock = vi.fn(async (adres: RequestInfo | URL) => {
    if (String(adres).includes("/api/auth/session")) {
      return { ok: true, status: 200, json: async () => ({ accessToken: "token-test", expiresAt: Date.now() + 600_000 }) };
    }
    return { ok: status >= 200 && status < 300, status, json: async () => cialo };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("markWorkshopComplete", () => {
  it("woła POST /admin/workshop/{id}/complete bez ciała, dokładnie raz, i zwraca dane odpowiedzi", async () => {
    const fetchMock = atrapaFetch(200, {
      data: { user_id: 17, edition_id: 1, completed_at: "2026-10-02T12:00:00Z", workshop_done: true },
    });
    const { markWorkshopComplete } = await import("@/lib/api/h10");

    const wynik = await markWorkshopComplete(17);

    const wywolania = fetchMock.mock.calls.filter((w) => !String(w[0]).includes("/api/auth/session")) as unknown as [
      RequestInfo | URL,
      RequestInit | undefined,
    ][];
    expect(wywolania).toHaveLength(1);
    const [adres, init] = wywolania[0];
    expect(String(adres)).toMatch(/\/admin\/workshop\/17\/complete$/);
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeUndefined();
    expect(wynik).toMatchObject({ user_id: 17, workshop_done: true });
  });

  it("odmowa roli (403) wychodzi jako błąd klienta z kodem odpowiedzi", async () => {
    atrapaFetch(403, { error: { status: 403, code: "forbidden", message: "Brak dostępu." } });
    const { markWorkshopComplete } = await import("@/lib/api/h10");
    await expect(markWorkshopComplete(17)).rejects.toMatchObject({ status: 403, code: "forbidden" });
  });
});
