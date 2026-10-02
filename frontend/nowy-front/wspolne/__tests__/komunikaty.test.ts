import { describe, expect, it } from "vitest";
import { KOMUNIKAT_INTERNET, KOMUNIKAT_SERWER, KOMUNIKAT_ZAPIS } from "../komunikaty";

/**
 * Trzy wspólne zdania o błędach mają jedno, ustalone brzmienie. Test pilnuje
 * go co do znaku, bo to zdania, które osoba czyta na wielu ekranach.
 */
describe("wspólne komunikaty o błędach", () => {
  it("serwer nie odpowiedział albo zwrócił błąd", () => {
    expect(KOMUNIKAT_SERWER).toBe("Nie udało się połączyć z serwerem. Spróbuj ponownie za chwilę.");
  });

  it("brak internetu", () => {
    expect(KOMUNIKAT_INTERNET).toBe("Brak połączenia z internetem. Sprawdź połączenie i spróbuj ponownie.");
  });

  it("zapis się nie powiódł", () => {
    expect(KOMUNIKAT_ZAPIS).toBe("Nie udało się zapisać. Spróbuj ponownie.");
  });

  it("żadne zdanie nie ma podwójnej spacji ani spacji na brzegach", () => {
    for (const zdanie of [KOMUNIKAT_SERWER, KOMUNIKAT_INTERNET, KOMUNIKAT_ZAPIS]) {
      expect(zdanie).toBe(zdanie.trim());
      expect(zdanie).not.toMatch(/\s{2,}/);
    }
  });
});
