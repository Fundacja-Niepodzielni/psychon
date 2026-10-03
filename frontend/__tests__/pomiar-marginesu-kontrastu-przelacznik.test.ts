// @vitest-environment node
//
// Pary kontrastu atomu Przelacznik w przyrządzie scripts/pomiar-marginesu-kontrastu.mjs.
// Środowisko `node` z tego samego powodu co w pozostałych próbach przyrządu
// (liczy ścieżkę z `import.meta.url`).
//
// Próba gaśnie w obie strony: gdy przyrząd nie ma par przełącznika (brak
// pomiaru) albo gdy którakolwiek para spada poniżej progu na tokenach z
// tokeny.css (oba motywy).

import { describe, expect, it } from "vitest";
import {
  wczytajProdukcyjneTokenyTresci,
  zbudujParyDodatkoweNowegoFrontu,
} from "../scripts/pomiar-marginesu-kontrastu.mjs";

const OCZEKIWANE_STANY = [
  "tor włączony na karcie",
  "tor włączony na tle bloku",
  "kciuk włączony na torze",
  "znacznik ✓ w kciuku",
  "obrys wyłączonego na karcie",
  "obrys wyłączonego na tle bloku",
  "kciuk wyłączonego na karcie",
  "pierścień fokusu na karcie",
  "pierścień fokusu na tle bloku",
];

describe("przyrząd kontrastu: pary atomu Przelacznik", () => {
  const pary = zbudujParyDodatkoweNowegoFrontu(wczytajProdukcyjneTokenyTresci()).filter((p: { etykieta: string }) =>
    p.etykieta.includes("przełącznik"),
  );

  it("mierzy każdy stan w obu motywach (brak par = brak pomiaru)", () => {
    for (const stan of OCZEKIWANE_STANY) {
      for (const motyw of ["jasny", "ciemny"]) {
        const trafione = pary.filter(
          (p: { etykieta: string }) => p.etykieta.includes(stan) && p.etykieta.includes(`(${motyw},`),
        );
        expect(trafione.length, `${stan} / ${motyw}`).toBe(1);
      }
    }
    expect(pary.length).toBe(OCZEKIWANE_STANY.length * 2);
  });

  it("żadna para nie jest poniżej progu", () => {
    const ponizej = pary.filter((p: { margines: number }) => p.margines < 0).map((p: { etykieta: string }) => p.etykieta);
    expect(ponizej).toEqual([]);
  });
});
