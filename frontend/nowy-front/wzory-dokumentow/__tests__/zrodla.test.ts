import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Pomiar tekstu plików ekranu „Wzory dokumentów” (bez testów): zakazane
 * elementy DOM i zdarzenia na surowych elementach, twarde kolory, wstawianie
 * surowego HTML, importy ze starego frontu, własny znacznik główny.
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

const PLIKI_EKRANU = [...pliki("nowy-front/wzory-dokumentow"), ...pliki("app/nowy-front/admin/wzory-dokumentow")];

/** Wzorce złożone z dwóch części, żeby ten plik sam nie był trafieniem pomiaru. */
const ZAKAZANE: Record<string, RegExp> = {
  "surowy element interaktywny": new RegExp("<(" + "button|a|input|select|textarea)[\\s>/]"),
  "zdarzenie na surowym elemencie": new RegExp("<[a-z][a-z0-9]*[^>]*\\son" + "Click="),
  "twardy kolor": new RegExp("#[0-9a-fA-F]{3,8}\\b|\\b(rgb|rgba|hsl|hsla)\\("),
  "wstawianie surowego HTML": new RegExp("dangerously" + "SetInnerHTML"),
  "import ze starego frontu": new RegExp("from\\s+[\"'][^\"']*components/"),
  "własny znacznik główny": new RegExp("<" + "main\\b"),
};

function naruszenia(tekst: string): string[] {
  return Object.entries(ZAKAZANE)
    .filter(([, wzorzec]) => wzorzec.test(tekst))
    .map(([nazwa]) => nazwa);
}

describe("wzory dokumentów — źródła ekranu", () => {
  it("pomiar nie jest pusty: pliki ekranu istnieją", () => {
    expect(PLIKI_EKRANU.length).toBeGreaterThanOrEqual(4);
  });

  it("żaden plik ekranu nie łamie zakazów", () => {
    const wynik = PLIKI_EKRANU.map((sciezka) => ({
      plik: relative(KORZEN, sciezka).replace(/\\/g, "/"),
      naruszenia: naruszenia(readFileSync(sciezka, "utf-8")),
    })).filter((wpis) => wpis.naruszenia.length > 0);
    expect(wynik).toEqual([]);
  });

  it("teksty ekranu bez zakazanych sformułowań odmowy", () => {
    const zakazane = /Brak dostępu|Ten widok jest dostępny|Nie masz uprawnień/;
    const trafienia = PLIKI_EKRANU.filter((sciezka) => zakazane.test(readFileSync(sciezka, "utf-8")));
    expect(trafienia.map((sciezka) => relative(KORZEN, sciezka))).toEqual([]);
    expect(zakazane.test("Brak dostępu do kursu")).toBe(true);
  });

  it("detektor łapie każdy zakazany fragment na próbkach", () => {
    expect(naruszenia("<" + "button>x</button>")).toContain("surowy element interaktywny");
    expect(naruszenia('<a href="/">x</a>')).toContain("surowy element interaktywny");
    expect(naruszenia('<div onClick={f}>x</div>')).toContain("zdarzenie na surowym elemencie");
    expect(naruszenia("color: #fff;")).toContain("twardy kolor");
    expect(naruszenia("background: rgb(0, 0, 0);")).toContain("twardy kolor");
    expect(naruszenia("<div dangerously" + "SetInnerHTML={{ __html: x }} />")).toContain("wstawianie surowego HTML");
    expect(naruszenia('import { X } from "@/components/ui/Button";')).toContain("import ze starego frontu");
    expect(naruszenia("<" + "main id=\"tresc\">")).toContain("własny znacznik główny");
    expect(naruszenia('<Button poziom="primary" onClick={f}>x</Button>')).toEqual([]);
  });

  it("ekran składa się na szablonie widoku szczegółu, a strona tylko go wstawia", () => {
    const ekran = readFileSync(join(KORZEN, "nowy-front/wzory-dokumentow/WzoryDokumentow.tsx"), "utf-8");
    expect(ekran).toMatch(
      /import \{ DetailTemplate \} from "@\/design-system\/szablony\/DetailTemplate\/DetailTemplate";/,
    );
    expect(ekran).toMatch(/<DetailTemplate\b/);
    const strona = readFileSync(join(KORZEN, "app/nowy-front/admin/wzory-dokumentow/page.tsx"), "utf-8");
    expect(strona).toMatch(/<WzoryDokumentow \/>/);
    expect(strona.split("\n").length).toBeLessThanOrEqual(60);
  });

  it("logika danych jest w osobnym module, bez Reacta", () => {
    const dane = readFileSync(join(KORZEN, "nowy-front/wzory-dokumentow/dane.ts"), "utf-8");
    expect(dane).not.toMatch(/from "react"/);
  });
});
