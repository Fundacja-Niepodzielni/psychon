import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Moduł danych ekranu „Kursy” (administracja): adresy, metody i ciała czterech
 * żądań. Atrapy siedzą na `api`/`apiPaged` klienta; `ApiError` zostaje prawdziwy.
 */

const api = vi.fn();
const apiPaged = vi.fn();
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));
vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: (...a: unknown[]) => api(...a),
  apiPaged: (...a: unknown[]) => apiPaged(...a),
}));
vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return {
    ...oryginal,
    api: (...a: unknown[]) => api(...a),
    apiPaged: (...a: unknown[]) => apiPaged(...a),
  };
});

const dane = await import("../dane");

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
});

describe("pobierzKursy", () => {
  it("czyta stronę z sortowaniem po pozycji w ścieżce i zwraca odpowiedź bez zmian", async () => {
    const odpowiedz = { data: [], meta: { current_page: 2, per_page: 100, total: 101, last_page: 2 } };
    apiPaged.mockResolvedValueOnce(odpowiedz);
    await expect(dane.pobierzKursy(2)).resolves.toBe(odpowiedz);
    expect(apiPaged).toHaveBeenCalledWith("/admin/courses?page=2&per_page=100&sort=sequence_order");
  });
});

describe("utworzKurs", () => {
  it("POST /admin/courses z ciałem formularza", async () => {
    api.mockResolvedValueOnce({ id: 9 });
    const cialo = {
      title: "Nowy",
      slug: "nowy",
      type: "course" as const,
      product_group: "psychon" as const,
      sequence_order: null,
      description: null,
    };
    await expect(dane.utworzKurs(cialo)).resolves.toEqual({ id: 9 });
    expect(api).toHaveBeenCalledWith("/admin/courses", { method: "POST", body: cialo });
  });
});

describe("kolejność ścieżki", () => {
  it("podgląd: POST na reorder/preview z listą identyfikatorów", async () => {
    api.mockResolvedValueOnce([]);
    await dane.podgladKolejnosci([3, 1, 2]);
    expect(api).toHaveBeenCalledWith("/admin/courses/reorder/preview", { method: "POST", body: { course_ids: [3, 1, 2] } });
  });

  it("zapis: PATCH na reorder z listą identyfikatorów", async () => {
    api.mockResolvedValueOnce([]);
    await dane.zapiszKolejnosc([3, 1, 2]);
    expect(api).toHaveBeenCalledWith("/admin/courses/reorder", { method: "PATCH", body: { course_ids: [3, 1, 2] } });
  });

  it("błąd transportu przechodzi do wołającego", async () => {
    api.mockRejectedValueOnce(new Error("sieć"));
    await expect(dane.zapiszKolejnosc([1])).rejects.toThrow("sieć");
  });
});
