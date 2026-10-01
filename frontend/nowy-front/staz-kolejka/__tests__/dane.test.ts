import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Moduł danych decyzji o dyżurach: adresy i ciała żądań trzech decyzji,
 * etykiety form z kontraktu, klasyfikacja błędów (daty formatuje wspólny
 * formater `wspolne/daty.ts`, nie ten moduł). Atrapy siedzą na
 * `api`/`apiPaged` klienta; `ApiError` zostaje prawdziwy.
 */

const api = vi.fn();
const apiPaged = vi.fn();
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));
vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return {
    ...oryginal,
    api: (...a: unknown[]) => api(...a),
    apiPaged: (...a: unknown[]) => apiPaged(...a),
  };
});

const { ApiError } = await import("@/lib/api/klient");
const dane = await import("../dane");

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
});

describe("etykiety", () => {
  it("formy dyżuru mają etykiety z kontraktu, nieznana forma to „inna”", () => {
    expect(dane.etykietaFormy("phone_duty")).toBe("dyżur telefoniczny");
    expect(dane.etykietaFormy("chat_duty")).toBe("czat");
    expect(dane.etykietaFormy("other")).toBe("inna");
    expect(dane.etykietaFormy("cos_innego")).toBe("inna");
  });
});

describe("zapiszDecyzje", () => {
  it("zatwierdzenie: POST na accept, bez ciała", async () => {
    api.mockResolvedValueOnce({});
    await dane.zapiszDecyzje("zatwierdz", 5, "ignorowany");
    expect(api).toHaveBeenCalledWith("/admin/internship/5/accept", { method: "POST" });
  });

  it("prośba o poprawkę: POST na return z przyciętym komentarzem", async () => {
    api.mockResolvedValueOnce({});
    await dane.zapiszDecyzje("odeslij", 5, "  Uzupełnij opis.  ");
    expect(api).toHaveBeenCalledWith("/admin/internship/5/return", { method: "POST", body: { comment: "Uzupełnij opis." } });
  });

  it("odrzucenie: POST na reject z komentarzem", async () => {
    api.mockResolvedValueOnce({});
    await dane.zapiszDecyzje("odrzuc", 6, "Brak dyżuru.");
    expect(api).toHaveBeenCalledWith("/admin/internship/6/reject", { method: "POST", body: { comment: "Brak dyżuru." } });
  });

  it("pusty komentarz nie jest sprawdzany w przeglądarce — trafia do serwera", async () => {
    api.mockResolvedValueOnce({});
    await dane.zapiszDecyzje("odeslij", 5, "   ");
    expect(api).toHaveBeenCalledWith("/admin/internship/5/return", { method: "POST", body: { comment: "" } });
  });
});

describe("klasyfikacja błędów", () => {
  const blad = (status: number, code: string, errors?: Record<string, string[]>) =>
    new ApiError({ status, code, message: "Komunikat serwera.", errors });

  it("422 z polami → błędy pól", () => {
    expect(dane.sklasyfikujBladDecyzji(blad(422, "validation_failed", { comment: ["x"] }))).toEqual({
      rodzaj: "pola",
      bledy: { comment: ["x"] },
    });
  });

  it("403 entry_locked → rozstrzygnięty, z komunikatem z koperty", () => {
    expect(dane.sklasyfikujBladDecyzji(blad(403, "entry_locked"))).toEqual({
      rodzaj: "rozstrzygniety",
      komunikat: "Komunikat serwera.",
    });
  });

  it("404 → brak wpisu; inny błąd API → komunikat serwera; nie-API → zdanie o sieci", () => {
    expect(dane.sklasyfikujBladDecyzji(blad(404, "not_found")).rodzaj).toBe("brak-wpisu");
    expect(dane.sklasyfikujBladDecyzji(blad(500, "unknown_error"))).toEqual({ rodzaj: "inny", komunikat: "Komunikat serwera." });
    expect(dane.sklasyfikujBladDecyzji(new TypeError("Failed to fetch")).rodzaj).toBe("inny");
  });

  it("odczyt: 401 i 403 to brak uprawnień, reszta nie", () => {
    expect(dane.czyBrakUprawnien(blad(401, "unauthenticated"))).toBe(true);
    expect(dane.czyBrakUprawnien(blad(403, "forbidden"))).toBe(true);
    expect(dane.czyBrakUprawnien(blad(500, "unknown_error"))).toBe(false);
    expect(dane.czyBrakUprawnien(new TypeError("x"))).toBe(false);
  });
});

describe("pobierzWpisyDoDecyzji", () => {
  it("woła trasę kolejki ze stroną i 25 na stronę, zwraca wpisy i meta", async () => {
    apiPaged.mockResolvedValueOnce({ data: [{ id: 1 }], meta: { current_page: 2, per_page: 25, total: 26, last_page: 2 } });
    const wynik = await dane.pobierzWpisyDoDecyzji(2);
    expect(apiPaged).toHaveBeenCalledWith("/admin/internship/pending?page=2&per_page=25");
    expect(wynik.wpisy).toHaveLength(1);
    expect(wynik.meta?.last_page).toBe(2);
  });
});
