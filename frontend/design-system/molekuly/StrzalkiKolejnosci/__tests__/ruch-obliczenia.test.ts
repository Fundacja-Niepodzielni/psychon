import { describe, expect, it } from "vitest";
import { obliczPrzesuniecia, type Pomiar } from "../ruch";

function pomiar(polozenia: Record<string, [number, number]>, rodzice: Record<string, string | null> = {}): Pomiar {
  return {
    polozenia: new Map(Object.entries(polozenia).map(([klucz, [x, y]]) => [klucz, { x, y }])),
    rodzice: new Map(Object.keys(polozenia).map((klucz) => [klucz, rodzice[klucz] ?? null])),
  };
}

describe("obliczPrzesuniecia", () => {
  it("zamiana dwóch wierszy daje przeciwne przesunięcia (dawne minus nowe)", () => {
    const przed = pomiar({ a: [0, 0], b: [0, 40] });
    const po = pomiar({ a: [0, 40], b: [0, 0] });
    expect(obliczPrzesuniecia(przed, po)).toEqual([
      { klucz: "a", dx: 0, dy: -40 },
      { klucz: "b", dx: 0, dy: 40 },
    ]);
  });

  it("pomija wiersze, które się nie ruszyły (poniżej 1 px), i wiersze nowe", () => {
    const przed = pomiar({ a: [0, 0], b: [0, 40] });
    const po = pomiar({ a: [0, 0.4], b: [0, 40], nowy: [0, 80] });
    expect(obliczPrzesuniecia(przed, po)).toEqual([]);
  });

  it("wiersz zagnieżdżony, który jedzie z przodkiem o to samo przesunięcie, nie jedzie drugi raz", () => {
    const przed = pomiar({ t1: [0, 0], l1: [0, 10], t2: [0, 100] }, { l1: "t1" });
    const po = pomiar({ t2: [0, 0], t1: [0, 100], l1: [0, 110] }, { l1: "t1" });
    expect(obliczPrzesuniecia(przed, po).map((p) => p.klucz).sort()).toEqual(["t1", "t2"]);
  });

  it("wiersz zagnieżdżony, który ruszył się inaczej niż przodek, zachowuje własne przesunięcie", () => {
    const przed = pomiar({ t1: [0, 0], l1: [0, 10], l2: [0, 50] }, { l1: "t1", l2: "t1" });
    const po = pomiar({ t1: [0, 0], l1: [0, 50], l2: [0, 10] }, { l1: "t1", l2: "t1" });
    expect(obliczPrzesuniecia(przed, po).map((p) => p.klucz).sort()).toEqual(["l1", "l2"]);
  });
});
