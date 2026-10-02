import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/klient";

const api = vi.fn();
const downloadFile = vi.fn();

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
}));

vi.mock("@/lib/api/pliki", () => ({
  downloadFile: (...args: unknown[]) => downloadFile(...args),
}));

const { odczytajRaport, pobierzLiczbyDlaGrantodawcy, pobierzRaport, pobierzZestawienie, rodzajBledu, zdanieZlegoOkresu } = await import("../dane");
const { raport } = await import("./atrapy");

beforeEach(() => {
  api.mockReset().mockResolvedValue(raport());
  downloadFile.mockReset().mockResolvedValue(undefined);
});

describe("żądania", () => {
  it("raport: GET /admin/report, bez dat bez parametrów, z datami from i to", async () => {
    await pobierzRaport({});
    expect(api).toHaveBeenLastCalledWith("/admin/report");
    await pobierzRaport({ from: "2026-03-01", to: "2026-03-31" });
    expect(api).toHaveBeenLastCalledWith("/admin/report?from=2026-03-01&to=2026-03-31");
    await pobierzRaport({ from: "", to: "2026-03-31" });
    expect(api).toHaveBeenLastCalledWith("/admin/report?to=2026-03-31");
  });

  it("zestawienie do arkusza: export.csv z układem zestawienia i tym samym okresem", async () => {
    await pobierzZestawienie({ from: "2026-03-01", to: "2026-03-31" });
    expect(downloadFile).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/admin\/report\/export\.csv\?uklad=zestawienie&from=2026-03-01&to=2026-03-31$/),
      "zestawienie-roku-programu.csv",
    );
  });

  it("liczby dla grantodawcy: plik raportu grantodawcy z tym samym okresem, bez nazwisk", async () => {
    await pobierzLiczbyDlaGrantodawcy({ from: "2026-03-01" });
    expect(downloadFile).toHaveBeenCalledWith(expect.stringMatching(/\/api\/v1\/admin\/report\/grantor\/export\.csv\?from=2026-03-01$/), "liczby-dla-grantodawcy.csv");
  });
});

describe("odczyt odpowiedzi", () => {
  it("odpowiedź z blokami roku programu przechodzi", () => {
    expect(odczytajRaport(raport())).toEqual(raport());
  });

  it("odpowiedź bez bloków roku programu (starsze zaplecze) daje null", () => {
    expect(odczytajRaport({ summary: {}, people: [] })).toBeNull();
    expect(odczytajRaport(null)).toBeNull();
    expect(odczytajRaport({ ...raport(), people: "x" })).toBeNull();
  });

  it("brak bloku okresu: okres pusty", () => {
    const { period: _pominiety, ...bezOkresu } = raport();
    void _pominiety;
    expect(odczytajRaport(bezOkresu)?.period).toEqual({ from: null, to: null });
  });
});

describe("błędy", () => {
  const blad = (status: number, errors?: Record<string, string[]>) => new ApiError({ status, code: "x", message: "Zdanie serwera.", errors });

  it("401 i 403 → brak dostępu; 422 → zły okres; brak odpowiedzi → sieć; reszta → błąd", () => {
    expect(rodzajBledu(blad(401))).toBe("brak-dostepu");
    expect(rodzajBledu(blad(403))).toBe("brak-dostepu");
    expect(rodzajBledu(blad(422))).toBe("zly-okres");
    expect(rodzajBledu(new TypeError("Failed to fetch"))).toBe("siec");
    expect(rodzajBledu(blad(500))).toBe("blad");
  });

  it("zdanie złego okresu z pola serwera, inaczej ogólne", () => {
    expect(zdanieZlegoOkresu(blad(422, { to: ["Data końca nie może być wcześniejsza niż data początku."] }))).toBe(
      "Data końca nie może być wcześniejsza niż data początku.",
    );
    expect(zdanieZlegoOkresu(blad(422))).toBe("Popraw daty okresu.");
  });
});
