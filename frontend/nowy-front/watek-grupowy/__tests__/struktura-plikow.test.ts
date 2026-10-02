import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Struktura plików ekranu „Wątek grupowy”: w kodzie (bez testów) nie ma surowych przycisków, odnośników i pól
 *, twardych kolorów, importów z
 * zamrożonego katalogu `components/`, wstrzykiwania HTML, własnych formaterów dat ani tras API zapisanych
 * wprost poza `dane.ts`. Każda reguła ma kontrolę dodatnią na tekście, który ją łamie.
 */

const KATALOGI = [resolve(__dirname, ".."), resolve(__dirname, "../../../app/nowy-front/prowadzacy/watek-grupowy")];

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
const TRASA_API = /["'`]\/(?:instructor|threads|admin|me|courses)[a-z\-/]*/g;

const pliki = KATALOGI.flatMap(plikiEkranu);
const nazwaPliku = (sciezka: string) => sciezka.split("/").pop() ?? "";
const tresc = (sciezka: string) => readFileSync(sciezka, "utf8");

describe("struktura plików ekranu „Wątek grupowy”", () => {
  it("obejmuje pliki ekranu i stronę podglądu, bez testów", () => {
    const nazwy = pliki.map((sciezka) => sciezka.replace(/\\/g, "/"));
    expect(nazwy.some((n) => n.endsWith("nowy-front/watek-grupowy/WatekGrupowy.tsx"))).toBe(true);
    expect(nazwy.some((n) => n.endsWith("app/nowy-front/prowadzacy/watek-grupowy/page.tsx"))).toBe(true);
    expect(nazwy.some((n) => n.includes("__tests__"))).toBe(false);
  });

  it.each([
    { nazwa: "surowe przyciski, odnośniki, pola i onClick", wzorzec: SUROWE_ELEMENTY },
    { nazwa: "twarde kolory", wzorzec: TWARDE_KOLORY },
    { nazwa: "importy z components/", wzorzec: IMPORT_Z_COMPONENTS },
    { nazwa: "wstrzykiwanie HTML", wzorzec: WSTRZYKNIETY_HTML },
    { nazwa: "własny formater dat", wzorzec: WLASNY_FORMATER_DAT },
  ])("brak: $nazwa ", ({ wzorzec }) => {
    const trafienia = pliki.filter((sciezka) => wzorzec.test(tresc(sciezka)));
    expect(trafienia).toEqual([]);
  });

  it("trasy API zapisane wprost: wyłącznie trasy grupy i tylko w dane.ts", () => {
    const trasy = pliki.flatMap((sciezka) =>
      (tresc(sciezka).match(TRASA_API) ?? []).map((trasa) => `${nazwaPliku(sciezka)}: ${trasa.slice(1)}`),
    );
    expect(trasy.sort()).toEqual(
      [
        "dane.ts: /threads",
        "dane.ts: /threads",
        "dane.ts: /threads/",
        "dane.ts: /threads/",
        "dane.ts: /threads/",
        "dane.ts: /threads/",
        "dane.ts: /threads/",
      ].sort(),
    );
  });

  it("kontrola dodatnia: każdy wzorzec łapie tekst, który go łamie", () => {
    expect(SUROWE_ELEMENTY.test('<button type="button">')).toBe(true);
    expect(SUROWE_ELEMENTY.test('<a href="/x">')).toBe(true);
    expect(SUROWE_ELEMENTY.test('<input type="text" />')).toBe(true);
    expect(SUROWE_ELEMENTY.test("<div onClick={f}>")).toBe(true);
    expect(SUROWE_ELEMENTY.test('<Button poziom="primary" onClick={f}>')).toBe(false);
    expect(TWARDE_KOLORY.test("color: #fff;")).toBe(true);
    expect(TWARDE_KOLORY.test("color: var(--ink);")).toBe(false);
    expect(IMPORT_Z_COMPONENTS.test('import X from "@/components/h12/X";')).toBe(true);
    expect(WSTRZYKNIETY_HTML.test("<div dangerouslySetInnerHTML={{ __html: x }} />")).toBe(true);
    expect(WLASNY_FORMATER_DAT.test("data.toLocaleString()")).toBe(true);
    expect('api("/threads")'.match(TRASA_API)).toEqual(['"/threads']);
    expect('api("/pulpit/x")'.match(TRASA_API)).toBeNull();
  });
});
