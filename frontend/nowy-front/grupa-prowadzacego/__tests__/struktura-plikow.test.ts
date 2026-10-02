import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Struktura plików ekranu „Moja grupa”: w kodzie (bez testów) nie ma surowych przycisków, odnośników i pól
 * (jedyny wyjątek: natywne pole daty i godziny w `PoleDatyICzasu.tsx`), twardych kolorów, importów z
 * zamrożonego katalogu `components/`, wstrzykiwania HTML, własnych formaterów dat ani tras API zapisanych
 * wprost poza `dane.ts`. Każda reguła ma kontrolę dodatnią na tekście, który ją łamie.
 */

const KATALOGI = [resolve(__dirname, ".."), resolve(__dirname, "../../../app/nowy-front/prowadzacy/grupa")];
const WYJATEK_POLA = "PoleDatyICzasu.tsx";

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

describe("struktura plików ekranu „Moja grupa”", () => {
  it("obejmuje pliki ekranu i stronę podglądu, bez testów", () => {
    const nazwy = pliki.map((sciezka) => sciezka.replace(/\\/g, "/"));
    expect(nazwy.some((n) => n.endsWith("nowy-front/grupa-prowadzacego/GrupaProwadzacego.tsx"))).toBe(true);
    expect(nazwy.some((n) => n.endsWith("app/nowy-front/prowadzacy/grupa/page.tsx"))).toBe(true);
    expect(nazwy.some((n) => n.includes("__tests__"))).toBe(false);
  });

  it.each([
    { nazwa: "surowe przyciski, odnośniki, pola i onClick", wzorzec: SUROWE_ELEMENTY },
    { nazwa: "twarde kolory", wzorzec: TWARDE_KOLORY },
    { nazwa: "importy z components/", wzorzec: IMPORT_Z_COMPONENTS },
    { nazwa: "wstrzykiwanie HTML", wzorzec: WSTRZYKNIETY_HTML },
    { nazwa: "własny formater dat", wzorzec: WLASNY_FORMATER_DAT },
  ])("brak: $nazwa (poza jednym polem daty i godziny)", ({ wzorzec }) => {
    const trafienia = pliki.filter((sciezka) => nazwaPliku(sciezka) !== WYJATEK_POLA && wzorzec.test(tresc(sciezka)));
    expect(trafienia).toEqual([]);
  });

  it("jedyny wyjątek to natywne pole daty i godziny: dokładnie jeden surowy `input` typu datetime-local", () => {
    const zrodlo = tresc(pliki.find((sciezka) => nazwaPliku(sciezka) === WYJATEK_POLA) as string);
    expect(zrodlo.match(/<input[\s>]/g)).toHaveLength(1);
    expect(zrodlo).toContain('type="datetime-local"');
    expect(zrodlo).not.toMatch(/<(?:button|a|select|textarea)[\s>/]/);
  });

  it("trasy API zapisane wprost: wyłącznie trasy grupy i tylko w dane.ts", () => {
    const trasy = pliki.flatMap((sciezka) =>
      (tresc(sciezka).match(TRASA_API) ?? []).map((trasa) => `${nazwaPliku(sciezka)}: ${trasa.slice(1)}`),
    );
    expect(trasy.sort()).toEqual(
      [
        "dane.ts: /instructor/group",
        "dane.ts: /instructor/reliability",
        "dane.ts: /instructor/slots",
        "dane.ts: /instructor/slots/",
        "dane.ts: /instructor/cases",
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
    expect('api("/instructor/cases")'.match(TRASA_API)).toEqual(['"/instructor/cases']);
    expect('api("/pulpit/x")'.match(TRASA_API)).toBeNull();
  });
});
