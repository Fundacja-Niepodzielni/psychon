import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Pomiar tekstu plików ekranów „Certyfikaty” i „Czas nauki” (nie renderu):
 * surowe elementy, twarde kolory, importy starych komponentów, niebezpieczny
 * HTML, własny znacznik `main`, przewijanie poziome, słowo „edycja” w tekstach
 * dla osoby i przycisk główny poza oknem unieważnienia. Każdy licznik ma
 * kontrolę dodatnią na próbce z naruszeniem.
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

const PLIKI_EKRANOW = [
  ...pliki("nowy-front/certyfikaty-lista"),
  ...pliki("nowy-front/czas-nauki"),
  join(KORZEN, "app/nowy-front/admin/certyfikaty/page.tsx"),
  join(KORZEN, "app/nowy-front/admin/czas-nauki/page.tsx"),
];

const tresc = (sciezka: string) => readFileSync(sciezka, "utf-8");
const wzgledna = (sciezki: string[]) => sciezki.map((p) => relative(KORZEN, p));

function bezKomentarzy(zrodlo: string): string {
  return zrodlo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function suroweElementy(zrodlo: string): string[] {
  return bezKomentarzy(zrodlo).match(/<(button|a|input|select|textarea)[\s>/]/g) ?? [];
}

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

/** Przewijanie poziome: `overflow-x` albo `overflow` z wartością przewijającą. */
function przewijaniePoziome(zrodlo: string): string[] {
  return bezKomentarzy(zrodlo).match(/overflow(?:-x)?\s*:\s*(?:auto|scroll)/g) ?? [];
}

function slowoEdycja(zrodlo: string): string[] {
  return bezKomentarzy(zrodlo).match(/edycj\w*/gi) ?? [];
}

describe("Certyfikaty i Czas nauki — źródła ekranów", () => {
  it("pliki ekranów istnieją (pomiar nie jest pusty)", () => {
    expect(PLIKI_EKRANOW.length).toBeGreaterThanOrEqual(10);
    expect(PLIKI_EKRANOW.every((p) => existsSync(p))).toBe(true);
  });

  it("zero surowych elementów button/a/input/select/textarea", () => {
    expect(wzgledna(PLIKI_EKRANOW.filter((p) => suroweElementy(tresc(p)).length > 0))).toEqual([]);
  });

  it("zero onClick na surowych elementach", () => {
    expect(wzgledna(PLIKI_EKRANOW.filter((p) => zdarzeniaNaSurowychElementach(tresc(p)) > 0))).toEqual([]);
  });

  it("zero twardych kolorów", () => {
    expect(wzgledna(PLIKI_EKRANOW.filter((p) => twardeKolory(tresc(p)).length > 0))).toEqual([]);
  });

  it("zero importów z components/ i zero niebezpiecznego HTML", () => {
    expect(PLIKI_EKRANOW.filter((p) => importyZKomponentow(tresc(p)).length > 0)).toEqual([]);
    expect(PLIKI_EKRANOW.filter((p) => tresc(p).includes("dangerouslySetInnerHTML"))).toEqual([]);
  });

  it("jedyny main pochodzi z szablonu: ekrany go nie zapisują, a szablon jest importowany", () => {
    const wzorzec = new RegExp("<" + "main\\b");
    expect(wzgledna(PLIKI_EKRANOW.filter((p) => wzorzec.test(tresc(p))))).toEqual([]);
    for (const ekran of ["nowy-front/certyfikaty-lista/CertyfikatyLista.tsx", "nowy-front/czas-nauki/CzasNauki.tsx"]) {
      expect(tresc(join(KORZEN, ekran))).toMatch(
        /import \{ ListTemplate \} from "@\/design-system\/szablony\/ListTemplate\/ListTemplate";/,
      );
    }
  });

  it("przycisk główny (poziom primary) tylko w oknie unieważnienia", () => {
    const trafienia = PLIKI_EKRANOW.filter((p) => /poziom=["']primary["']/.test(tresc(p)));
    expect(wzgledna(trafienia)).toEqual(["nowy-front/certyfikaty-lista/OknoUniewaznienia.tsx"]);
  });

  it("zero przewijania poziomego w arkuszach stylów, a lista wierszy ma układ poniżej 640 px", () => {
    const arkusze = PLIKI_EKRANOW.filter((p) => p.endsWith(".css"));
    expect(arkusze.length).toBeGreaterThanOrEqual(3);
    expect(wzgledna(arkusze.filter((p) => przewijaniePoziome(tresc(p)).length > 0))).toEqual([]);
    const tabela = tresc(join(KORZEN, "nowy-front/certyfikaty-lista/TabelaWierszy.module.css"));
    expect(tabela).toContain("@media (max-width: 639px)");
    expect(tabela).toContain("@media (min-width: 640px)");
  });

  it("w tekstach dla osoby nie ma słowa „edycja” (mówimy „rok programu”)", () => {
    expect(wzgledna(PLIKI_EKRANOW.filter((p) => slowoEdycja(tresc(p)).length > 0))).toEqual([]);
  });
});

describe("Certyfikaty i Czas nauki — kontrola dodatnia pomiarów", () => {
  it("surowe elementy: próbka z naruszeniem jest wykryta, komentarz nie", () => {
    expect(suroweElementy('<div><button type="button">x</button><a href="/">y</a></div>')).toHaveLength(2);
    expect(suroweElementy("/* <button> w komentarzu */ <Button poziom='outline'>x</Button>")).toHaveLength(0);
  });

  it("onClick: element z małej litery liczony, atom z wielkiej nie", () => {
    expect(zdarzeniaNaSurowychElementach("<div onClick={() => f()}>x</div>")).toBe(1);
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

  it("przewijanie poziome: overflow-x i overflow: auto wykryte, overflow: hidden nie", () => {
    expect(przewijaniePoziome(".a { overflow-x: auto; }")).toHaveLength(1);
    expect(przewijaniePoziome(".a { overflow: scroll; }")).toHaveLength(1);
    expect(przewijaniePoziome(".a { overflow: hidden; }")).toHaveLength(0);
  });

  it("słowo „edycja”: odmiany wykryte, komentarz i pole `edition` nie", () => {
    expect(slowoEdycja('<p>Bieżąca edycja</p>')).toEqual(["edycja"]);
    expect(slowoEdycja("// edycja w komentarzu\nconst x = certyfikat.edition;")).toEqual([]);
  });
});
