import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const katalog = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const strona = resolve(katalog, "../../app/nowy-front/admin/raport/page.tsx");
const api = resolve(katalog, "../../lib/api/raport-roku-programu.ts");

/** Pliki ekranu (bez testów i bez dokumentu pomiaru), strona podglądu i funkcje API ekranu. */
const pliki = [
  ...readdirSync(katalog, { withFileTypes: true })
    .filter((wpis) => wpis.isFile() && /\.(tsx?|css)$/.test(wpis.name))
    .map((wpis) => resolve(katalog, wpis.name)),
  strona,
  api,
].map((nazwa) => ({ nazwa, tresc: readFileSync(nazwa, "utf-8") }));

const tresc = (koniec: string) => pliki.find((plik) => plik.nazwa.endsWith(koniec))?.tresc ?? "";

const TWARDY_KOLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;
const IMPORT_Z_COMPONENTS = /from\s+["'](@\/components|\.\.?\/(\.\.\/)*components)\//;
const WSTRZYKNIETY_HTML = /dangerouslySetInnerHTML/;

describe("pliki ekranu raportu roku programu", () => {
  it("obejmują ekran, zestawienie, logikę, dane, style, stronę podglądu i funkcje API", () => {
    const nazwy = pliki.map((plik) => plik.nazwa.replaceAll("\\", "/"));
    for (const koniec of ["RaportRokuProgramu.tsx", "Zestawienie.tsx", "RaportRokuProgramu.module.css", "logika.ts", "dane.ts", "admin/raport/page.tsx", "lib/api/raport-roku-programu.ts"]) {
      expect(nazwy.some((nazwa) => nazwa.endsWith(koniec)), koniec).toBe(true);
    }
  });

  it.each([
    { nazwa: "twarde kolory", wzorzec: TWARDY_KOLOR },
    { nazwa: "importy z components/", wzorzec: IMPORT_Z_COMPONENTS },
    { nazwa: "wstrzykiwanie HTML", wzorzec: WSTRZYKNIETY_HTML },
  ])("brak: $nazwa", ({ wzorzec }) => {
    expect(pliki.filter((plik) => wzorzec.test(plik.tresc)).map((plik) => plik.nazwa)).toEqual([]);
  });

  it("kontrola dodatnia: każdy wzorzec łapie tekst, który go łamie", () => {
    expect(TWARDY_KOLOR.test("color: #fff;")).toBe(true);
    expect(TWARDY_KOLOR.test("color: var(--ink);")).toBe(false);
    expect(IMPORT_Z_COMPONENTS.test('import X from "@/components/ui/X";')).toBe(true);
    expect(WSTRZYKNIETY_HTML.test("<div dangerouslySetInnerHTML={x} />")).toBe(true);
  });

  it("czysta logika nie czyta ani nie zapisuje: bez api i bez efektów w logika.ts", () => {
    expect(tresc("logika.ts")).not.toMatch(/@\/lib\/api|fetch\(|useEffect|window\.|document\./);
  });

  it("bez wyboru roku, bez śledzenia aktywności i bez wykresu", () => {
    for (const plik of pliki) {
      expect(plik.tresc, plik.nazwa).not.toMatch(/edition_id|wybierz rok|w tym miesiącu|Chart|wykres/i);
    }
  });

  it("godziny jako „godz.”, nigdy jako „h” przy liczbie", () => {
    expect(tresc("logika.ts")).toMatch(/godz\./);
    for (const plik of pliki) expect(plik.tresc, plik.nazwa).not.toMatch(/\d\s?h["'`]/);
  });

  it("plik dla grantodawcy idzie wyłącznie z trasy liczb grantodawcy, zestawienie imienne — z układu zestawienia", () => {
    const funkcje = tresc("lib/api/raport-roku-programu.ts");
    expect(funkcje).toMatch(/\/admin\/report\/grantor\/export\.csv/);
    expect(funkcje).toMatch(/uklad: "zestawienie"/);
    expect(funkcje.match(/\$\{baseUrl\(\)\}\/admin\/report\/grantor\/export\.csv/g)).toHaveLength(1);
  });
});
