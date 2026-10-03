import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const katalog = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const strona = resolve(katalog, "../../app/nowy-front/kurs-uczestnika/[slug]/test/page.tsx");

/** Pliki ekranu (bez testów) i strona podglądu. */
const pliki = [
  ...readdirSync(katalog, { withFileTypes: true })
    .filter((wpis) => wpis.isFile() && /\.(tsx?|css)$/.test(wpis.name))
    .map((wpis) => resolve(katalog, wpis.name)),
  strona,
].map((nazwa) => ({ nazwa, tresc: readFileSync(nazwa, "utf-8") }));

const TWARDY_KOLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;
const IMPORT_Z_COMPONENTS = /from\s+["'](@\/components|\.\.?\/(\.\.\/)*components)\//;
const WSTRZYKNIETY_HTML = /dangerouslySetInnerHTML/;

describe("pliki ekranu testu końcowego", () => {
  it("obejmują ekran, logikę, dane, style i stronę podglądu", () => {
    const nazwy = pliki.map((plik) => plik.nazwa.replaceAll("\\", "/"));
    for (const koniec of ["TestUczestnika.tsx", "TestUczestnika.module.css", "TestUczestnikaZAdresu.tsx", "logika.ts", "dane.ts", "[slug]/test/page.tsx"]) {
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
    const logika = pliki.find((plik) => plik.nazwa.endsWith("logika.ts"));
    expect(logika?.tresc).not.toMatch(/@\/lib\/api|fetch\(|useEffect|window\.|document\./);
  });

  it("na telefonie przycisk wspólnego ekranu odmowy jest na całą szerokość, jak każdy przycisk treści", () => {
    const css = pliki.find((plik) => plik.nazwa.endsWith("TestUczestnika.module.css"))?.tresc ?? "";
    const telefon = css.slice(css.indexOf("@media (max-width: 639px)"));
    expect(css.includes("@media (max-width: 639px)")).toBe(true);
    expect(telefon).toMatch(/\.odmowa button\s*\{[^}]*width:\s*100%/);
  });

  it("żądania tylko na trasach dotychczasowego ekranu testu i odczycie kursu", () => {
    const dane = pliki.find((plik) => plik.nazwa.endsWith("dane.ts"))?.tresc ?? "";
    const trasy = [...dane.matchAll(/sciezka`([^`]*)`/g)].map((dopasowanie) => dopasowanie[1]).sort();
    expect(trasy).toEqual(["/courses/${slug}", "/courses/${slug}/test", "/tests/${idTestu}/attempts", "/tests/${idTestu}/attempts"]);
  });
});
