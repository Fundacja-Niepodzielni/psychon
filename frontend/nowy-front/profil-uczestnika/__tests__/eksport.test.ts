import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/klient";
import { czyPrzygotowywany, komunikatBleduZlecenia, KOMUNIKAT_ZLECENIE_NIEUDANE } from "../eksport";

function odmowaLimitu(reason?: Record<string, unknown>) {
  return new ApiError({ status: 429, code: "too_many_requests", message: "x", reason });
}

describe("komunikatBleduZlecenia", () => {
  it.each([
    [1, "Za dużo żądań eksportu. Spróbuj ponownie za 1 sekundę."],
    [2, "Za dużo żądań eksportu. Spróbuj ponownie za 2 sekundy."],
    [5, "Za dużo żądań eksportu. Spróbuj ponownie za 5 sekund."],
    [12, "Za dużo żądań eksportu. Spróbuj ponownie za 12 sekund."],
    [22, "Za dużo żądań eksportu. Spróbuj ponownie za 22 sekundy."],
    [42, "Za dużo żądań eksportu. Spróbuj ponownie za 42 sekundy."],
  ])("429 z %i s: poprawna odmiana", (sekundy, zdanie) => {
    expect(komunikatBleduZlecenia(odmowaLimitu({ retry_after_seconds: sekundy }))).toBe(zdanie);
  });

  it("liczba jako napis i ułamek: zaokrąglenie w górę", () => {
    expect(komunikatBleduZlecenia(odmowaLimitu({ retry_after_seconds: "3" }))).toContain("za 3 sekundy");
    expect(komunikatBleduZlecenia(odmowaLimitu({ retry_after_seconds: 2.2 }))).toContain("za 3 sekundy");
  });

  it("429 bez poprawnej liczby: „za chwilę”, bez zmyślonej liczby", () => {
    const zdanie = "Za dużo żądań eksportu. Spróbuj ponownie za chwilę.";
    expect(komunikatBleduZlecenia(odmowaLimitu())).toBe(zdanie);
    expect(komunikatBleduZlecenia(odmowaLimitu({ retry_after_seconds: 0 }))).toBe(zdanie);
    expect(komunikatBleduZlecenia(odmowaLimitu({ retry_after_seconds: "abc" }))).toBe(zdanie);
  });

  it("409 i inne odmowy API: zdanie z serwera; wyjątek bez odpowiedzi: zdanie ogólne", () => {
    expect(
      komunikatBleduZlecenia(new ApiError({ status: 409, code: "export_in_progress", message: "Poprzedni eksport danych jest jeszcze przygotowywany." })),
    ).toBe("Poprzedni eksport danych jest jeszcze przygotowywany.");
    expect(komunikatBleduZlecenia(new TypeError("Failed to fetch"))).toBe(KOMUNIKAT_ZLECENIE_NIEUDANE);
  });
});

describe("czyPrzygotowywany", () => {
  it("tylko queued i processing", () => {
    expect(["queued", "processing", "ready", "expired", "failed"].map((s) => czyPrzygotowywany(s as never))).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
  });
});
