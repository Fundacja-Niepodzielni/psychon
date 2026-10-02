import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const katalog = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pliki = readdirSync(katalog, { withFileTypes: true })
  .filter((wpis) => wpis.isFile() && /\.(tsx?|css)$/.test(wpis.name))
  .map((wpis) => ({ nazwa: wpis.name, tresc: readFileSync(resolve(katalog, wpis.name), "utf-8") }));

const TWARDY_KOLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;
const IMPORT_Z_COMPONENTS = /from\s+["'](@\/components|\.\.?\/(\.\.\/)*components)\//;

describe("pliki wspólnego modułu trybu podglądu", () => {
  it("obejmują logikę, pas, hak i eksporty", () => {
    const nazwy = pliki.map((plik) => plik.nazwa).sort();
    expect(nazwy).toEqual(["PasTrybuPodgladu.module.css", "PasTrybuPodgladu.tsx", "index.ts", "tryb-podgladu.ts", "useTrybPodgladu.ts"]);
  });

  it("brak twardych kolorów, importów z components/ i wstrzykiwania HTML", () => {
    expect(pliki.filter((plik) => TWARDY_KOLOR.test(plik.tresc)).map((plik) => plik.nazwa)).toEqual([]);
    expect(pliki.filter((plik) => IMPORT_Z_COMPONENTS.test(plik.tresc)).map((plik) => plik.nazwa)).toEqual([]);
    expect(pliki.filter((plik) => /dangerouslySetInnerHTML/.test(plik.tresc)).map((plik) => plik.nazwa)).toEqual([]);
  });

  it("czysta logika nie czyta i nie zapisuje: bez api, fetch, efektów i okna", () => {
    const logika = pliki.find((plik) => plik.nazwa === "tryb-podgladu.ts");
    expect(logika?.tresc).not.toMatch(/@\/lib\/api|fetch\(|useEffect|window\.|document\./);
  });

  it("kontrola dodatnia: wzorce łapią tekst, który je łamie", () => {
    expect(TWARDY_KOLOR.test("color: #fff;")).toBe(true);
    expect(TWARDY_KOLOR.test("color: var(--ink);")).toBe(false);
    expect(IMPORT_Z_COMPONENTS.test('import X from "@/components/ui/X";')).toBe(true);
  });
});
