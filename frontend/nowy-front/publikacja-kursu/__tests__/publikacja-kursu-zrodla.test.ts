import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { kluczeZasobuKursu } from "./pomocnicy";

/**
 * Pomiary źródeł ekranu „Publikacja kursu” — czytają tekst plików, nie render:
 * surowe znaczniki i programy obsługi, twarde kolory, importy ze zamrożonego
 * `components/`, wstrzykiwany HTML, własny znacznik `main`. Każdy pomiar jest
 * funkcją na tekście i ma próbę na przykładzie, który musi ją zaświecić.
 */

const KATALOG_APLIKACJI = process.cwd();

function pliki(katalog: string, rozszerzenia: RegExp): string[] {
  const pelny = join(KATALOG_APLIKACJI, katalog);
  if (!existsSync(pelny)) return [];
  return readdirSync(pelny).flatMap((nazwa) => {
    const sciezka = join(pelny, nazwa);
    if (statSync(sciezka).isDirectory()) {
      return nazwa === "__tests__" ? [] : pliki(relative(KATALOG_APLIKACJI, sciezka), rozszerzenia);
    }
    return rozszerzenia.test(nazwa) ? [sciezka] : [];
  });
}

const PLIKI_KODU = [
  ...pliki("nowy-front/publikacja-kursu", /\.(ts|tsx)$/),
  ...pliki("app/nowy-front/admin/kursy", /\.(ts|tsx)$/),
];
const PLIKI_STYLI = pliki("nowy-front/publikacja-kursu", /\.css$/);

function tresc(sciezka: string): string {
  return readFileSync(sciezka, "utf-8");
}

function nazwy(sciezki: string[]): string[] {
  return sciezki.map((s) => relative(KATALOG_APLIKACJI, s).replace(/\\/g, "/"));
}

/** Surowe elementy interaktywne: znacznik `button`, `a`, `input`, `select`, `textarea`. */
export function suroweElementy(zrodlo: string): number {
  return (zrodlo.match(/<(button|a|input|select|textarea)[\s>/]/g) ?? []).length;
}

/** `onClick=` poza atomem `Button` (albo `Link`) — programy obsługi mają siedzieć w atomach. */
export function onClickPozaAtomem(zrodlo: string): number {
  let ile = 0;
  for (const dopasowanie of zrodlo.matchAll(/onClick=/g)) {
    const przed = zrodlo.slice(0, dopasowanie.index);
    const znacznik = przed.slice(przed.lastIndexOf("<"));
    if (!/^<(Button|Link)[\s>]/.test(znacznik)) ile += 1;
  }
  return ile;
}

