import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const KATALOG_EKRANU = resolve(__dirname, "..");
const PLIK_STRONY = resolve(__dirname, "../../../app/nowy-front/prowadzacy/page.tsx");

function plikiEkranu(): string[] {
  const pliki = readdirSync(KATALOG_EKRANU, { withFileTypes: true })
    .filter((wpis) => wpis.isFile())
    .map((wpis) => join(KATALOG_EKRANU, wpis.name));
  return [...pliki, PLIK_STRONY];
}

/** Surowe elementy kontrolek DOM (małe litery) — atomy `Button`/`Link` są dozwolone. */
const SUROWE_ELEMENTY = /<(button|a|input|select|textarea)[\s>/]/;
/** `onClick=` na elemencie pisanym małą literą (atomy piszemy wielką). */
const ZDARZENIE_NA_ELEMENCIE_DOM = /<[a-z][a-z0-9]*\s[^>]*\bonClick=/;
const TWARDY_KOLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;
const IMPORT_Z_COMPONENTS = /from\s+["']@\/components\//;
const HTML_Z_TEKSTU = /dangerouslySetInnerHTML/;

function naruszenia(wzorzec: RegExp, pliki: string[]): string[] {
  return pliki.filter((plik) => wzorzec.test(readFileSync(plik, "utf-8")));
}

describe("pliki ekranu — zakazane konstrukcje", () => {
  const pliki = plikiEkranu();

  it("obejmuje moduł danych, sekcje, ekran, arkusz i stronę", () => {
    const nazwy = pliki.map((plik) => plik.split(/[\\/]/).pop());
    expect(nazwy).toEqual(
      expect.arrayContaining(["dane.ts", "sekcje.tsx", "PulpitProwadzacego.tsx", "PulpitProwadzacego.module.css", "page.tsx"]),
    );
  });

  it("surowe button, a, input, select, textarea: 0", () => {
    expect(naruszenia(SUROWE_ELEMENTY, pliki)).toEqual([]);
  });
  it("onClick na surowym elemencie DOM: 0", () => {
    expect(naruszenia(ZDARZENIE_NA_ELEMENCIE_DOM, pliki)).toEqual([]);
  });
  it("twarde kolory: 0", () => {
    expect(naruszenia(TWARDY_KOLOR, pliki)).toEqual([]);
  });
  it("importy z components/: 0", () => {
    expect(naruszenia(IMPORT_Z_COMPONENTS, pliki)).toEqual([]);
  });
  it("wstrzykiwanie HTML: 0", () => {
    expect(naruszenia(HTML_Z_TEKSTU, pliki)).toEqual([]);
  });
});

describe("kontrola dodatnia wzorców", () => {
  it("wzorce łapią to, czego mają pilnować, i puszczają atomy", () => {
    expect(SUROWE_ELEMENTY.test('<button type="button">x</button>')).toBe(true);
    expect(SUROWE_ELEMENTY.test('<a href="/x">x</a>')).toBe(true);
    expect(SUROWE_ELEMENTY.test("<select>")).toBe(true);
    expect(SUROWE_ELEMENTY.test("<Button poziom=\"outline\">x</Button>")).toBe(false);
    expect(ZDARZENIE_NA_ELEMENCIE_DOM.test("<div className={x} onClick={() => 1}>")).toBe(true);
    expect(ZDARZENIE_NA_ELEMENCIE_DOM.test('<span\n  onClick={f}>')).toBe(true);
    expect(ZDARZENIE_NA_ELEMENCIE_DOM.test('<Button poziom="primary" onClick={() => 1}>')).toBe(false);
    expect(TWARDY_KOLOR.test("color: #fff;")).toBe(true);
    expect(TWARDY_KOLOR.test("background: rgba(0, 0, 0, .4)")).toBe(true);
    expect(TWARDY_KOLOR.test("color: var(--ink);")).toBe(false);
    expect(IMPORT_Z_COMPONENTS.test('import X from "@/components/ui/Button";')).toBe(true);
    expect(IMPORT_Z_COMPONENTS.test('import X from "@/design-system/atomy/Button/Button";')).toBe(false);
    expect(HTML_Z_TEKSTU.test("<div dangerouslySetInnerHTML={x} />")).toBe(true);
  });
});
