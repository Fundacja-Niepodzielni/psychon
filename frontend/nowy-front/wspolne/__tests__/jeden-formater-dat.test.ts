import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Straż jednego formatera dat. W kodzie produkcyjnym nowego frontu żaden ekran
 * nie składa własnego `Intl.DateTimeFormat` ani nie woła `toLocaleString`,
 * `toLocaleDateString`, `toLocaleTimeString` — każda data i godzina przechodzi
 * przez `wspolne/daty.ts` (`formatujDate`, `formatujDateICzas`). Wyjątki:
 * sam `daty.ts` i katalogi `__tests__`.
 */

const KORZEN = join(__dirname, "..", "..");
const WZORZEC = /Intl\s*\.\s*DateTimeFormat|\.\s*toLocale(?:Date|Time)?String\b/;

function pliki(katalog: string): string[] {
  return readdirSync(katalog, { withFileTypes: true }).flatMap((wpis) => {
    const sciezka = join(katalog, wpis.name);
    if (wpis.isDirectory()) return wpis.name === "__tests__" || wpis.name === "node_modules" ? [] : pliki(sciezka);
    return /\.(ts|tsx)$/.test(wpis.name) ? [sciezka] : [];
  });
}

function trafienia(korzen: string): string[] {
  const wspolny = join(korzen, "wspolne", "daty.ts");
  return pliki(korzen)
    .filter((sciezka) => sciezka !== wspolny)
    .flatMap((sciezka) =>
      readFileSync(sciezka, "utf-8")
        .split(/\r?\n/)
        .flatMap((wiersz, indeks) =>
          WZORZEC.test(wiersz)
            ? [`${relative(korzen, sciezka).split(sep).join("/")}:${indeks + 1}: ${wiersz.trim()}`]
            : [],
        ),
    );
}

describe("jeden formater dat nowego frontu", () => {
  it("przegląda kod produkcyjny (kontrola, że straż nie patrzy w pustkę)", () => {
    expect(pliki(KORZEN).length).toBeGreaterThan(50);
  });

  it("wzorzec rozpoznaje własny formater i wszystkie warianty toLocale*", () => {
    expect(WZORZEC.test('new Intl.DateTimeFormat("pl-PL")')).toBe(true);
    expect(WZORZEC.test("data.toLocaleString()")).toBe(true);
    expect(WZORZEC.test("data.toLocaleDateString()")).toBe(true);
    expect(WZORZEC.test("data.toLocaleTimeString()")).toBe(true);
    expect(WZORZEC.test("formatujDateICzas(iso)")).toBe(false);
  });

  it("poza wspolne/daty.ts nie ma ani jednego własnego formatera dat", () => {
    const lista = trafienia(KORZEN);
    expect(lista, `Własny formater dat poza wspolne/daty.ts:\n${lista.join("\n")}`).toEqual([]);
  });
});
