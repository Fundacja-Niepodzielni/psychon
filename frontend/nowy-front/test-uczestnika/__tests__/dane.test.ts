import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, NieprawidlowaSciezkaApi } from "@/lib/api/klient";

const api = vi.fn();
const apiPaged = vi.fn();

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
}));

const { adresKursu, pobierzHistorie, pobierzKursTestu, pobierzTest, sklasyfikujBladTestu, sklasyfikujBladWyslania, wyslijPodejscie } =
  await import("../dane");

const blad = (status: number, code: string, message = "Zdanie serwera.", reason?: Record<string, unknown>) =>
  new ApiError({ status, code, message, reason });

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
});

describe("żądania — te same trasy i pola co dotychczasowy ekran testu", () => {
  it("GET /courses/{slug}/test, slug zakodowany", async () => {
    api.mockResolvedValue({});
    await pobierzTest("pierwsza pomoc");
    expect(api).toHaveBeenCalledWith("/courses/pierwsza%20pomoc/test");
  });

  it("GET /tests/{id}/attempts; błąd historii daje null, nie wyjątek", async () => {
    apiPaged.mockResolvedValueOnce({ data: [{ attempt_number: 1 }] }).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await pobierzHistorie(10)).toEqual([{ attempt_number: 1 }]);
    expect(apiPaged).toHaveBeenCalledWith("/tests/10/attempts");
    expect(await pobierzHistorie(10)).toBeNull();
  });

  it("POST /tests/{id}/attempts z polem answers", async () => {
    api.mockResolvedValue({});
    await wyslijPodejscie(10, { 41: 210, 42: 221 });
    expect(api).toHaveBeenCalledWith("/tests/10/attempts", { method: "POST", body: { answers: { 41: 210, 42: 221 } } });
  });

  it("adres powrotu do kursu", () => {
    expect(adresKursu("pierwsza-pomoc-psychologiczna")).toBe("/panel/kursy/pierwsza-pomoc-psychologiczna");
  });
});

describe("odczyt kursu do nagłówka", () => {
  it("nazwa, identyfikator, has_test i liczba nieukończonych lekcji", async () => {
    api.mockResolvedValue({ id: 2, title: "Kurs", has_test: true, lessons: [{ is_completed: true }, { is_completed: false }, {}] });
    expect(await pobierzKursTestu("kurs")).toEqual({ id: 2, title: "Kurs", has_test: true, nieukonczone: 2 });
    expect(api).toHaveBeenCalledWith("/courses/kurs");
  });

  it("brak pola has_test to „nie wiadomo”", async () => {
    api.mockResolvedValue({ id: 2, title: "Kurs" });
    expect(await pobierzKursTestu("kurs")).toEqual({ id: 2, title: "Kurs", has_test: null, nieukonczone: 0 });
  });

  it("404 → nie znaleziono; inny błąd albo odpowiedź bez tytułu → null", async () => {
    api.mockRejectedValueOnce(blad(404, "not_found"));
    expect(await pobierzKursTestu("kurs")).toBe("nie-znaleziono");
    api.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await pobierzKursTestu("kurs")).toBeNull();
    api.mockResolvedValueOnce({ id: 2 });
    expect(await pobierzKursTestu("kurs")).toBeNull();
  });
});

describe("klasyfikacja błędu odczytu testu", () => {
  it("422 conditions_not_met z brakiem lekcji → test zamknięty lekcjami", () => {
    expect(sklasyfikujBladTestu(blad(422, "conditions_not_met", "x", { missing: ["lessons"] }))).toEqual({ rodzaj: "lekcje-nieukonczone" });
    expect(sklasyfikujBladTestu(blad(422, "conditions_not_met", "x", { missing: ["workshop"] }))).toEqual({ rodzaj: "blad" });
  });

  it("403: course_locked, access_expired i pozostałe ze zdaniem serwera", () => {
    expect(sklasyfikujBladTestu(blad(403, "course_locked", "Ukończ najpierw etap 2."))).toEqual({ rodzaj: "kurs-zamkniety", komunikat: "Ukończ najpierw etap 2." });
    expect(sklasyfikujBladTestu(blad(403, "access_expired"))).toEqual({ rodzaj: "dostep-wygasl" });
    expect(sklasyfikujBladTestu(blad(403, "forbidden", "Brak uprawnień."))).toEqual({ rodzaj: "brak-dostepu", komunikat: "Brak uprawnień." });
  });

  it("404 i odrzucona ścieżka → nie znaleziono; brak odpowiedzi → sieć; reszta → błąd", () => {
    expect(sklasyfikujBladTestu(blad(404, "not_found"))).toEqual({ rodzaj: "nie-znaleziono" });
    expect(sklasyfikujBladTestu(new NieprawidlowaSciezkaApi())).toEqual({ rodzaj: "nie-znaleziono" });
    expect(sklasyfikujBladTestu(new TypeError("Failed to fetch"))).toEqual({ rodzaj: "siec" });
    expect(sklasyfikujBladTestu(blad(500, "server_error"))).toEqual({ rodzaj: "blad" });
  });
});

describe("klasyfikacja błędu wysłania", () => {
  it("attempts_exhausted ze zdaniem serwera; brak lekcji; inne ze zdaniem serwera; brak odpowiedzi — zdanie o internecie", () => {
    expect(sklasyfikujBladWyslania(blad(403, "attempts_exhausted", "Wykorzystałeś wszystkie dostępne podejścia do tego testu."))).toEqual({
      rodzaj: "brak-podejsc",
      komunikat: "Wykorzystałeś wszystkie dostępne podejścia do tego testu.",
    });
    expect(sklasyfikujBladWyslania(blad(422, "conditions_not_met", "x", { missing: ["lessons"] }))).toEqual({ rodzaj: "lekcje-nieukonczone" });
    expect(sklasyfikujBladWyslania(blad(422, "validation_failed", "Popraw zaznaczone pola."))).toEqual({ rodzaj: "komunikat", komunikat: "Popraw zaznaczone pola." });
    expect(sklasyfikujBladWyslania(new TypeError("Failed to fetch"))).toEqual({
      rodzaj: "komunikat",
      komunikat: "Nie udało się wysłać odpowiedzi. Sprawdź internet i spróbuj ponownie.",
    });
  });

  it("403 test_already_passed → test już zaliczony (ekran wczytuje test od nowa i pokazuje zaliczenie)", () => {
    expect(sklasyfikujBladWyslania(blad(403, "test_already_passed", "Ten test jest już zaliczony."))).toEqual({ rodzaj: "zaliczony" });
  });
});