export function twardeKolory(zrodlo: string): number {
  const bezKomentarzy = zrodlo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const wzorce = [
    /#[0-9a-fA-F]{3,8}\b/g,
    /\b(rgb|rgba|hsl|hsla|oklch|oklab)\(/g,
    /:\s*(white|black|red|green|blue|gray|grey|orange|yellow)\b/g,
  ];
  return wzorce.reduce((suma, wzorzec) => suma + (bezKomentarzy.match(wzorzec) ?? []).length, 0);
}

export function importyZeZamrozonych(zrodlo: string): number {
  return (zrodlo.match(/from\s+["'][^"']*\/components\//g) ?? []).length;
}

export function wstrzykiwanyHtml(zrodlo: string): number {
  return (zrodlo.match(/dangerouslySetInnerHTML/g) ?? []).length;
}

export function znacznikiMain(zrodlo: string): number {
  return (zrodlo.match(new RegExp("<" + "main\\b", "g")) ?? []).length;
}

describe("pomiary — próby na przykładach, które muszą zaświecić", () => {
  it("surowe elementy", () => {
    expect(suroweElementy("<button type='button'>x</button>")).toBe(1);
    expect(suroweElementy("<a href='/'>x</a>")).toBe(1);
    expect(suroweElementy("<input />")).toBe(1);
    expect(suroweElementy("<Button poziom='outline'>x</Button>")).toBe(0);
  });

  it("onClick poza atomem", () => {
    expect(onClickPozaAtomem("<div onClick={f}>x</div>")).toBe(1);
    expect(onClickPozaAtomem("<Button poziom='outline' onClick={f}>x</Button>")).toBe(0);
    expect(onClickPozaAtomem("<Button\n poziom='outline'\n onClick={() => { f(<b />); }}>x</Button>")).toBe(0);
  });

  it("twarde kolory, importy, HTML, main", () => {
    expect(twardeKolory(".a { color: #fff; }")).toBe(1);
    expect(twardeKolory(".a { color: rgb(0, 0, 0); }")).toBe(1);
    expect(twardeKolory(".a { color: var(--ink); }")).toBe(0);
    expect(importyZeZamrozonych('import { X } from "@/components/ui/X";')).toBe(1);
    expect(importyZeZamrozonych('import { X } from "@/design-system/atomy/X/X";')).toBe(0);
    expect(wstrzykiwanyHtml("<div dangerouslySetInnerHTML={{ __html: x }} />")).toBe(1);
    expect(znacznikiMain("<" + "main id='tresc'>")).toBe(1);
  });
});

describe("źródła ekranu", () => {
  it("pliki ekranu istnieją (pomiar nie jest pusty)", () => {
    expect(nazwy(PLIKI_KODU)).toEqual(
      expect.arrayContaining([
        "nowy-front/publikacja-kursu/PublikacjaKursu.tsx",
        "nowy-front/publikacja-kursu/dane.ts",
        "app/nowy-front/admin/kursy/[id]/publikacja/page.tsx",
      ]),
    );
    expect(PLIKI_STYLI.length).toBeGreaterThanOrEqual(1);
  });

  it("zero surowych elementów interaktywnych i programów obsługi poza atomami", () => {
    expect(nazwy(PLIKI_KODU.filter((p) => suroweElementy(tresc(p)) > 0))).toEqual([]);
    expect(nazwy(PLIKI_KODU.filter((p) => onClickPozaAtomem(tresc(p)) > 0))).toEqual([]);
  });

  it("zero twardych kolorów w kodzie i w stylach", () => {
    expect(nazwy([...PLIKI_KODU, ...PLIKI_STYLI].filter((p) => twardeKolory(tresc(p)) > 0))).toEqual([]);
  });

  it("zero importów z components/ i zero wstrzykiwanego HTML", () => {
    expect(nazwy(PLIKI_KODU.filter((p) => importyZeZamrozonych(tresc(p)) > 0))).toEqual([]);
    expect(nazwy(PLIKI_KODU.filter((p) => wstrzykiwanyHtml(tresc(p)) > 0))).toEqual([]);
  });

  it("szablon formularza z warstwy design-system, ekran bez własnego main", () => {
    const ekran = tresc(join(KATALOG_APLIKACJI, "nowy-front/publikacja-kursu/PublikacjaKursu.tsx"));
    expect(ekran).toMatch(
      /import \{ FormTemplate \} from "@\/design-system\/szablony\/FormTemplate\/FormTemplate";/,
    );
    expect(ekran).toMatch(/<FormTemplate\b/);
    expect(nazwy(PLIKI_KODU.filter((p) => znacznikiMain(tresc(p)) > 0))).toEqual([]);
  });

  it("strona montuje ekran i nie niesie logiki danych", () => {
    const strona = tresc(join(KATALOG_APLIKACJI, "app/nowy-front/admin/kursy/[id]/publikacja/page.tsx"));
    expect(strona).toMatch(/<PublikacjaKursu idKursu=\{id\} \/>/);
    expect(strona).not.toMatch(/fetch\(|useState|useEffect/);
  });

  it("checklista braków to organizm PublishChecklist, bez własnej listy braków", () => {
    const ekran = tresc(join(KATALOG_APLIKACJI, "nowy-front/publikacja-kursu/PublikacjaKursu.tsx"));
    expect(ekran).toMatch(/from "@\/design-system\/organizmy\/PublishChecklist\/PublishChecklist"/);
    expect(ekran).toMatch(/<PublishChecklist\b/);
  });

  it("zasób kursu w zapleczu ma dokładnie pola, które atrapa prób odtwarza", () => {
    expect(kluczeZasobuKursu().sort()).toEqual(
      [
        "created_at",
        "description",
        "edition_id",
        "id",
        "is_published",
        "lessons_count",
        "materials_count",
        "product_group",
        "sequence_order",
        "slug",
        "title",
        "type",
        "updated_at",
      ].sort(),
    );
  });
});
