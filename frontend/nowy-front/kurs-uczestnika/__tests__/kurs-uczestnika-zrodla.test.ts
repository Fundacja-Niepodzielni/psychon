import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const katalog = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trasy = [
  resolve(katalog, "../../app/nowy-front/kurs-uczestnika"),
  resolve(katalog, "../../app/(uczestnik)/panel/kursy/[slug]"),
];

/** Pliki katalogu bez testów; `wglab: false` pomija podkatalogi (strona testu kursu pod `[slug]/test` nie jest częścią tego ekranu). */
function pliki(dir: string, wglab = true): { nazwa: string; tresc: string }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((wpis) => {
    const sciezka = resolve(dir, wpis.name);
    if (wpis.isDirectory()) return wpis.name === "__tests__" || !wglab ? [] : pliki(sciezka);
    return /\.(tsx?|css)$/.test(wpis.name) ? [{ nazwa: sciezka, tresc: readFileSync(sciezka, "utf-8") }] : [];
  });
}

/** Pliki ekranu i jego tras. Dotychczasowa treść strony (`StaraTresc.tsx`) jest zamrożona i nie podlega regułom nowego frontu. */
const ekran = [...pliki(katalog), ...trasy.flatMap((trasa) => pliki(trasa, trasa.replaceAll("\\", "/").includes("app/nowy-front/"))).filter((plik) => !plik.nazwa.endsWith("StaraTresc.tsx"))];

const TWARDY_KOLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;
const IMPORT_Z_COMPONENTS = /from\s+["'](@\/components|\.\.?\/(\.\.\/)*components)\//;
const POLE_FORMULARZA = /<(input|select|textarea)[\s>/]/;
const WSTRZYKNIETY_HTML = /dangerouslySetInnerHTML/;

describe("pliki ekranu kursu uczestnika", () => {
  it("obejmują ekran, logikę, dane, style i trasy", () => {
    const nazwy = ekran.map((plik) => plik.nazwa.replaceAll("\\", "/"));
    for (const koniec of ["kurs-uczestnika/KursUczestnika.tsx", "kurs-uczestnika/KursUczestnika.module.css", "kurs-uczestnika/logika.ts", "kurs-uczestnika/dane.ts", "app/nowy-front/kurs-uczestnika/[slug]/page.tsx", "kursy/[slug]/NowyEkran.tsx", "kursy/[slug]/page.tsx"]) {
      expect(nazwy.some((nazwa) => nazwa.endsWith(koniec)), koniec).toBe(true);
    }
    expect(nazwy.some((nazwa) => nazwa.includes("__tests__"))).toBe(false);
  });

  it.each([
    { nazwa: "twarde kolory", wzorzec: TWARDY_KOLOR },
    { nazwa: "importy z components/", wzorzec: IMPORT_Z_COMPONENTS },
    { nazwa: "pola formularza", wzorzec: POLE_FORMULARZA },
    { nazwa: "wstrzykiwanie HTML", wzorzec: WSTRZYKNIETY_HTML },
  ])("brak: $nazwa", ({ wzorzec }) => {
    expect(ekran.filter((plik) => wzorzec.test(plik.tresc)).map((plik) => plik.nazwa)).toEqual([]);
  });

  it("kontrola dodatnia: każdy wzorzec łapie tekst, który go łamie", () => {
    expect(TWARDY_KOLOR.test("color: #fff;")).toBe(true);
    expect(TWARDY_KOLOR.test("color: rgb(1, 2, 3);")).toBe(true);
    expect(TWARDY_KOLOR.test("color: var(--ink);")).toBe(false);
    expect(IMPORT_Z_COMPONENTS.test('import X from "@/components/ui/X";')).toBe(true);
    expect(IMPORT_Z_COMPONENTS.test('import X from "@/design-system/atomy/X/X";')).toBe(false);
    expect(POLE_FORMULARZA.test("<input type='text'>")).toBe(true);
    expect(POLE_FORMULARZA.test("<Input />")).toBe(false);
    expect(WSTRZYKNIETY_HTML.test("<div dangerouslySetInnerHTML={x} />")).toBe(true);
  });

  it("ekran nie dotyka rzeczy poza swoim zakresem: bez materiałów kursu i pytania do prowadzącego", () => {
    const tsx = ekran.filter((plik) => /KursUczestnika\.tsx$|logika\.ts$/.test(plik.nazwa));
    expect(tsx).toHaveLength(2);
    for (const plik of tsx) {
      expect(plik.tresc, plik.nazwa).not.toMatch(/Zadaj pytanie|download_url|materials/);
    }
  });

  it("czysta logika nie czyta ani nie zapisuje: bez api i bez efektów w logika.ts", () => {
    const logika = ekran.find((plik) => plik.nazwa.endsWith("logika.ts"));
    expect(logika?.tresc).not.toMatch(/@\/lib\/api|fetch\(|useEffect|window\./);
  });
});
