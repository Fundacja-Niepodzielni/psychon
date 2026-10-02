import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Dane ekranu „Czas nauki”: adresy żądań (takie same jak na starym ekranie),
 * podział błędów, jednostki czasu „godz.” i „min”, rzetelność i stan słowami.
 */

const apiPaged = vi.fn();
const api = vi.fn();

vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return {
    ...oryginal,
    apiPaged: (...args: unknown[]) => apiPaged(...args),
    api: (...args: unknown[]) => api(...args),
  };
});

const { ApiError } = await import("@/lib/api/klient");
const dane = await import("../dane");

beforeEach(() => {
  apiPaged.mockReset();
  api.mockReset();
});

const blad = (status: number, komunikat = "x") => new ApiError({ status, code: "x", message: komunikat });

describe("adresy żądań", () => {
  it("lista: strona i 25 osób na stronę, nic więcej", async () => {
    apiPaged.mockResolvedValue({ data: [], meta: undefined });
    await dane.pobierzOsoby(1);
    await dane.pobierzOsoby(3);
    expect(apiPaged.mock.calls.map(([adres]) => adres)).toEqual([
      "/admin/reliability?page=1&per_page=25",
      "/admin/reliability?page=3&per_page=25",
    ]);
  });

  it("szczegóły: sam identyfikator osoby w adresie", async () => {
    api.mockResolvedValue({ id: 17, lessons: [] });
    await dane.pobierzSzczegoly(17);
    expect(api).toHaveBeenCalledWith("/admin/reliability/17");
  });
});

describe("podział błędów", () => {
  it("lista: 401 i 403 to brak uprawnień, inna odpowiedź to błąd, wyjątek bez odpowiedzi to brak połączenia", () => {
    expect(dane.rodzajBledu(blad(401))).toBe("brak-uprawnien");
    expect(dane.rodzajBledu(blad(403))).toBe("brak-uprawnien");
    expect(dane.rodzajBledu(blad(404))).toBe("blad");
    expect(dane.rodzajBledu(blad(500))).toBe("blad");
    expect(dane.rodzajBledu(new TypeError("Failed to fetch"))).toBe("siec");
  });

  it("szczegóły: 404 to „nie znaleziono”, 401 i 403 brak uprawnień, błąd niesie zdanie serwera", () => {
    expect(dane.sklasyfikujBladSzczegolow(blad(404))).toEqual({ rodzaj: "nie-znaleziono" });
    expect(dane.sklasyfikujBladSzczegolow(blad(403))).toEqual({ rodzaj: "brak-uprawnien" });
    expect(dane.sklasyfikujBladSzczegolow(blad(401))).toEqual({ rodzaj: "brak-uprawnien" });
    expect(dane.sklasyfikujBladSzczegolow(blad(500, "Coś poszło nie tak."))).toEqual({ rodzaj: "blad", komunikat: "Coś poszło nie tak." });
    expect(dane.sklasyfikujBladSzczegolow(new TypeError("Failed to fetch"))).toEqual({ rodzaj: "siec" });
  });
});

describe("czas w „godz.” i „min”", () => {
  it.each([
    [0, "0 min"],
    [1, "1 min"],
    [59, "1 min"],
    [60, "1 min"],
    [61, "2 min"],
    [270, "5 min"],
    [1800, "30 min"],
    [3540, "59 min"],
    [3600, "1 godz."],
    [3601, "1 godz. 1 min"],
    [4800, "1 godz. 20 min"],
    [7200, "2 godz."],
    [7260, "2 godz. 1 min"],
  ])("%i s → %s", (sekundy, oczekiwany) => {
    expect(dane.formatujCzas(sekundy)).toBe(oczekiwany);
  });

  it("wartość niepoprawna albo ujemna nie daje „NaN” ani minusa", () => {
    expect(dane.formatujCzas(Number.NaN)).toBe("0 min");
    expect(dane.formatujCzas(-30)).toBe("0 min");
  });

  it("wynik nigdy nie ma sekund", () => {
    for (const sekundy of [1, 59, 61, 3599, 3661]) expect(dane.formatujCzas(sekundy)).not.toMatch(/\bs\b/);
  });
});

describe("rzetelność i stan słowami", () => {
  it("procent po polsku z przecinkiem, myślnik przy braku wyniku", () => {
    expect(dane.formatujRzetelnosc("85")).toBe("85%");
    expect(dane.formatujRzetelnosc("85.5")).toBe("85,5%");
    expect(dane.formatujRzetelnosc(null)).toBe("—");
  });

  it("brak wyniku to „brak danych”, poniżej progu i w normie osobno", () => {
    expect(dane.stanRzetelnosci({ reliability_percent: null, below_threshold: false })).toEqual({ wariant: "neutral", tekst: "brak danych" });
    expect(dane.stanRzetelnosci({ reliability_percent: "15", below_threshold: true })).toEqual({ wariant: "error", tekst: "poniżej progu" });
    expect(dane.stanRzetelnosci({ reliability_percent: "85", below_threshold: false })).toEqual({ wariant: "ok", tekst: "w normie" });
    expect(dane.stanLekcji(true)).toEqual({ wariant: "error", tekst: "poniżej progu" });
    expect(dane.stanLekcji(false)).toEqual({ wariant: "ok", tekst: "w normie" });
  });
});
