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
// Kod danych bierze klienta z `@/lib/api/klient`; beczkę `@/lib/api` podmieniamy zapobiegawczo, żeby przyszły import z beczki nie poszedł do prawdziwego transportu.
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

  it("forma w panelu zaczyna się wielką literą, reszta etykiety bez zmian", () => {
    expect(dane.etykietaFormyZWielkiej("phone_duty")).toBe("Dyżur telefoniczny");
    expect(dane.etykietaFormyZWielkiej("chat_duty")).toBe("Czat");
    expect(dane.etykietaFormyZWielkiej("cos_innego")).toBe("Inna");
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

describe("godziny osoby do panelu", () => {
  it("karta osoby daje zatwierdzone godziny, edycja wymagane — dwa istniejące odczyty, bez nowych tras", async () => {
    api.mockImplementation((sciezka: string) =>
      Promise.resolve(
        sciezka === "/admin/users/17"
          ? { progress: { hours_accepted: "18.5" } }
          : { internship_hours_required: 72 },
      ),
    );
    await expect(dane.pobierzGodzinyOsoby(17)).resolves.toEqual({ zaakceptowane: "18.5", wymagane: "72" });
    expect(api.mock.calls.map(([sciezka]) => sciezka).sort()).toEqual(["/admin/edition", "/admin/users/17"]);
  });

  it("edycja nie odpowiada: zatwierdzone godziny zostają, wymagane to null", async () => {
    api.mockImplementation((sciezka: string) =>
      sciezka === "/admin/users/17"
        ? Promise.resolve({ progress: { hours_accepted: "4" } })
        : Promise.reject(new TypeError("Failed to fetch")),
    );
    await expect(dane.pobierzGodzinyOsoby(17)).resolves.toEqual({ zaakceptowane: "4", wymagane: null });
  });

  it("karta osoby nie odpowiada: błąd wraca wołającemu, żadnej liczby", async () => {
    api.mockImplementation((sciezka: string) =>
      sciezka === "/admin/users/17"
        ? Promise.reject(new ApiError({ status: 404, code: "not_found", message: "Nie znaleziono osoby." }))
        : Promise.resolve({ internship_hours_required: 72 }),
    );
    await expect(dane.pobierzGodzinyOsoby(17)).rejects.toBeInstanceOf(ApiError);
  });

  it("suma godzin ze stringów: „18” + „4” → „22”, „21” + „0.5” → „21.5”, nie-liczba → null", () => {
    expect(dane.dodajGodziny("18", "4")).toBe("22");
    expect(dane.dodajGodziny("21", "0.5")).toBe("21.5");
    expect(dane.dodajGodziny("brak", "4")).toBeNull();
    expect(dane.dodajGodziny("18", "")).toBeNull();
  });

  it("procent paska: zaokrąglony i obcięty do 0–100, zero wymaganych godzin to 0", () => {
    expect(dane.procentGodzin("18", "72")).toBe(25);
    expect(dane.procentGodzin("80", "72")).toBe(100);
    expect(dane.procentGodzin("18", "0")).toBe(0);
    expect(dane.procentGodzin("x", "72")).toBe(0);
  });
});
