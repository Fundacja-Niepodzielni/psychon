import { describe, expect, it } from "vitest";
import { odmien } from "../odmiana";

const osoba = (liczba: number) => odmien(liczba, "osoba", "osoby", "osób");

describe("odmien", () => {
  it.each([
    [0, "osób"],
    [1, "osoba"],
    [2, "osoby"],
    [4, "osoby"],
    [5, "osób"],
    [12, "osób"],
    [14, "osób"],
    [21, "osób"],
    [22, "osoby"],
    [25, "osób"],
    [112, "osób"],
  ])("%i -> %s", (liczba, oczekiwane) => {
    expect(osoba(liczba)).toBe(oczekiwane);
  });

  it.each([
    [1, "sprawa"],
    [3, "sprawy"],
    [13, "spraw"],
    [102, "sprawy"],
  ])("te same formy dla innego rzeczownika: %i -> %s", (liczba, oczekiwane) => {
    expect(odmien(liczba, "sprawa", "sprawy", "spraw")).toBe(oczekiwane);
  });
});
