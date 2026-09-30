import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Struktura plików ekranu: w kodzie pulpitów (bez testów) nie ma surowych
 * elementów interaktywnych ani obsługi `onClick=` (każdy przycisk i odnośnik
 * pochodzi z atomu, molekuły albo organizmu z rejestru celów dotyku), nie ma
 * twardych kolorów, importów z zamrożonego katalogu `components/` ani
 * `dangerouslySetInnerHTML`. Każda reguła ma kontrolę dodatnią na tekście,
 * który ją łamie.
 */

const KATALOGI = [resolve(__dirname, ".."), resolve(__dirname, "../../../app/nowy-front/pulpit")];

function plikiEkranu(katalog: string): string[] {
  return readdirSync(katalog, { withFileTypes: true }).flatMap((wpis) => {
    if (wpis.isDirectory()) return wpis.name === "__tests__" ? [] : plikiEkranu(resolve(katalog, wpis.name));
    return /\.(tsx?|css)$/.test(wpis.name) ? [resolve(katalog, wpis.name)] : [];
  });
}

// Surowy element HTML (znacznik zaczynający się małą literą) albo `onClick=` na takim
// elemencie. `<Button onClick=…>` to atom z rejestru i jest dozwolony — jego pole
// dotyku i fokus mierzą przyrządy atomów.
const SUROWE_ELEMENTY = /<(?:button|a|input|select|textarea)[\s>/]|<[a-z][a-z0-9]*\s[^>]*onClick=/;
const TWARDE_KOLORY = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;
const IMPORT_Z_COMPONENTS = /from\s+["'](?:@\/|(?:\.\.\/)+)components\//;
const WSTRZYKNIETY_HTML = /dangerouslySetInnerHTML/;

const pliki = KATALOGI.flatMap(plikiEkranu);

describe("struktura plików pulpitów", () => {
  it("obejmuje pliki ekranu i trasy", () => {
    const nazwy = pliki.map((sciezka) => sciezka.replace(/\\/g, "/"));
    expect(nazwy.some((n) => n.endsWith("nowy-front/pulpit/PulpitUczestnika.tsx"))).toBe(true);
    expect(nazwy.some((n) => n.endsWith("nowy-front/pulpit/PulpitStudenta.tsx"))).toBe(true);
    expect(nazwy.some((n) => n.endsWith("app/nowy-front/pulpit/page.tsx"))).toBe(true);
    expect(nazwy.some((n) => n.includes("__tests__"))).toBe(false);
  });

  it.each([
    { nazwa: "surowe elementy interaktywne i onClick", wzorzec: SUROWE_ELEMENTY },
    { nazwa: "twarde kolory", wzorzec: TWARDE_KOLORY },
    { nazwa: "importy z components/", wzorzec: IMPORT_Z_COMPONENTS },
    { nazwa: "wstrzykiwanie HTML", wzorzec: WSTRZYKNIETY_HTML },
  ])("brak: $nazwa", ({ wzorzec }) => {
    const trafienia = pliki.filter((sciezka) => wzorzec.test(readFileSync(sciezka, "utf8")));
    expect(trafienia).toEqual([]);
  });

  it("kontrola dodatnia: każdy wzorzec łapie tekst, który go łamie", () => {
    expect(SUROWE_ELEMENTY.test('<button type="button">')).toBe(true);
    expect(SUROWE_ELEMENTY.test('<a href="/x">')).toBe(true);
    expect(SUROWE_ELEMENTY.test("<div onClick={f}>")).toBe(true);
    expect(SUROWE_ELEMENTY.test("<Button poziom=\"primary\" onClick={f}>")).toBe(false);
    expect(SUROWE_ELEMENTY.test("<span\n  onClick={f}>")).toBe(true);
    expect(TWARDE_KOLORY.test("color: #fff;")).toBe(true);
    expect(TWARDE_KOLORY.test("color: rgb(1, 2, 3);")).toBe(true);
    expect(TWARDE_KOLORY.test("color: var(--ink);")).toBe(false);
    expect(IMPORT_Z_COMPONENTS.test('import X from "@/components/pulpit/X";')).toBe(true);
    expect(IMPORT_Z_COMPONENTS.test('import X from "@/design-system/atomy/Button/Button";')).toBe(false);
    expect(WSTRZYKNIETY_HTML.test("<div dangerouslySetInnerHTML={{ __html: x }} />")).toBe(true);
  });
});
