import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Straż jednego formatera liczb dziesiętnych. W kodzie produkcyjnym nowego
 * frontu funkcja `formatujDziesietny` ma dokładnie jedną definicję
 * (`wspolne/formatuj-dziesietny.ts`), a `Intl.NumberFormat` występuje tylko w
 * tym pliku — żaden ekran nie składa własnego formatu godzin. Wyjątek:
 * katalogi `__tests__`.
 */

const KORZEN = join(__dirname, "..", "..");
const WSPOLNY = join(KORZEN, "wspolne", "formatuj-dziesietny.ts");
const DEFINICJA = /(?:function|const)\s+formatujDziesietny\b/;
const WLASNY_FORMAT = /Intl\s*\.\s*NumberFormat/;

function pliki(katalog: string): string[] {
  return readdirSync(katalog, { withFileTypes: true }).flatMap((wpis) => {
    const sciezka = join(katalog, wpis.name);
    if (wpis.isDirectory()) return wpis.name === "__tests__" || wpis.name === "node_modules" ? [] : pliki(sciezka);
    return /\.(ts|tsx)$/.test(wpis.name) ? [sciezka] : [];
  });
}

function wzgledna(sciezka: string): string {
  return relative(KORZEN, sciezka).split(sep).join("/");
}

function pliki_z(wzorzec: RegExp): string[] {
  return pliki(KORZEN)
    .filter((sciezka) => wzorzec.test(readFileSync(sciezka, "utf-8")))
    .map(wzgledna);
}

describe("jeden formater liczb dziesiętnych nowego frontu", () => {
  it("przegląda kod produkcyjny (kontrola, że straż nie patrzy w pustkę)", () => {
    expect(pliki(KORZEN).length).toBeGreaterThan(50);
    expect(pliki(KORZEN)).toContain(WSPOLNY);
  });

  it("wzorce rozpoznają definicję i własny format liczb", () => {
    expect(DEFINICJA.test("export function formatujDziesietny(tekst: string) {")).toBe(true);
    expect(DEFINICJA.test("const formatujDziesietny = (t: string) => t;")).toBe(true);
    expect(DEFINICJA.test("import { formatujDziesietny } from")).toBe(false);
    expect(WLASNY_FORMAT.test('new Intl.NumberFormat("pl-PL")')).toBe(true);
  });

  it("funkcja ma jedną definicję: wspolne/formatuj-dziesietny.ts", () => {
    expect(pliki_z(DEFINICJA)).toEqual(["wspolne/formatuj-dziesietny.ts"]);
  });

  it("Intl.NumberFormat stoi wyłącznie we wspólnym formaterze", () => {
    expect(pliki_z(WLASNY_FORMAT)).toEqual(["wspolne/formatuj-dziesietny.ts"]);
  });
});
