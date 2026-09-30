import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Pomiary źródeł ekranu „Treść ekranu Zacznij tutaj” — czytają tekst plików
 * ekranu (bez `__tests__`), nie render. Każda reguła ma próbę na celowo złej
 * próbce: ten sam wzorzec musi ją wykryć.
 */

const KORZEN = process.cwd();
const PLIKI_EKRANU = [
  ...pliki("nowy-front/ekran-startowy"),
  join(KORZEN, "app/nowy-front/admin/ekran-startowy/page.tsx"),
];

function pliki(katalog: string): string[] {
  const pelny = join(KORZEN, katalog);
  if (!existsSync(pelny)) return [];
  return readdirSync(pelny).flatMap((nazwa) => {
    const sciezka = join(pelny, nazwa);
    if (statSync(sciezka).isDirectory()) return nazwa === "__tests__" ? [] : pliki(relative(KORZEN, sciezka));
    return /\.(ts|tsx|css)$/.test(nazwa) ? [sciezka] : [];
  });
}

const tresc = (sciezka: string) => readFileSync(sciezka, "utf-8");
const wzgledna = (sciezka: string) => relative(KORZEN, sciezka).replace(/\\/g, "/");

const SUROWE_ELEMENTY = /<(button|a|input|select|textarea)[\s>/]/;
const ZDARZENIE_NA_SUROWYM = /<[a-z][a-z0-9]*\b[^<>]*\sonClick=/;
const TWARDE_KOLORY = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;
const IMPORT_Z_COMPONENTS = /from\s+["']@\/components\//;
const INNER_HTML = /dangerouslySetInnerHTML/;
const ZNACZNIK_MAIN = new RegExp("<" + "main\\b");
const ZAKAZANE_TEKSTY = /Brak dostępu|Ten widok jest dostępny|Nie masz uprawnień|Rzetelno|Uczestniczk|Wolontariuszk|Superwizje\b|Odśwież|Edycja\b|Wprowadzenie|Powitanie|Onboarding\b/;

function trafienia(wzorzec: RegExp, pliki: string[] = PLIKI_EKRANU) {
  return pliki.filter((p) => wzorzec.test(tresc(p))).map(wzgledna);
}

describe("A-30 — źródła ekranu", () => {
  it("pliki ekranu istnieją (pomiar nie jest pusty)", () => {
    expect(PLIKI_EKRANU.length).toBeGreaterThanOrEqual(3);
    expect(PLIKI_EKRANU.every((p) => existsSync(p))).toBe(true);
  });

  it("zero surowych button/a/input/select/textarea i zero onClick na surowych elementach", () => {
    expect(trafienia(SUROWE_ELEMENTY)).toEqual([]);
    expect(trafienia(ZDARZENIE_NA_SUROWYM)).toEqual([]);
  });

  it("zero twardych kolorów, zero importów z components/, zero dangerouslySetInnerHTML", () => {
    expect(trafienia(TWARDE_KOLORY)).toEqual([]);
    expect(trafienia(IMPORT_Z_COMPONENTS)).toEqual([]);
    expect(trafienia(INNER_HTML)).toEqual([]);
  });

  it("ekran na FormTemplate z design-system, bez własnego znacznika main", () => {
    const ekran = tresc(join(KORZEN, "nowy-front/ekran-startowy/EkranStartowy.tsx"));
    expect(ekran).toMatch(/import \{ FormTemplate \} from "@\/design-system\/szablony\/FormTemplate\/FormTemplate";/);
    expect(ekran).toMatch(/<FormTemplate\b/);
    expect(trafienia(ZNACZNIK_MAIN)).toEqual([]);
  });

  it("jedna akcja główna: w plikach ekranu poziom primary nie występuje (niesie go tylko FormSection)", () => {
    expect(trafienia(/poziom=["']primary["']/)).toEqual([]);
  });

  it("teksty bez zakazanych zwrotów słownika i bez surowych kodów ról", () => {
    expect(trafienia(ZAKAZANE_TEKSTY)).toEqual([]);
    expect(trafienia(/["'](super_admin|project_manager|instructor|volunteer)["']/)).toEqual([]);
  });

  it("odmowa z powodu roli: EmptyState wariant brak-uprawnien z rolą w dopełniaczu", () => {
    const ekran = tresc(join(KORZEN, "nowy-front/ekran-startowy/EkranStartowy.tsx"));
    expect(ekran).toMatch(/wariant="brak-uprawnien"/);
    expect(ekran).toMatch(/rola="administracji"/);
  });

  it("trasy ekranu tylko /onboarding i /admin/onboarding", () => {
    const adresy = PLIKI_EKRANU.flatMap((p) => Array.from(tresc(p).matchAll(/["'`](\/[a-z][a-z0-9\-/]*)["'`]/g)).map((m) => m[1]));
    expect([...new Set(adresy.filter((a) => !a.startsWith("/nowy-front")))].sort()).toEqual(["/admin/onboarding", "/onboarding"]);
  });

  it("treść jest tekstem: render przez Text, bez molekuły Markdown ani innego renderera HTML", () => {
    const podglad = tresc(join(KORZEN, "nowy-front/ekran-startowy/PodgladEkranuStartowego.tsx"));
    expect(podglad).toMatch(/import \{ Text \} from "@\/design-system\/atomy\/Text\/Text";/);
    expect(trafienia(/TrescLekcji|innerHTML|marked|markdown-it|DOMPurify/i)).toEqual([]);
  });
});

describe("A-30 — kontrole dodatnie pomiarów", () => {
  it("każdy wzorzec wykrywa celowo złą próbkę", () => {
    expect(SUROWE_ELEMENTY.test("<button type='button'>x</button>")).toBe(true);
    expect(SUROWE_ELEMENTY.test("<a href='/x'>x</a>")).toBe(true);
    expect(SUROWE_ELEMENTY.test("<Button poziom='outline'>x</Button>")).toBe(false);
    expect(ZDARZENIE_NA_SUROWYM.test("<div onClick={() => x()}>x</div>")).toBe(true);
    expect(ZDARZENIE_NA_SUROWYM.test("<Button poziom='outline' onClick={() => x()}>x</Button>")).toBe(false);
    expect(TWARDE_KOLORY.test("color: #fff;")).toBe(true);
    expect(TWARDE_KOLORY.test("color: var(--text);")).toBe(false);
    expect(IMPORT_Z_COMPONENTS.test('import X from "@/components/ui/Button";')).toBe(true);
    expect(INNER_HTML.test("<div dangerouslySetInnerHTML={{ __html: x }} />")).toBe(true);
    expect(ZNACZNIK_MAIN.test("<main id='x'>")).toBe(true);
    expect(ZAKAZANE_TEKSTY.test("Brak dostępu do ustawień")).toBe(true);
    expect(ZAKAZANE_TEKSTY.test("Wprowadzenie do programu")).toBe(true);
    expect(ZAKAZANE_TEKSTY.test("Treść ekranu")).toBe(false);
  });
});
