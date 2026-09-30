import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Moduł danych wniosków o profil: adres zapytania z filtrem stanu,
 * etykiety stanów po polsku, adres ekranu decyzji, podpis wiersza.
 */

const apiPaged = vi.fn();
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));
vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return { ...oryginal, apiPaged: (...a: unknown[]) => apiPaged(...a) };
});

const { ApiError } = await import("@/lib/api/klient");
const dane = await import("../dane");

beforeEach(() => apiPaged.mockReset());

describe("stany wniosku", () => {
  it("każdy stan ze słownika ma etykietę po polsku i żadna nie jest surowym kodem", () => {
    const kody = ["draft", "submitted", "returned", "accepted", "published", "withdrawn"];
    for (const kod of kody) {
      const { etykieta } = dane.plakietkaStanu(kod);
      expect(etykieta).not.toBe(kod);
      expect(etykieta).toMatch(/^[A-ZĄĆĘŁŃÓŚŹŻ]/);
    }
    expect(dane.OPCJE_STANU.map((o) => o.wartosc)).toEqual(["submitted", "returned", "accepted", "published", "withdrawn", "draft"]);
  });

  it("stan czekający na decyzję to domyślny filtr i plakietka „pending”", () => {
    expect(dane.STAN_DO_DECYZJI).toBe("submitted");
    expect(dane.plakietkaStanu("submitted")).toEqual({ etykieta: "Czeka na decyzję", wariant: "pending" });
  });

  it("nieznany stan → „Stan nieznany”", () => {
    expect(dane.plakietkaStanu("x").etykieta).toBe("Stan nieznany");
  });
});

describe("adres i podpis", () => {
  it("adres ekranu decyzji o wniosku", () => {
    expect(dane.adresWniosku(12)).toBe("/nowy-front/admin/profile/12");
  });
});

describe("pobierzWnioski", () => {
  it("wysyła stan, stronę i 25 na stronę; zwraca wnioski i meta", async () => {
    apiPaged.mockResolvedValueOnce({ data: [{ id: 1 }], meta: { current_page: 3, per_page: 25, total: 60, last_page: 3 } });
    const wynik = await dane.pobierzWnioski("accepted", 3);
    expect(apiPaged).toHaveBeenCalledWith("/admin/profiles?status=accepted&page=3&per_page=25");
    expect(wynik.wnioski).toHaveLength(1);
    expect(wynik.meta?.last_page).toBe(3);
  });

  it("401 i 403 to brak uprawnień, inne błędy nie", () => {
    const e = (status: number) => new ApiError({ status, code: "x", message: "m" });
    expect(dane.czyBrakUprawnien(e(401))).toBe(true);
    expect(dane.czyBrakUprawnien(e(403))).toBe(true);
    expect(dane.czyBrakUprawnien(e(500))).toBe(false);
    expect(dane.czyBrakUprawnien(new TypeError("x"))).toBe(false);
  });
});
