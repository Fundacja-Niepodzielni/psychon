import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Pomiar tekstu plików ekranu decyzji o zgłoszeniu (nie renderu): elementy
 * wyłącznie z warstwy `design-system`, brak surowych kontrolek i zdarzeń na
 * elementach DOM, brak twardych kolorów, brak wstrzykiwania HTML, brak importów
 * ze starej warstwy, cienka strona i tylko cztery trasy kontraktu.
 */

const KORZEN = process.cwd();

function pliki(katalog: string): string[] {
  const pelny = join(KORZEN, katalog);
  if (!existsSync(pelny)) return [];
  return readdirSync(pelny).flatMap((nazwa) => {
    const sciezka = join(pelny, nazwa);
    if (statSync(sciezka).isDirectory()) return nazwa === "__tests__" ? [] : pliki(relative(KORZEN, sciezka));
    return /\.(ts|tsx|css)$/.test(nazwa) ? [sciezka] : [];
  });
}

const STRONA = join(KORZEN, "app/nowy-front/admin/zgloszenia/[id]/page.tsx");
const PLIKI = [...pliki("nowy-front/zgloszenie-decyzja"), STRONA];
const tresc = (sciezka: string) => readFileSync(sciezka, "utf-8");
const nazwy = (lista: string[]) => lista.map((p) => relative(KORZEN, p).replace(/\\/g, "/"));

describe("Zgłoszenie — decyzja: źródła ekranu", () => {
  it("pomiar nie jest pusty: dane, ekran, panel, styl i strona istnieją", () => {
    expect(nazwy(PLIKI)).toEqual(
      expect.arrayContaining([
        "nowy-front/zgloszenie-decyzja/dane.ts",
        "nowy-front/zgloszenie-decyzja/ZgloszenieDecyzja.tsx",
        "nowy-front/zgloszenie-decyzja/PanelDecyzji.tsx",
        "nowy-front/zgloszenie-decyzja/ZgloszenieDecyzja.module.css",
        "app/nowy-front/admin/zgloszenia/[id]/page.tsx",
      ]),
    );
  });

  it("zero surowych <button>, <a>, <input>, <select>, <textarea>", () => {
    const zle = PLIKI.filter((p) => /<(button|a|input|select|textarea)[\s>]/.test(tresc(p)));
    expect(nazwy(zle)).toEqual([]);
  });

  it("zero onClick na elementach DOM zapisanych małą literą (atomy design-system dozwolone)", () => {
    const zle = PLIKI.filter((p) => /<[a-z][A-Za-z0-9]*[^>]*\sonClick=/.test(tresc(p)));
    expect(nazwy(zle)).toEqual([]);
  });

  it("zero twardych kolorów i zero dangerouslySetInnerHTML", () => {
    const kolory = PLIKI.filter((p) => /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/.test(tresc(p)));
    expect(nazwy(kolory)).toEqual([]);
    const html = PLIKI.filter((p) => tresc(p).includes("dangerouslySetInnerHTML"));
    expect(nazwy(html)).toEqual([]);
  });

  it("zero importów z components/ i ze starych szablonów", () => {
    const zle = PLIKI.filter((p) => /from\s+["'][^"']*(@\/components\/|components\/templates)/.test(tresc(p)));
    expect(nazwy(zle)).toEqual([]);
  });

  it("szablon wyłącznie DetailTemplate z design-system; ekran bez własnego znacznika main", () => {
    const ekran = tresc(join(KORZEN, "nowy-front/zgloszenie-decyzja/ZgloszenieDecyzja.tsx"));
    expect(ekran).toMatch(/import \{ DetailTemplate \} from "@\/design-system\/szablony\/DetailTemplate\/DetailTemplate";/);
    expect(ekran).toMatch(/<DetailTemplate\b/);
    const wzorzec = new RegExp("<" + "main\\b");
    expect(nazwy(PLIKI.filter((p) => wzorzec.test(tresc(p))))).toEqual([]);
  });

  it("strona tylko wstawia ekran (do 60 linii) i nie niesie stylu w atrybucie", () => {
    const strona = tresc(STRONA);
    expect(strona.split("\n").length).toBeLessThanOrEqual(60);
    expect(strona).toMatch(/<ZgloszenieDecyzja id=\{id\} \/>/);
    expect(strona).not.toMatch(/style=\{/);
  });

  it("dane wołają wyłącznie cztery trasy kontraktu: show, accept, reject, diploma-scan", () => {
    const dane = tresc(join(KORZEN, "nowy-front/zgloszenie-decyzja/dane.ts"));
    const adresy = [...dane.matchAll(/`(\$\{baseUrl\(\)\})?(\/admin\/applications[^`]*)`/g)].map((m) => m[2]).sort();
    expect(adresy).toEqual([
      "/admin/applications/${id}",
      "/admin/applications/${id}/accept",
      "/admin/applications/${id}/diploma-scan",
      "/admin/applications/${id}/reject",
    ]);
  });
});
