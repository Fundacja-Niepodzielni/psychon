import { describe, expect, it } from "vitest";
import { formatujDate, formatujDateICzas } from "../daty";

/**
 * Wspólny formater dat nowego frontu: dzień „30 września 2026”, dzień z godziną
 * „30 września 2026, 20:50”, strefa Europe/Warsaw, brak wartości → „—”.
 */

describe("formatujDate", () => {
  it("znacznik UTC z wieczora tego samego dnia: dzień w Warszawie", () => {
    expect(formatujDate("2026-09-30T18:50:00Z")).toBe("30 września 2026");
  });

  it("granica UTC/Warszawa: 22:30 UTC we wrześniu to już następny dzień, 1 października", () => {
    expect(formatujDate("2026-09-30T22:30:00Z")).toBe("1 października 2026");
  });

  it("granica UTC/Warszawa w zimie: 23:30 UTC to już następny dzień", () => {
    expect(formatujDate("2026-12-31T23:30:00Z")).toBe("1 stycznia 2027");
  });

  it("dzień bez zera wiodącego i miesiąc słownie w dopełniaczu", () => {
    expect(formatujDate("2026-09-05T10:00:00Z")).toBe("5 września 2026");
  });

  it("data kalendarzowa bez godziny nie zmienia dnia", () => {
    expect(formatujDate("2026-09-22")).toBe("22 września 2026");
    expect(formatujDate("2026-01-01")).toBe("1 stycznia 2026");
  });

  it.each([null, undefined, "", "   ", "to nie jest data"])("brak albo nieczytelna wartość %j → „—”", (wartosc) => {
    expect(formatujDate(wartosc as string | null | undefined)).toBe("—");
  });
});

describe("formatujDateICzas", () => {
  it("czas letni: 18:50 UTC to 20:50 w Warszawie", () => {
    expect(formatujDateICzas("2026-09-30T18:50:00Z")).toBe("30 września 2026, 20:50");
  });

  it("czas zimowy: 16:05 UTC to 17:05 w Warszawie", () => {
    expect(formatujDateICzas("2026-11-10T16:05:00Z")).toBe("10 listopada 2026, 17:05");
  });

  it("zmiana czasu 2026-10-25: przed 01:00 UTC obowiązuje czas letni, od 01:00 UTC zimowy", () => {
    expect(formatujDateICzas("2026-10-25T00:30:00Z")).toBe("25 października 2026, 02:30");
    expect(formatujDateICzas("2026-10-25T01:30:00Z")).toBe("25 października 2026, 02:30");
    expect(formatujDateICzas("2026-10-25T02:30:00Z")).toBe("25 października 2026, 03:30");
  });

  it("zmiana czasu 2026-03-29: przed 01:00 UTC czas zimowy, od 01:00 UTC letni", () => {
    expect(formatujDateICzas("2026-03-29T00:30:00Z")).toBe("29 marca 2026, 01:30");
    expect(formatujDateICzas("2026-03-29T01:30:00Z")).toBe("29 marca 2026, 03:30");
  });

  it("granica UTC/Warszawa: 22:30 UTC to 00:30 następnego dnia, godzina z zerem wiodącym", () => {
    expect(formatujDateICzas("2026-09-30T22:30:00Z")).toBe("1 października 2026, 00:30");
  });

  it("godzina z zerem wiodącym: 09:12", () => {
    expect(formatujDateICzas("2026-09-25T07:12:00Z")).toBe("25 września 2026, 09:12");
  });

  it("bez sekund i bez nazwy strefy", () => {
    const tekst = formatujDateICzas("2026-09-25T15:05:41Z");
    expect(tekst).toBe("25 września 2026, 17:05");
    expect(tekst).not.toMatch(/UTC|GMT|:41/);
  });

  it("data kalendarzowa bez godziny pokazuje sam dzień", () => {
    expect(formatujDateICzas("2026-09-22")).toBe("22 września 2026");
  });

  it.each([null, undefined, "", "to nie jest data"])("brak albo nieczytelna wartość %j → „—”", (wartosc) => {
    expect(formatujDateICzas(wartosc as string | null | undefined)).toBe("—");
  });

  it("wynik nigdy nie zawiera znacznika ISO", () => {
    expect(formatujDateICzas("2026-09-30T18:50:00Z")).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});
