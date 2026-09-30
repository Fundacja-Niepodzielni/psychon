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
} from "../../staz-kolejka/__tests__/zrodla-ekranu";

/**
 * Pomiary tekstu plików ekranu „Po programie” (uczestnik) (bez `__tests__`):
 * zero surowych przycisków, odnośników i pól oraz zdarzeń na elementach DOM,
 * zero kolorów zapisanych wprost, zero importów ze starego drzewa
 * `components/`, zero `dangerouslySetInnerHTML`, zero własnego znacznika `main`,
 * zero zakazanych zwrotów odmowy i kodów wewnętrznych w tekstach, daty wyłącznie
 * przez wspólny formater, szablon pochodzi wyłącznie z `design-system`.
 */

const PLIKI = plikiEkranu("nowy-front/po-programie-wspolpraca", ["app/(przelaczenie)/panel/dalsza-wspolpraca/page.tsx"]);
const PLIKI_KODU = PLIKI.filter((p) => /\.(ts|tsx)$/.test(p));
const PLIKI_TSX = PLIKI.filter((p) => wzgledna(p).endsWith(".tsx"));

/** Złożone z części, żeby ten plik sam nie zawierał zakazanych zwrotów. */
const ZAKAZANE_ZWROTY = [
  ["Brak dost", "ępu"],
  ["Ten widok jest dost", "ępny"],
  ["Nie masz upraw", "nień"],
].map((czesci) => czesci.join(""));

function zakazaneZwroty(kod: string): string[] {
  return ZAKAZANE_ZWROTY.filter((zwrot) => kod.includes(zwrot));
}

function kodyWewnetrzne(kod: string): string[] {
  return kod.match(/\(H[0-9]{2}\)|\bH[0-9]{2}\b/g) ?? [];
}

function dataZApiWprost(kod: string): string[] {
  return kod.match(/toLocale\w*String|Intl\.DateTimeFormat|\{[^{}]*\.(?:created_at|responded_at|updated_at)\s*\}/g) ?? [];
}

