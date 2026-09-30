import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.fn();
const apiPaged = vi.fn();

vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return {
    ...oryginal,
    api: (...a: unknown[]) => api(...a),
    apiPaged: (...a: unknown[]) => apiPaged(...a),
  };
});

const { ApiError } = await import("@/lib/api/klient");
const {
  PLAKIETKA_STATUSU,
  czyBrakUprawnien,
  czyPokazacCertyfikat,
  czyRolaMozeZglaszac,
  maOtwarteZgloszenie,
  sklasyfikujBladWysylki,
  wczytajStan,
} = await import("../dane");

function blad(status: number, code: string, message: string, errors?: Record<string, string[]>) {
  return new ApiError({ status, code, message, errors });
}

function zgloszenie(id: number, status: "new" | "answered" | "closed") {
  return {
    id,
    body: "Treść.",
    status,
    response: null,
    responded_at: null,
    created_at: "2026-09-20T10:00:00Z",
    updated_at: "2026-09-20T10:00:00Z",
  };
}

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
});

describe("statusy i role", () => {
  it("każdy status ma polską etykietę", () => {
    expect(PLAKIETKA_STATUSU.new.tekst).toBe("Nowe");
    expect(PLAKIETKA_STATUSU.answered.tekst).toBe("Z odpowiedzią");
    expect(PLAKIETKA_STATUSU.closed.tekst).toBe("Zamknięte");
  });

  it("prawo do zgłoszenia mają wolontariusz i student", () => {
    expect(czyRolaMozeZglaszac("volunteer")).toBe(true);
    expect(czyRolaMozeZglaszac("student")).toBe(true);
    for (const rola of ["instructor", "project_manager", "super_admin", undefined]) {
      expect(czyRolaMozeZglaszac(rola)).toBe(false);
    }
  });

  it("certyfikat tylko dla wolontariusza", () => {
    expect(czyPokazacCertyfikat("volunteer")).toBe(true);
    expect(czyPokazacCertyfikat("student")).toBe(false);
  });

  it("odmowa to 401 i 403, nie 404 ani 500 ani błąd sieci", () => {
    expect(czyBrakUprawnien(blad(401, "unauthenticated", "x"))).toBe(true);
    expect(czyBrakUprawnien(blad(403, "forbidden", "x"))).toBe(true);
    expect(czyBrakUprawnien(blad(404, "not_found", "x"))).toBe(false);
    expect(czyBrakUprawnien(blad(500, "server_error", "x"))).toBe(false);
    expect(czyBrakUprawnien(new TypeError("Failed to fetch"))).toBe(false);
  });

  it("otwarte zgłoszenie to zgłoszenie w statusie „new”", () => {
    expect(maOtwarteZgloszenie([zgloszenie(1, "answered"), zgloszenie(2, "closed")])).toBe(false);
    expect(maOtwarteZgloszenie([zgloszenie(1, "answered"), zgloszenie(2, "new")])).toBe(true);
    expect(maOtwarteZgloszenie([])).toBe(false);
  });
});

describe("wczytajStan", () => {
  const META = { current_page: 1, per_page: 25, total: 1, last_page: 1 };

  it("uczestnik po programie: pyta o /me i o własne zgłoszenia", async () => {
    api.mockResolvedValueOnce({ role: "volunteer", program_completed_at: "2026-09-20T10:00:00Z" });
    apiPaged.mockResolvedValueOnce({ data: [zgloszenie(1, "new")], meta: META });
    const stan = await wczytajStan();
    expect(stan).toMatchObject({ rodzaj: "gotowy", program: "ukonczony", rola: "volunteer" });
    expect(apiPaged).toHaveBeenCalledTimes(1);
  });

  it("program nieukończony: bez zapytania o własne zgłoszenia", async () => {
    api.mockResolvedValueOnce({ role: "student", program_completed_at: null });
    const stan = await wczytajStan();
    expect(stan).toMatchObject({ rodzaj: "gotowy", program: "w-toku", zgloszenia: [] });
    expect(apiPaged).not.toHaveBeenCalled();
  });

  it("rola bez prawa do zgłoszenia: odmowa, bez zapytania o własne zgłoszenia", async () => {
    api.mockResolvedValueOnce({ role: "instructor", program_completed_at: "2026-09-20T10:00:00Z" });
    expect(await wczytajStan()).toEqual({ rodzaj: "brak-uprawnien" });
    expect(apiPaged).not.toHaveBeenCalled();
  });

  it("401 lub 403 przy /me albo przy własnych zgłoszeniach: odmowa", async () => {
    api.mockRejectedValueOnce(blad(401, "unauthenticated", "x"));
    expect(await wczytajStan()).toEqual({ rodzaj: "brak-uprawnien" });
    api.mockResolvedValueOnce({ role: "volunteer", program_completed_at: "2026-09-20T10:00:00Z" });
    apiPaged.mockRejectedValueOnce(blad(403, "forbidden", "x"));
    expect(await wczytajStan()).toEqual({ rodzaj: "brak-uprawnien" });
  });

  it("błąd serwera lub sieci jest rzucany dalej", async () => {
    api.mockRejectedValueOnce(blad(500, "server_error", "x"));
    await expect(wczytajStan()).rejects.toBeInstanceOf(ApiError);
    api.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(wczytajStan()).rejects.toBeInstanceOf(TypeError);
  });
});

describe("sklasyfikujBladWysylki", () => {
  it("422 z polami daje błędy pól", () => {
    expect(sklasyfikujBladWysylki(blad(422, "validation_failed", "x", { body: ["Napisz treść."] }))).toEqual({
      rodzaj: "pola",
      bledy: { body: ["Napisz treść."] },
    });
  });

  it("403 program_not_completed daje osobny rodzaj", () => {
    expect(sklasyfikujBladWysylki(blad(403, "program_not_completed", "x"))).toEqual({ rodzaj: "program-nieukonczony" });
  });

  it("409 cooperation_request_open niesie komunikat z koperty", () => {
    expect(sklasyfikujBladWysylki(blad(409, "cooperation_request_open", "Masz już zgłoszenie."))).toEqual({
      rodzaj: "otwarte",
      komunikat: "Masz już zgłoszenie.",
    });
  });

  it("inny kod niesie komunikat z koperty, błąd sieci komunikat ogólny", () => {
    expect(sklasyfikujBladWysylki(blad(403, "forbidden", "Odmowa."))).toEqual({ rodzaj: "inny", komunikat: "Odmowa." });
    expect(sklasyfikujBladWysylki(new TypeError("x"))).toEqual({
      rodzaj: "inny",
      komunikat: "Nie udało się wysłać zgłoszenia. Spróbuj ponownie.",
    });
  });
});
