import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, NieprawidlowaSciezkaApi } from "@/lib/api/klient";

const api = vi.fn();

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
}));

const { bladZapisu, dodajPytanie, numerTestu, pobierzPytania, sklasyfikujBladOdczytu, usunPytanie, zapiszKolejnosc, zapiszPytanie } = await import("../dane");

const blad = (status: number, code: string, message = "Zdanie serwera.", errors?: Record<string, string[]>) =>
  new ApiError({ status, code, message, errors });

beforeEach(() => {
  api.mockReset().mockResolvedValue({});
});

describe("żądania — te same trasy i pola co dotychczasowy bank pytań", () => {
  it("GET /admin/tests/{test}/questions", async () => {
    await pobierzPytania(10);
    expect(api).toHaveBeenCalledWith("/admin/tests/10/questions");
  });

  it("POST /admin/tests/{test}/questions z treścią i odpowiedziami bez identyfikatorów", async () => {
    await dodajPytanie(10, { body: "Pytanie", answers: [{ body: "A", is_correct: true }, { body: "B", is_correct: false }] });
    expect(api).toHaveBeenCalledWith("/admin/tests/10/questions", {
      method: "POST",
      body: { body: "Pytanie", answers: [{ body: "A", is_correct: true }, { body: "B", is_correct: false }] },
    });
  });

  it("PATCH /admin/questions/{question}: odpowiedź, która już jest, niesie id, nowa — bez id", async () => {
    await zapiszPytanie(42, { body: "Pytanie", answers: [{ id: 220, body: "A", is_correct: false }, { body: "C", is_correct: true }] });
    expect(api).toHaveBeenCalledWith("/admin/questions/42", {
      method: "PATCH",
      body: { body: "Pytanie", answers: [{ id: 220, body: "A", is_correct: false }, { body: "C", is_correct: true }] },
    });
  });

  it("DELETE /admin/questions/{question}", async () => {
    await usunPytanie(42);
    expect(api).toHaveBeenCalledWith("/admin/questions/42", { method: "DELETE" });
  });
});

describe("numer testu z adresu", () => {
  it("tylko dodatnia liczba całkowita", () => {
    expect(numerTestu("10")).toBe(10);
    for (const zly of ["0", "-1", "1.5", "abc", "", "01", "99999999999999999999"]) expect(numerTestu(zly), zly).toBeNull();
  });
});

describe("klasyfikacja błędu odczytu", () => {
  it("403 → odmowa ze zdaniem serwera; 404 i odrzucona ścieżka → nie znaleziono", () => {
    expect(sklasyfikujBladOdczytu(blad(403, "forbidden", "Nie masz dostępu do tego zasobu."))).toEqual({ rodzaj: "brak-dostepu", komunikat: "Nie masz dostępu do tego zasobu." });
    expect(sklasyfikujBladOdczytu(blad(404, "not_found"))).toEqual({ rodzaj: "nie-znaleziono" });
    expect(sklasyfikujBladOdczytu(new NieprawidlowaSciezkaApi())).toEqual({ rodzaj: "nie-znaleziono" });
  });

  it("brak odpowiedzi → brak połączenia; inna odpowiedź → błąd ze zdaniem serwera", () => {
    expect(sklasyfikujBladOdczytu(new TypeError("Failed to fetch"))).toEqual({ rodzaj: "siec" });
    expect(sklasyfikujBladOdczytu(blad(500, "server_error", "Błąd serwera."))).toEqual({ rodzaj: "blad", komunikat: "Błąd serwera." });
  });
});

describe("błąd zapisu", () => {
  it("zdanie i błędy pól serwera; bez zdania — zapasowe; bez odpowiedzi — zdanie o internecie", () => {
    expect(bladZapisu(blad(422, "validation_failed", "Popraw zaznaczone pola.", { body: ["Podaj treść pytania."] }), "x")).toEqual({
      komunikat: "Popraw zaznaczone pola.",
      pola: { body: ["Podaj treść pytania."] },
    });
    expect(bladZapisu(blad(500, "server_error", ""), "Nie udało się dodać pytania.")).toEqual({ komunikat: "Nie udało się dodać pytania.", pola: {} });
    expect(bladZapisu(new TypeError("Failed to fetch"), "x").komunikat).toBe("Nie udało się połączyć z serwerem. Sprawdź internet i spróbuj ponownie.");
  });
});

describe("zapis kolejności — kolejne PATCH z samym numerem pozycji", () => {
  it("kroki idą po kolei, każdy czeka na poprzedni", async () => {
    await zapiszKolejnosc([
      { idPytania: 41, pozycja: 13 },
      { idPytania: 42, pozycja: 3 },
      { idPytania: 41, pozycja: 7 },
    ]);
    expect(api.mock.calls).toEqual([
      ["/admin/questions/41", { method: "PATCH", body: { sequence_order: 13 } }],
      ["/admin/questions/42", { method: "PATCH", body: { sequence_order: 3 } }],
      ["/admin/questions/41", { method: "PATCH", body: { sequence_order: 7 } }],
    ]);
  });

  it("odmowa kroku zatrzymuje dalsze i wraca do wywołującego", async () => {
    api.mockReset().mockResolvedValueOnce({}).mockRejectedValueOnce(blad(500, "server_error"));
    await expect(
      zapiszKolejnosc([
        { idPytania: 41, pozycja: 13 },
        { idPytania: 42, pozycja: 3 },
        { idPytania: 41, pozycja: 7 },
      ]),
    ).rejects.toBeInstanceOf(ApiError);
    expect(api).toHaveBeenCalledTimes(2);
  });
});
