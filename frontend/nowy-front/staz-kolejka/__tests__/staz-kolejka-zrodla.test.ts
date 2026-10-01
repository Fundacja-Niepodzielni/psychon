import { describe, expect, it } from "vitest";
import {
  importyZComponents,
  plikiEkranu,
  surowePrzyciskiIZdarzenia,
  tresc,
  twardeKolory,
  wzgledna,
  zawieraInnerHtml,
  znacznikiMain,
} from "./zrodla-ekranu";

/**
 * Pomiary tekstu plików ekranu decyzji o dyżurach (bez `__tests__`): zero
 * surowych przycisków, odnośników i pól oraz zdarzeń na elementach DOM, zero
 * kolorów zapisanych wprost, zero importów ze starego drzewa `components/`,
 * zero `dangerouslySetInnerHTML`, zero własnego znacznika `main`, a szablon
 * pochodzi wyłącznie z `design-system`.
 */

const PLIKI = plikiEkranu("nowy-front/staz-kolejka", ["app/nowy-front/admin/staz/page.tsx"]);
const PLIKI_KODU = PLIKI.filter((p) => /\.(ts|tsx)$/.test(p));
const PLIKI_TSX = PLIKI.filter((p) => wzgledna(p).endsWith(".tsx"));

describe("ekran decyzji o dyżurach — źródła", () => {
  it("pomiar nie jest pusty: moduł danych, ekran, arkusz stylów i strona istnieją", () => {
    const nazwy = PLIKI.map(wzgledna);
    expect(nazwy).toEqual(
      expect.arrayContaining([
        "nowy-front/staz-kolejka/dane.ts",
        "nowy-front/staz-kolejka/StazKolejka.tsx",
        "nowy-front/staz-kolejka/PanelDyzuru.tsx",
        "nowy-front/staz-kolejka/StazKolejka.module.css",
        "app/nowy-front/admin/staz/page.tsx",
      ]),
    );
  });

  it("zero surowych przycisków, odnośników, pól i zdarzeń na elementach DOM", () => {
    const trafienia = PLIKI_TSX.flatMap((p) => surowePrzyciskiIZdarzenia(tresc(p)).map((t) => `${wzgledna(p)}: ${t}`));
    expect(trafienia).toEqual([]);
  });

  it("zero kolorów zapisanych wprost (kod i arkusz stylów)", () => {
    const trafienia = PLIKI.flatMap((p) => twardeKolory(tresc(p)).map((k) => `${wzgledna(p)}: ${k}`));
    expect(trafienia).toEqual([]);
  });

  it("zero importów z components/, zero dangerouslySetInnerHTML, zero własnego main", () => {
    expect(PLIKI_KODU.flatMap((p) => importyZComponents(tresc(p)))).toEqual([]);
    expect(PLIKI_KODU.filter((p) => zawieraInnerHtml(tresc(p))).map(wzgledna)).toEqual([]);
    expect(PLIKI_KODU.filter((p) => znacznikiMain(tresc(p)).length > 0).map(wzgledna)).toEqual([]);
  });

  it("szablon ListTemplate wyłącznie z design-system, formularz decyzji z FormSection w panelu", () => {
    const ekran = tresc(PLIKI.find((p) => wzgledna(p).endsWith("StazKolejka.tsx"))!);
    const panel = tresc(PLIKI.find((p) => wzgledna(p).endsWith("PanelDyzuru.tsx"))!);
    expect(ekran).toMatch(/import \{ ListTemplate \} from "@\/design-system\/szablony\/ListTemplate\/ListTemplate";/);
    expect(panel).toMatch(/import \{ FormSection \} from "@\/design-system\/organizmy\/FormSection\/FormSection";/);
    expect(ekran + panel).not.toMatch(/organizmy\/Dialog\//);
  });

  it("wiersz to ListRow z design-system, wiek z sprawy/wiek.ts bez kopii progu i tekstu", () => {
    const ekran = tresc(PLIKI.find((p) => wzgledna(p).endsWith("StazKolejka.tsx"))!);
    const dane = tresc(PLIKI.find((p) => wzgledna(p).endsWith("staz-kolejka/dane.ts"))!);
    expect(ekran).toMatch(/import \{ ListRow \} from "@\/design-system\/molekuly\/ListRow\/ListRow";/);
    expect(ekran).toMatch(
      /import \{ dniOczekiwania, tekstPlakietkiCzekania, wariantPlakietkiCzekania \} from "\.\.\/sprawy\/wiek";/,
    );
    expect(ekran + dane).not.toMatch(/PROG_OSTRZEZENIA_DNI\s*=|MS_NA_DOBE|24 \* 60 \* 60|czeka \$\{|"dzień"|"dni"/);
  });

  it("godziny na ekranie przechodzą przez wspólny formater liczb dziesiętnych, bez własnego formatu", () => {
    const ekran = tresc(PLIKI.find((p) => wzgledna(p).endsWith("StazKolejka.tsx"))!);
    const panel = tresc(PLIKI.find((p) => wzgledna(p).endsWith("PanelDyzuru.tsx"))!);
    const dane = tresc(PLIKI.find((p) => wzgledna(p).endsWith("staz-kolejka/dane.ts"))!);
    expect(panel).toMatch(/import \{ formatujDziesietny \} from "\.\.\/wspolne\/formatuj-dziesietny";/);
    expect(panel).toMatch(/formatujDziesietny\(wpis\.hours\)/);
    expect(ekran + panel + dane).not.toMatch(/Intl\.NumberFormat|toFixed|toLocaleString/);
    // Surowy zapis godzin wpisu (`${wpis.hours} h`) bez formatera jest naruszeniem.
    expect(ekran + panel).not.toMatch(/\$\{wpis\.hours\}/);
  });

  it("data dyżuru przechodzi przez wspólny formater dat, ekran nie ma własnego", () => {
    const ekran = tresc(PLIKI.find((p) => wzgledna(p).endsWith("StazKolejka.tsx"))!);
    const dane = tresc(PLIKI.find((p) => wzgledna(p).endsWith("staz-kolejka/dane.ts"))!);
    expect(ekran).toMatch(/import \{ formatujDate \} from "\.\.\/wspolne\/daty";/);
    expect(ekran).toMatch(/formatujDate\(wpis\.date\)/);
    expect(ekran + dane).not.toMatch(/dataPolska|Intl\.DateTimeFormat|toLocale/);
  });

  it("strona montuje ekran i nic więcej", () => {
    const strona = tresc(PLIKI.find((p) => wzgledna(p).endsWith("admin/staz/page.tsx"))!);
    expect(strona).toMatch(/return <StazKolejka \/>;/);
  });
});

describe("pomiary źródeł — kontrole na tekście z naruszeniem", () => {
  it("wykrywa surowy przycisk, odnośnik i pole", () => {
    const kod = `<div><button type="button">A</button><a href="/x">B</a><input name="c" /></div>`;
    expect(surowePrzyciskiIZdarzenia(kod)).toHaveLength(3);
  });

  it("wykrywa zdarzenie na elemencie DOM także z funkcją strzałkową w atrybucie", () => {
    const kod = `<div className="x" onClick={() => zrob(1)}>A</div>`;
    expect(surowePrzyciskiIZdarzenia(kod)).toHaveLength(1);
  });

  it("zdarzenie na komponencie (wielka litera) nie jest naruszeniem", () => {
    const kod = `<Button poziom="quiet" onClick={() => zrob(1)}>A</Button>`;
    expect(surowePrzyciskiIZdarzenia(kod)).toEqual([]);
  });

  it("wykrywa kolor zapisany wprost, import z components/, innerHTML i własny main", () => {
    expect(twardeKolory("a { color: #1a2b3c; background: rgb(1, 2, 3); }")).toHaveLength(2);
    expect(importyZComponents(`import X from "@/components/ui/Button";`)).toHaveLength(1);
    expect(zawieraInnerHtml("<div dangerously" + "SetInnerHTML={{ __html: x }} />")).toBe(true);
    expect(znacznikiMain("<" + "main id=\"tresc\">")).toHaveLength(1);
  });
});
