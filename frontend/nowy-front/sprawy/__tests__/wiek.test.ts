import { describe, expect, it } from "vitest";
import {
  dniOczekiwania,
  slowoDni,
  tekstPlakietkiCzekania,
  tekstWieku,
  wariantPlakietkiCzekania,
} from "../wiek";

const DOBA = 24 * 60 * 60 * 1000;
const TERAZ = Date.parse("2026-10-01T12:00:00Z");

describe("próg ostrzeżenia plakietki „czeka N dni”", () => {
  it("4 dni: plakietka szara; 5 dni: ostrzegawcza; powyżej: ostrzegawcza", () => {
    expect(wariantPlakietkiCzekania(4)).toBe("neutral");
    expect(wariantPlakietkiCzekania(5)).toBe("warn");
    expect(wariantPlakietkiCzekania(6)).toBe("warn");
    expect(wariantPlakietkiCzekania(0)).toBe("neutral");
  });
});

describe("dniOczekiwania", () => {
  it("liczy pełne doby od chwili, od której sprawa czeka", () => {
    expect(dniOczekiwania("2026-10-01T11:59:00Z", TERAZ)).toBe(0);
    expect(dniOczekiwania("2026-09-30T12:00:00Z", TERAZ)).toBe(1);
    expect(dniOczekiwania("2026-09-30T12:00:01Z", TERAZ)).toBe(0);
    expect(dniOczekiwania(new Date(TERAZ - 5 * DOBA).toISOString(), TERAZ)).toBe(5);
    expect(dniOczekiwania(new Date(TERAZ - 4 * DOBA - 1000).toISOString(), TERAZ)).toBe(4);
  });

  it("brak daty albo data nieczytelna: null (ekran niczego nie zgaduje)", () => {
    expect(dniOczekiwania("", TERAZ)).toBeNull();
    expect(dniOczekiwania("nie-data", TERAZ)).toBeNull();
  });

  it("chwila w przyszłości (rozjazd zegarów) daje 0, nie liczbę ujemną", () => {
    expect(dniOczekiwania("2026-10-05T12:00:00Z", TERAZ)).toBe(0);
  });
});

describe("odmiana i tekst plakietki", () => {
  it("„dzień” tylko przy 1, w pozostałych przypadkach „dni”", () => {
    expect([0, 1, 2, 5, 22].map(slowoDni)).toEqual(["dni", "dzień", "dni", "dni", "dni"]);
  });

  it("tekst plakietki: „czeka od dziś” przy 0, „czeka 1 dzień”, „czeka N dni” dla pozostałych", () => {
    expect(tekstPlakietkiCzekania(5)).toBe("czeka 5 dni");
    expect(tekstPlakietkiCzekania(1)).toBe("czeka 1 dzień");
    expect(tekstPlakietkiCzekania(0)).toBe("czeka od dziś");
    expect(tekstPlakietkiCzekania(2)).toBe("czeka 2 dni");
    expect(tekstPlakietkiCzekania(22)).toBe("czeka 22 dni");
  });

  it("część wieku z jednej funkcji: „od dziś”, „1 dzień”, „2 dni”, „5 dni”, „22 dni”", () => {
    expect([0, 1, 2, 5, 22].map(tekstWieku)).toEqual(["od dziś", "1 dzień", "2 dni", "5 dni", "22 dni"]);
  });

  it("plakietka składa się z części wieku: „czeka ” + tekstWieku(N) dla każdego N", () => {
    for (const dni of [0, 1, 2, 4, 5, 22]) {
      expect(tekstPlakietkiCzekania(dni)).toBe(`czeka ${tekstWieku(dni)}`);
    }
  });
});
