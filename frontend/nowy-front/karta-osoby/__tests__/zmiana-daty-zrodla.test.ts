import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Pomiar tekstu plików okna „Zmień datę dostępu” (te same zakazy, które miał
 * dawny ekran przedłużenia): surowe elementy interaktywne i zdarzenia na nich,
 * twarde kolory, wstawianie surowego HTML, importy ze starego frontu, własny
 * znacznik główny, zakazane zdania odmowy — oraz słowo „przedłużony” w tekstach.
 */

const KORZEN = process.cwd();
const PLIKI_OKNA = ["nowy-front/karta-osoby/ZmianaDatyDostepu.tsx", "nowy-front/karta-osoby/daneDostepu.ts"];

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

const tresc = (plik: string) => readFileSync(join(KORZEN, plik), "utf-8");

describe("okno zmiany daty — źródła", () => {
  it("żaden plik okna nie łamie zakazów", () => {
    const wynik = PLIKI_OKNA.map((plik) => ({ plik, naruszenia: naruszenia(tresc(plik)) })).filter(
      (wpis) => wpis.naruszenia.length > 0,
    );
    expect(wynik).toEqual([]);
  });

  it("teksty okna bez zakazanych sformułowań odmowy i bez słowa „przedłużony”", () => {
    for (const plik of PLIKI_OKNA) {
      const tekst = tresc(plik);
      expect(tekst, plik).not.toMatch(/Brak dostępu|Ten widok jest dostępny|Nie masz uprawnień/);
      expect(tekst, plik).not.toMatch(/przedłużon/i);
    }
  });

  it("detektor łapie każdy zakazany fragment na próbkach", () => {
    expect(naruszenia("<" + "button>x</button>")).toContain("surowy element interaktywny");
    expect(naruszenia('<div onClick={f}>x</div>')).toContain("zdarzenie na surowym elemencie");
    expect(naruszenia("color: #fff;")).toContain("twardy kolor");
    expect(naruszenia("<div dangerously" + "SetInnerHTML={{ __html: x }} />")).toContain("wstawianie surowego HTML");
    expect(naruszenia('import { X } from "@/components/ui/Button";')).toContain("import ze starego frontu");
    expect(naruszenia("<" + "main id=\"tresc\">")).toContain("własny znacznik główny");
    expect(naruszenia('<Button poziom="primary" onClick={f}>x</Button>')).toEqual([]);
  });

  it("okno stoi na wspólnym oknie formularza, a logika danych jest w osobnym module bez Reacta", () => {
    const okno = tresc("nowy-front/karta-osoby/ZmianaDatyDostepu.tsx");
    expect(okno).toMatch(/import \{ Dialog, type BladDialogu \} from "@\/design-system\/organizmy\/Dialog\/Dialog";/);
    expect(okno).toMatch(/wariant="formularz"/);
    expect(tresc("nowy-front/karta-osoby/daneDostepu.ts")).not.toMatch(/from "react"/);
  });
});
