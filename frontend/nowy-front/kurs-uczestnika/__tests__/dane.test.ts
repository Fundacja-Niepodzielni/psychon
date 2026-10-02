import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, NieprawidlowaSciezkaApi } from "@/lib/api/klient";

const api = vi.fn();

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
}));

const { adresTestu, pobierzKurs, sklasyfikujBladKursu, ADRES_LISTY_KURSOW } = await import("../dane");

beforeEach(() => {
  api.mockReset();
});

describe("odczyt kursu", () => {
  it("jedno istniejące żądanie GET /courses/{slug}, slug zakodowany w adresie", async () => {
    api.mockResolvedValue({ id: 1 });
    await pobierzKurs("wywiad psychologiczny");
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith("/courses/wywiad%20psychologiczny");
  });

  it("adresy: lista kursów i test kursu", () => {
    expect(ADRES_LISTY_KURSOW).toBe("/panel/kursy");
    expect(adresTestu("wywiad")).toBe("/panel/kursy/wywiad/test");
  });
});

describe("klasyfikacja błędu odczytu", () => {
  const blad = (status: number, code: string, message = "komunikat serwera") => new ApiError({ status, code, message });

  it("403 course_locked → zamknięty, ze zdaniem serwera", () => {
    expect(sklasyfikujBladKursu(blad(403, "course_locked", "Ukończ najpierw etap 2."))).toEqual({ rodzaj: "zamkniety", komunikat: "Ukończ najpierw etap 2." });
  });

  it("403 access_expired → dostęp wygasł", () => {
    expect(sklasyfikujBladKursu(blad(403, "access_expired"))).toEqual({ rodzaj: "dostep-wygasl" });
  });

  it("404 → nie znaleziono; inne 403 → błąd odczytu", () => {
    expect(sklasyfikujBladKursu(blad(404, "not_found"))).toEqual({ rodzaj: "nie-znaleziono" });
    expect(sklasyfikujBladKursu(blad(403, "forbidden"))).toEqual({ rodzaj: "blad" });
  });

  it("slug, którego klient API nie przepuścił → nie znaleziono", () => {
    expect(sklasyfikujBladKursu(new NieprawidlowaSciezkaApi())).toEqual({ rodzaj: "nie-znaleziono" });
  });

  it("wyjątek bez odpowiedzi → brak połączenia; pozostałe odpowiedzi → błąd odczytu", () => {
    expect(sklasyfikujBladKursu(new TypeError("Failed to fetch"))).toEqual({ rodzaj: "siec" });
    expect(sklasyfikujBladKursu(blad(500, "server_error"))).toEqual({ rodzaj: "blad" });
    expect(sklasyfikujBladKursu(blad(422, "validation_failed"))).toEqual({ rodzaj: "blad" });
  });
});