describe("ekran „Po programie” (uczestnik) — źródła", () => {
  it("pomiar nie jest pusty: dane, ekran, arkusz stylów i strona istnieją", () => {
    const nazwy = PLIKI.map(wzgledna);
    expect(nazwy).toEqual(
      expect.arrayContaining([
        "nowy-front/po-programie-wspolpraca/dane.ts",
        "nowy-front/po-programie-wspolpraca/HistoriaZgloszen.tsx",
        "nowy-front/po-programie-wspolpraca/KartaProgramuUkonczonego.tsx",
        "nowy-front/po-programie-wspolpraca/PoProgramieWspolpraca.tsx",
        "nowy-front/po-programie-wspolpraca/PoProgramieWspolpraca.module.css",
        "app/(przelaczenie)/panel/dalsza-wspolpraca/page.tsx",
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

  it("szablon DetailTemplate i formularz FormSection wyłącznie z design-system, bez okna Dialog", () => {
    const ekran = tresc(PLIKI.find((p) => wzgledna(p).endsWith("PoProgramieWspolpraca.tsx"))!);
    expect(ekran).toMatch(/import \{ DetailTemplate \} from "@\/design-system\/szablony\/DetailTemplate\/DetailTemplate";/);
    expect(ekran).toMatch(/import \{ FormSection \} from "@\/design-system\/organizmy\/FormSection\/FormSection";/);
    expect(ekran).not.toMatch(/organizmy\/Dialog\//);
  });

  it("zero zakazanych zwrotów odmowy w plikach ekranu, strony i testów", () => {
    const pliki = [...PLIKI, ...plikiEkranu("nowy-front/po-programie-wspolpraca/__tests__", [])];
    expect(pliki.flatMap((p) => zakazaneZwroty(tresc(p)).map((z) => `${wzgledna(p)}: ${z}`))).toEqual([]);
  });

  it("zero kodów wewnętrznych w plikach ekranu i strony", () => {
    expect(PLIKI_KODU.flatMap((p) => kodyWewnetrzne(tresc(p)).map((k) => `${wzgledna(p)}: ${k}`))).toEqual([]);
  });

  it("daty wyłącznie przez wspólny formater: zero własnych formaterów i pól `*_at` wprost", () => {
    const historia = tresc(PLIKI.find((p) => wzgledna(p).endsWith("HistoriaZgloszen.tsx"))!);
    const karta = tresc(PLIKI.find((p) => wzgledna(p).endsWith("KartaProgramuUkonczonego.tsx"))!);
    expect(historia).toMatch(/from "\.\.\/wspolne\/daty";/);
    expect(karta).toMatch(/from "\.\.\/wspolne\/daty";/);
    expect(PLIKI_KODU.flatMap((p) => dataZApiWprost(tresc(p)).map((t) => `${wzgledna(p)}: ${t}`))).toEqual([]);
  });

  it("ekran pyta o własne zgłoszenia wyłącznie przez dane.ts, po sprawdzeniu prawa do zgłoszenia", () => {
    const dane = tresc(PLIKI.find((p) => wzgledna(p).endsWith("po-programie-wspolpraca/dane.ts"))!);
    const indeksProfilu = dane.indexOf("pobierzJa()");
    const indeksRoli = dane.indexOf("czyRolaMozeZglaszac(ja.role)");
    const indeksProgramu = dane.indexOf("program_completed_at === null");
    const indeksHistorii = dane.indexOf("await pobierzMojeZgloszenia(");
    expect(indeksProfilu).toBeGreaterThan(-1);
    expect(indeksRoli).toBeGreaterThan(indeksProfilu);
    expect(indeksProgramu).toBeGreaterThan(indeksRoli);
    expect(indeksHistorii).toBeGreaterThan(indeksProgramu);
  });

  it("strona montuje ekran i nic więcej", () => {
    const strona = tresc(PLIKI.find((p) => wzgledna(p).endsWith("panel/dalsza-wspolpraca/page.tsx"))!);
    expect(strona).toMatch(/return <PoProgramieWspolpraca \/>;/);
  });
});

describe("pomiary źródeł — kontrole na tekście z naruszeniem", () => {
  it("wykrywa surowy przycisk, odnośnik i pole oraz zdarzenie na elemencie DOM", () => {
    const kod = `<div onClick={() => x()}><button type="button">A</button><a href="/x">B</a><input name="c" /></div>`;
    expect(surowePrzyciskiIZdarzenia(kod)).toHaveLength(4);
  });

  it("wykrywa kolor zapisany wprost, import z components/, innerHTML i własny main", () => {
    expect(twardeKolory("a { color: #1a2b3c; }")).toHaveLength(1);
    expect(importyZComponents(`import X from "@/components/ui/Button";`)).toHaveLength(1);
    expect(zawieraInnerHtml("<div dangerously" + "SetInnerHTML={{ __html: x }} />")).toBe(true);
    expect(znacznikiMain("<" + "main id=\"tresc\">")).toHaveLength(1);
  });

  it("wykrywa zakazany zwrot odmowy i kod wewnętrzny", () => {
    expect(zakazaneZwroty(`<Notice tytul="${ZAKAZANE_ZWROTY[0]}" />`)).toEqual([ZAKAZANE_ZWROTY[0]]);
    expect(kodyWewnetrzne(`opis="Odczyt (H${"01"})."`)).toEqual([`(H${"01"})`]);
  });

  it("wykrywa datę z API wypisaną wprost i własny formater", () => {
    expect(dataZApiWprost("<Hint>{zgloszenie.created_at}</Hint>")).toHaveLength(1);
    expect(dataZApiWprost("new Date(x).toLocale" + "DateString('pl-PL')")).toHaveLength(1);
    expect(dataZApiWprost("new Intl." + "DateTimeFormat('pl-PL')")).toHaveLength(1);
    expect(dataZApiWprost("<Hint>{formatujDateICzas(zgloszenie.created_at)}</Hint>")).toEqual([]);
  });
});
