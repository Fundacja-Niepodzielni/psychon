import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Pomiar tekstu plików ekranu listy zgłoszeń (nie renderu): surowe elementy,
 * twarde kolory, importy starych komponentów, niebezpieczny HTML i własny
 * znacznik `main`. Każdy licznik ma kontrolę dodatnią na próbce z naruszeniem.
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

const PLIKI_EKRANU = [
  ...pliki("nowy-front/zgloszenia-lista"),
  join(KORZEN, "app/nowy-front/admin/zgloszenia/page.tsx"),
];

const tresc = (sciezka: string) => readFileSync(sciezka, "utf-8");

/** Surowe elementy DOM — znaczniki, nie teksty w komentarzach (komentarze wycinamy). */
function bezKomentarzy(zrodlo: string): string {
  return zrodlo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function suroweElementy(zrodlo: string): string[] {
  return bezKomentarzy(zrodlo).match(/<(button|a|input|select|textarea)[\s>/]/g) ?? [];
}

/** `onClick=` na elemencie pisanym małą literą (na atomach z wielkiej litery wolno). */
function zdarzeniaNaSurowychElementach(zrodlo: string): number {
  const kod = bezKomentarzy(zrodlo);
  let licznik = 0;
  for (const dopasowanie of kod.matchAll(/onClick=/g)) {
    const poczatek = kod.lastIndexOf("<", dopasowanie.index);
    if (poczatek >= 0 && /^<[a-z]/.test(kod.slice(poczatek))) licznik += 1;
  }
  return licznik;
}

function twardeKolory(zrodlo: string): string[] {
  return bezKomentarzy(zrodlo).match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g) ?? [];
}

function importyZKomponentow(zrodlo: string): string[] {
  return zrodlo.match(/from\s+["']@\/components\//g) ?? [];
}

describe("Lista zgłoszeń — źródła ekranu", () => {
  it("pliki ekranu istnieją (pomiar nie jest pusty)", () => {
    expect(PLIKI_EKRANU.length).toBeGreaterThanOrEqual(4);
    expect(PLIKI_EKRANU.every((p) => existsSync(p))).toBe(true);
  });

  it("zero surowych elementów button/a/input/select/textarea", () => {
    const trafienia = PLIKI_EKRANU.filter((p) => suroweElementy(tresc(p)).length > 0);
    expect(trafienia.map((p) => relative(KORZEN, p))).toEqual([]);
  });

  it("zero onClick na surowych elementach", () => {
    const trafienia = PLIKI_EKRANU.filter((p) => zdarzeniaNaSurowychElementach(tresc(p)) > 0);
    expect(trafienia.map((p) => relative(KORZEN, p))).toEqual([]);
  });

  it("zero twardych kolorów", () => {
    const trafienia = PLIKI_EKRANU.filter((p) => twardeKolory(tresc(p)).length > 0);
    expect(trafienia.map((p) => relative(KORZEN, p))).toEqual([]);
  });

  it("zero importów z components/ i zero niebezpiecznego HTML", () => {
    expect(PLIKI_EKRANU.filter((p) => importyZKomponentow(tresc(p)).length > 0)).toEqual([]);
    expect(PLIKI_EKRANU.filter((p) => tresc(p).includes("dangerouslySetInnerHTML"))).toEqual([]);
  });

  it("jedyny main pochodzi z szablonu: ekran go nie zapisuje, a szablon jest importowany", () => {
    const wzorzec = new RegExp("<" + "main\\b");
    expect(PLIKI_EKRANU.filter((p) => wzorzec.test(tresc(p)))).toEqual([]);
    expect(tresc(join(KORZEN, "nowy-front/zgloszenia-lista/ZgloszeniaLista.tsx"))).toMatch(
      /import \{ ListTemplate \} from "@\/design-system\/szablony\/ListTemplate\/ListTemplate";/,
    );
  });

  it("ekran nie ma przycisku głównego (poziom primary)", () => {
    const trafienia = PLIKI_EKRANU.filter((p) => /poziom=["']primary["']/.test(tresc(p)));
    expect(trafienia).toEqual([]);
  });
});

describe("Lista zgłoszeń — kontrola dodatnia pomiarów", () => {
  it("surowe elementy: próbka z naruszeniem jest wykryta, komentarz nie", () => {
    expect(suroweElementy('<div><button type="button">x</button><a href="/">y</a></div>')).toHaveLength(2);
    expect(suroweElementy("<input />")).toHaveLength(1);
    expect(suroweElementy("/* <button> w komentarzu */ <Button poziom='outline'>x</Button>")).toHaveLength(0);
  });

  it("onClick: element z małej litery liczony, atom z wielkiej nie", () => {
    expect(zdarzeniaNaSurowychElementach("<div onClick={() => f()}>x</div>")).toBe(1);
    expect(zdarzeniaNaSurowychElementach("<span\n  onClick={() => f()}>x</span>")).toBe(1);
    expect(zdarzeniaNaSurowychElementach("<Button poziom='outline' onClick={() => f()}>x</Button>")).toBe(0);
  });

  it("twarde kolory: zapis szesnastkowy i rgb wykryte, zmienna tokenu nie", () => {
    expect(twardeKolory(".a { color: #fff; }")).toHaveLength(1);
    expect(twardeKolory(".a { color: rgba(0, 0, 0, 0.5); }")).toHaveLength(1);
    expect(twardeKolory(".a { color: var(--text); }")).toHaveLength(0);
  });

  it("import z components/ wykryty", () => {
    expect(importyZKomponentow('import X from "@/components/ui/Table";')).toHaveLength(1);
    expect(importyZKomponentow('import X from "@/design-system/atomy/Button/Button";')).toHaveLength(0);
  });
});
