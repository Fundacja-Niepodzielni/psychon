import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const katalog = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const strony = [
  resolve(katalog, "../../app/nowy-front/admin/testy/[id]/pytania/page.tsx"),
  resolve(katalog, "../../app/nowy-front/prowadzacy/testy/[id]/pytania/page.tsx"),
];

/** Pliki ekranu (bez testów i bez dokumentu pomiaru) i dwie strony podglądu. */
const pliki = [
  ...readdirSync(katalog, { withFileTypes: true })
    .filter((wpis) => wpis.isFile() && /\.(tsx?|css)$/.test(wpis.name))
    .map((wpis) => resolve(katalog, wpis.name)),
  ...strony,
].map((nazwa) => ({ nazwa, tresc: readFileSync(nazwa, "utf-8") }));

const TWARDY_KOLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;
const IMPORT_Z_COMPONENTS = /from\s+["'](@\/components|\.\.?\/(\.\.\/)*components)\//;
const WSTRZYKNIETY_HTML = /dangerouslySetInnerHTML/;

describe("pliki ekranu pytań testu", () => {
  it("obejmują ekran, formularz, logikę, dane, style i obie strony podglądu", () => {
    const nazwy = pliki.map((plik) => plik.nazwa.replaceAll("\\", "/"));
    for (const koniec of ["PytaniaTestu.tsx", "FormularzPytania.tsx", "PytaniaTestu.module.css", "logika.ts", "dane.ts", "admin/testy/[id]/pytania/page.tsx", "prowadzacy/testy/[id]/pytania/page.tsx"]) {
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

  it("żądania tylko na trasach banku pytań: administracji (`/admin/…`) i prowadzącego (`/instructor/…`), wyłącznie w dane.ts", () => {
    const dane = pliki.find((plik) => plik.nazwa.endsWith("dane.ts"))?.tresc ?? "";
    const trasy = [...dane.matchAll(/sciezka`([^`]*)`/g)].map((dopasowanie) => dopasowanie[1]).sort();
    expect(trasy).toEqual([
      "/admin/questions/${idPytania}",
      "/admin/tests/${idTestu}/questions",
      "/instructor/questions/${idPytania}",
      "/instructor/tests/${idTestu}/questions",
    ]);
    const trasaSerwera = /["'`]\/(admin|instructor)\/(tests|questions)\b/;
    expect(pliki.filter((plik) => !plik.nazwa.endsWith("dane.ts") && trasaSerwera.test(plik.tresc)).map((plik) => plik.nazwa)).toEqual([]);
  });

  it("obie strony podglądu montują ten sam ekran, różnią się tylko panelem", () => {
    const [admin, prowadzacy] = strony.map((sciezka) => readFileSync(sciezka, "utf-8"));
    expect(admin).toContain('panel="administracja"');
    expect(prowadzacy).toContain('panel="prowadzacy"');
    for (const tresc of [admin, prowadzacy]) expect(tresc).toContain('from "@/nowy-front/pytania-testu/PytaniaTestu"');
  });

  it("telefon (do 639 px): przyciski w treści — wiersza, stanu pustego, ponowienia i odpowiedzi w oknie — na pełną szerokość", () => {
    const css = pliki.find((plik) => plik.nazwa.endsWith("PytaniaTestu.module.css"))?.tresc ?? "";
    const telefon = css.slice(css.lastIndexOf("@media (max-width: 639px)"));
    const regula = /([^{}]+)\{[^{}]*width:\s*100%[^{}]*\}/g;
    const selektory = [...telefon.matchAll(regula)].flatMap((trafienie) => trafienie[1].split(",").map((selektor) => selektor.trim()));
    for (const oczekiwany of [".akcje button", ".pusty button", ".ponow button", ".przyciskiOdpowiedzi button"]) {
      expect(selektory, oczekiwany).toContain(oczekiwany);
    }
  });
});
