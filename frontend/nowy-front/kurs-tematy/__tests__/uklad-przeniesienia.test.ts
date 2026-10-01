import { describe, expect, it } from "vitest";
import { cialoUkladu, przeniesTemat, przesunLekcje, type Uklad } from "../uklad";

function uklad(): Uklad {
  return {
    tematy: [
      { id: 7, tytul: "Podstawy", lekcje: [21, 22] },
      { id: 8, tytul: "Praktyka", lekcje: [23] },
      { id: 9, tytul: "Zakończenie", lekcje: [] },
    ],
    tytulyLekcji: { 21: "A", 22: "B", 23: "C" },
  };
}

describe("przeniesTemat", () => {
  it("przesuwa temat o jedno miejsce niżej, lekcje zostają w swoich tematach", () => {
    expect(cialoUkladu(przeniesTemat(uklad(), 7, 1))).toEqual([
      { id: 8, lesson_ids: [23] },
      { id: 7, lesson_ids: [21, 22] },
      { id: 9, lesson_ids: [] },
    ]);
  });

  it("przesuwa temat o jedno miejsce wyżej", () => {
    expect(cialoUkladu(przeniesTemat(uklad(), 9, -1)).map((temat) => temat.id)).toEqual([7, 9, 8]);
  });

  it("pierwszy temat wyżej, ostatni niżej i nieznany temat oddają ten sam układ", () => {
    const poczatek = uklad();
    expect(przeniesTemat(poczatek, 7, -1)).toBe(poczatek);
    expect(przeniesTemat(poczatek, 9, 1)).toBe(poczatek);
    expect(przeniesTemat(poczatek, 99, 1)).toBe(poczatek);
  });

  it("nie zmienia układu wejściowego", () => {
    const poczatek = uklad();
    przeniesTemat(poczatek, 7, 1);
    expect(poczatek.tematy.map((temat) => temat.id)).toEqual([7, 8, 9]);
  });

  it("wynik jest pełną permutacją tematów i lekcji", () => {
    const po = cialoUkladu(przeniesTemat(uklad(), 8, -1));
    expect(po.map((temat) => temat.id).sort()).toEqual([7, 8, 9]);
    expect(po.flatMap((temat) => temat.lesson_ids).sort()).toEqual([21, 22, 23]);
  });
});

describe("przesunLekcje", () => {
  it("w środku tematu zamienia lekcję z sąsiadem", () => {
    expect(cialoUkladu(przesunLekcje(uklad(), 22, -1))[0].lesson_ids).toEqual([22, 21]);
    expect(cialoUkladu(przesunLekcje(uklad(), 21, 1))[0].lesson_ids).toEqual([22, 21]);
  });

  it("z końca tematu w dół trafia na początek następnego tematu", () => {
    expect(cialoUkladu(przesunLekcje(uklad(), 22, 1))).toEqual([
      { id: 7, lesson_ids: [21] },
      { id: 8, lesson_ids: [22, 23] },
      { id: 9, lesson_ids: [] },
    ]);
  });

  it("z początku tematu w górę trafia na koniec poprzedniego tematu", () => {
    expect(cialoUkladu(przesunLekcje(uklad(), 23, -1))).toEqual([
      { id: 7, lesson_ids: [21, 22, 23] },
      { id: 8, lesson_ids: [] },
      { id: 9, lesson_ids: [] },
    ]);
  });

  it("ostatnia lekcja w dół wchodzi do pustego tematu za nią", () => {
    expect(cialoUkladu(przesunLekcje(uklad(), 23, 1))[2].lesson_ids).toEqual([23]);
  });

  it("pierwsza lekcja kursu w górę i nieznana lekcja oddają ten sam układ", () => {
    const poczatek = uklad();
    expect(przesunLekcje(poczatek, 21, -1)).toBe(poczatek);
    expect(przesunLekcje(poczatek, 99, 1)).toBe(poczatek);
  });

  it("lekcja w ostatnim temacie na końcu w dół oddaje ten sam układ", () => {
    const poczatek: Uklad = { tematy: [{ id: 7, tytul: "Podstawy", lekcje: [21] }], tytulyLekcji: { 21: "A" } };
    expect(przesunLekcje(poczatek, 21, 1)).toBe(poczatek);
  });
});
