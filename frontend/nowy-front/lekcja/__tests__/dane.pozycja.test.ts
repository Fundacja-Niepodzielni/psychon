import { describe, expect, it } from "vitest";
import { pozycjaStartowa } from "../dane";

describe("pozycjaStartowa — pozycja wznowienia z odczytu lekcji", () => {
  it("poprawna pozycja wewnątrz nagrania zostaje", () => {
    expect(pozycjaStartowa({ position_seconds: 754, duration_seconds: 1800 })).toBe(754);
    expect(pozycjaStartowa({ position_seconds: 1799, duration_seconds: 1800 })).toBe(1799);
  });

  it("ułamek jest obcinany do pełnych sekund", () => {
    expect(pozycjaStartowa({ position_seconds: 754.9, duration_seconds: 1800 })).toBe(754);
  });

  it.each([
    ["brak pola", undefined],
    ["null", null],
    ["0", 0],
    ["ujemna", -5],
    ["nieskończona", Number.POSITIVE_INFINITY],
    ["nie liczba", Number.NaN],
  ])("%s → 0", (_nazwa, wartosc) => {
    expect(pozycjaStartowa({ position_seconds: wartosc, duration_seconds: 1800 })).toBe(0);
  });

  it("pozycja równa albo większa od długości → 0, także przy długości 0", () => {
    expect(pozycjaStartowa({ position_seconds: 1800, duration_seconds: 1800 })).toBe(0);
    expect(pozycjaStartowa({ position_seconds: 2400, duration_seconds: 1800 })).toBe(0);
    expect(pozycjaStartowa({ position_seconds: 10, duration_seconds: 0 })).toBe(0);
  });
});
