import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Pomiar tekstu plików ekranu decyzji o wniosku o profil (nie renderu): elementy
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

const STRONA = join(KORZEN, "app/nowy-front/admin/profile/[id]/page.tsx");
const PLIKI = [...pliki("nowy-front/profil-decyzja"), STRONA];
const tresc = (sciezka: string) => readFileSync(sciezka, "utf-8");
const nazwy = (lista: string[]) => lista.map((p) => relative(KORZEN, p).replace(/\\/g, "/"));

describe("Wniosek o profil — decyzja: źródła ekranu", () => {
  it("pomiar nie jest pusty: dane, ekran, panel, styl i strona istnieją", () => {
    expect(nazwy(PLIKI)).toEqual(
      expect.arrayContaining([
        "nowy-front/profil-decyzja/dane.ts",
        "nowy-front/profil-decyzja/ProfilDecyzja.tsx",
        "nowy-front/profil-decyzja/PanelDecyzji.tsx",
        "nowy-front/profil-decyzja/ProfilDecyzja.module.css",
        "app/nowy-front/admin/profile/[id]/page.tsx",
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
    const ekran = tresc(join(KORZEN, "nowy-front/profil-decyzja/ProfilDecyzja.tsx"));
    expect(ekran).toMatch(/import \{ DetailTemplate \} from "@\/design-system\/szablony\/DetailTemplate\/DetailTemplate";/);
    expect(ekran).toMatch(/<DetailTemplate\b/);
    const wzorzec = new RegExp("<" + "main\\b");
    expect(nazwy(PLIKI.filter((p) => wzorzec.test(tresc(p))))).toEqual([]);
  });

  it("strona tylko wstawia ekran (do 60 linii) i nie niesie stylu w atrybucie", () => {
    const strona = tresc(STRONA);
    expect(strona.split("\n").length).toBeLessThanOrEqual(60);
    expect(strona).toMatch(/<ProfilDecyzja id=\{id\} \/>/);
    expect(strona).not.toMatch(/style=\{/);
  });

  it("dane wołają wyłącznie trasy kontraktu: show, accept, return (dokument idzie podpisanym adresem z odpowiedzi)", () => {
    const dane = tresc(join(KORZEN, "nowy-front/profil-decyzja/dane.ts"));
    const adresy = [...dane.matchAll(/`(\/admin\/profiles[^`]*)`/g)].map((m) => m[1]).sort();
    expect(adresy).toEqual(["/admin/profiles/${id}", "/admin/profiles/${id}/accept", "/admin/profiles/${id}/return"]);
    expect(dane).not.toMatch(/\/documents\//);
  });
});
