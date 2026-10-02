import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Struktura plików ekranów „Certyfikat” i „Dokumenty”: w kodzie (bez testów) nie ma surowych
 * elementów interaktywnych ani `onClick=` na surowym elemencie, twardych kolorów, importów z
 * zamrożonego katalogu `components/`, wstrzykiwania HTML, własnych formaterów dat ani
 * zapisanych wprost tras API poza trzema trasami certyfikatu i trasami dokumentów, które
 * wołają stare strony. Każda reguła ma kontrolę dodatnią na tekście, który ją łamie.
 */

const KATALOGI = [
  resolve(__dirname, ".."),
  resolve(__dirname, "../../../app/nowy-front/certyfikat"),
  resolve(__dirname, "../../../app/nowy-front/dokumenty"),
];

function plikiEkranu(katalog: string): string[] {
  return readdirSync(katalog, { withFileTypes: true }).flatMap((wpis) => {
    if (wpis.isDirectory()) return wpis.name === "__tests__" ? [] : plikiEkranu(resolve(katalog, wpis.name));
    return /\.(tsx?|css)$/.test(wpis.name) ? [resolve(katalog, wpis.name)] : [];
  });
}

const SUROWE_ELEMENTY = /<(?:button|a|input|select|textarea)[\s>/]|<[a-z][a-z0-9]*\s[^>]*onClick=/;
const TWARDE_KOLORY = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;
const IMPORT_Z_COMPONENTS = /from\s+["'](?:@\/|(?:\.\.\/)+)components\//;
const WSTRZYKNIETY_HTML = /dangerouslySetInnerHTML/;
const WLASNY_FORMATER_DAT = /Intl\s*\.\s*DateTimeFormat|\.\s*toLocale(?:Date|Time)?String\b/;
const TRASA_API = /["'`]\/(?:certificate|documents|me|admin|courses|lessons)[a-z\-/]*/g;

const pliki = KATALOGI.flatMap(plikiEkranu);
const tresc = (sciezka: string) => readFileSync(sciezka, "utf8");

describe("struktura plików ekranów certyfikatu i dokumentów", () => {
  it("obejmuje pliki ekranów i obie strony podglądu, bez testów", () => {
    const nazwy = pliki.map((sciezka) => sciezka.replace(/\\/g, "/"));
    expect(nazwy.some((n) => n.endsWith("nowy-front/certyfikat-dokumenty/Certyfikat.tsx"))).toBe(true);
    expect(nazwy.some((n) => n.endsWith("nowy-front/certyfikat-dokumenty/Dokumenty.tsx"))).toBe(true);
    expect(nazwy.some((n) => n.endsWith("app/nowy-front/certyfikat/page.tsx"))).toBe(true);
    expect(nazwy.some((n) => n.endsWith("app/nowy-front/dokumenty/page.tsx"))).toBe(true);
    expect(nazwy.some((n) => n.includes("__tests__"))).toBe(false);
  });

  it.each([
    { nazwa: "surowe elementy interaktywne i onClick", wzorzec: SUROWE_ELEMENTY },
    { nazwa: "twarde kolory", wzorzec: TWARDE_KOLORY },
    { nazwa: "importy z components/", wzorzec: IMPORT_Z_COMPONENTS },
    { nazwa: "wstrzykiwanie HTML", wzorzec: WSTRZYKNIETY_HTML },
    { nazwa: "własny formater dat", wzorzec: WLASNY_FORMATER_DAT },
  ])("brak: $nazwa", ({ wzorzec }) => {
    const trafienia = pliki.filter((sciezka) => wzorzec.test(tresc(sciezka)));
    expect(trafienia).toEqual([]);
  });

  it("trasy API zapisane wprost: wyłącznie trzy trasy certyfikatu, i tylko w dane.ts", () => {
    const trasy = pliki.flatMap((sciezka) =>
      (tresc(sciezka).match(TRASA_API) ?? []).map((trasa) => `${sciezka.split("/").pop()}: ${trasa.slice(1)}`),
    );
    expect(trasy.sort()).toEqual(
      ["dane.ts: /certificate/conditions", "dane.ts: /certificate/generate"].sort(),
    );
    // Trasa pobrania jest sklejana z bazą (`${baseUrl()}/certificate/download`), a dokumenty
    // idą przez moduł H14 i podpisany adres z listy — żadna z nich nie jest literałem w ekranie.
    expect(tresc(resolve(__dirname, "../dane.ts"))).toContain("/certificate/download");
  });

  it("kontrola dodatnia: każdy wzorzec łapie tekst, który go łamie", () => {
    expect(SUROWE_ELEMENTY.test('<button type="button">')).toBe(true);
    expect(SUROWE_ELEMENTY.test('<a href="/x">')).toBe(true);
    expect(SUROWE_ELEMENTY.test("<div onClick={f}>")).toBe(true);
    expect(SUROWE_ELEMENTY.test('<Button poziom="primary" onClick={f}>')).toBe(false);
    expect(TWARDE_KOLORY.test("color: #fff;")).toBe(true);
    expect(TWARDE_KOLORY.test("color: var(--ink);")).toBe(false);
    expect(IMPORT_Z_COMPONENTS.test('import X from "@/components/pulpit/X";')).toBe(true);
    expect(IMPORT_Z_COMPONENTS.test('import X from "@/design-system/atomy/Button/Button";')).toBe(false);
    expect(WSTRZYKNIETY_HTML.test("<div dangerouslySetInnerHTML={{ __html: x }} />")).toBe(true);
    expect(WLASNY_FORMATER_DAT.test('new Intl.DateTimeFormat("pl-PL")')).toBe(true);
    expect(WLASNY_FORMATER_DAT.test("data.toLocaleDateString()")).toBe(true);
    expect(WLASNY_FORMATER_DAT.test("formatujDate(iso)")).toBe(false);
    expect('api("/certificate/conditions")'.match(TRASA_API)).toEqual(['"/certificate/conditions']);
    expect('api("/documents/generate")'.match(TRASA_API)).toEqual(['"/documents/generate']);
    expect('api("/pulpit/x")'.match(TRASA_API)).toBeNull();
  });
});
