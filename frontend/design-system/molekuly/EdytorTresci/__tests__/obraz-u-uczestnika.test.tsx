import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Transform } from "@tiptap/pm/transform";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GRUPY } from "../../../../lib/przelaczenie/grupy";
import { TrescLekcji } from "../../TrescLekcji/TrescLekcji";
import { zapiszDokument } from "../zapis";
import { otworz, schemat } from "./pomoc";

/**
 * Blok, który osoba edytowała, edytor zapisuje od nowa — w tym samym podzbiorze
 * znaczników, ale w jednej postaci: łamanie wiersza ukośnikiem, znacznik listy
 * „- ”, jeden pusty wiersz między blokami. Tu sprawdzamy, że uczestnik widzi
 * po takim przepisaniu dokładnie to samo, co widziałby przy dotychczasowym
 * zapisie: porównanie wyrenderowanego drzewa (ten sam HTML), nie napisów.
 */

/** Tekst po dopisaniu „X” na początku pierwszego tekstu bloku o podanym numerze. */
function poEdycjiBloku(tekst: string, numer: number): string {
  const { dokument, pamiec } = otworz(tekst);
  let pozycja = -1;
  dokument.forEach((blok, przesuniecie, indeks) => {
    if (indeks !== numer) {
      return;
    }
    blok.descendants((wezel, gdzie) => {
      if (pozycja === -1 && wezel.isText) {
        pozycja = przesuniecie + 1 + gdzie;
      }
      return pozycja === -1;
    });
  });
  expect(pozycja, `blok ${numer} bez tekstu`).toBeGreaterThan(-1);
  return zapiszDokument(new Transform(dokument).insert(pozycja, schemat.text("X")).doc, pamiec);
}

/** Drzewo, które dostaje uczestnik: HTML molekuły `TrescLekcji` dla podanego tekstu. */
function obraz(tekst: string): string {
  const { container, unmount } = render(<TrescLekcji tresc={tekst} />);
  const html = container.innerHTML;
  unmount();
  return html;
}

interface Postac {
  nazwa: string;
  /** Dotychczasowy zapis. */
  przed: string;
  /** Numer edytowanego bloku. */
  blok: number;
  /** Ten sam dotychczasowy zapis z literą dopisaną ręcznie w tym samym miejscu. */
  przedZLitera: string;
  /** Zapis, który oddaje edytor. */
  po: string;
}

const POSTACIE: Postac[] = [
  {
    nazwa: "łamanie wiersza: dwie spacje → ukośnik na końcu wiersza",
    przed: "pierwszy wiersz  \ndrugi wiersz",
    blok: 0,
    przedZLitera: "Xpierwszy wiersz  \ndrugi wiersz",
    po: "Xpierwszy wiersz\\\ndrugi wiersz",
  },
  {
    nazwa: "łamanie wiersza w treści z końcami CRLF",
    przed: "pierwszy wiersz  \r\ndrugi wiersz\r\n\r\nnastępny akapit",
    blok: 0,
    przedZLitera: "Xpierwszy wiersz  \r\ndrugi wiersz\r\n\r\nnastępny akapit",
    po: "Xpierwszy wiersz\\\r\ndrugi wiersz\r\n\r\nnastępny akapit",
  },
  {
    nazwa: "znacznik listy: wcięcie i odstępy po znaczniku → „- ”",
    przed: "   - punkt z wcięciem\n-    punkt z odstępem",
    blok: 0,
    przedZLitera: "   - Xpunkt z wcięciem\n-    punkt z odstępem",
    po: "- Xpunkt z wcięciem\n- punkt z odstępem",
  },
  {
    nazwa: "pusty wiersz: kilka pustych wierszy za akapitem → jeden",
    przed: "pierwszy akapit\n\n\n\ndrugi akapit",
    blok: 0,
    przedZLitera: "Xpierwszy akapit\n\n\n\ndrugi akapit",
    po: "Xpierwszy akapit\n\ndrugi akapit",
  },
  {
    nazwa: "pusty wiersz: lista zaraz po akapicie → pusty wiersz przed listą",
    przed: "akapit przed listą\n- punkt a\n- punkt b",
    blok: 1,
    przedZLitera: "akapit przed listą\n- Xpunkt a\n- punkt b",
    po: "akapit przed listą\n\n- Xpunkt a\n- punkt b",
  },
  {
    nazwa: "pusty wiersz: akapit zaraz po nagłówku → pusty wiersz między nimi",
    przed: "## Nagłówek\nakapit zaraz po nagłówku",
    blok: 1,
    przedZLitera: "## Nagłówek\nXakapit zaraz po nagłówku",
    po: "## Nagłówek\n\nXakapit zaraz po nagłówku",
  },
];

describe("zapis edytowanego bloku a obraz u uczestnika", () => {
  it.each(POSTACIE)("$nazwa: edytor oddaje tę postać", ({ przed, blok, po }) => {
    expect(poEdycjiBloku(przed, blok)).toBe(po);
  });

  it.each(POSTACIE)("$nazwa: uczestnik widzi to samo drzewo co przy dotychczasowym zapisie", ({ przedZLitera, po }) => {
    expect(po).not.toBe(przedZLitera);
    expect(obraz(po)).toBe(obraz(przedZLitera));
  });

  it("porównanie drzew odróżnia inną treść (łamanie wiersza od zwykłego końca wiersza)", () => {
    expect(obraz("pierwszy wiersz\\\ndrugi wiersz")).not.toBe(obraz("pierwszy wiersz\ndrugi wiersz"));
    expect(obraz("- punkt")).not.toBe(obraz("punkt"));
    expect(obraz("akapit\n\ndrugi")).not.toBe(obraz("akapit\ndrugi"));
  });
});

describe("który ekran rysuje treść lekcji uczestnikowi", () => {
  const KORZEN = join(__dirname, "../../../..");

  it("adres lekcji uczestnika oddaje nowy ekran, a dotychczasowy nie rysuje treści lekcji wcale — jedynym miejscem, które ją rysuje, jest TrescLekcji", () => {
    // Adres lekcji uczestnika oddaje dziś nowy ekran (grupa przełączenia włączona); dotychczasowy ekran zostaje
    // w kodzie i nadal nie rysuje treści, więc obraz treści pilnują próby wyżej.
    expect(GRUPY.lekcja.wlaczona).toBe(true);
    const strona = readFileSync(join(KORZEN, "app/(uczestnik)/panel/lekcje/[id]/page.tsx"), "utf8");
    expect(strona).toMatch(/GRUPY\.lekcja\.wlaczona \? <LekcjaNowyEkran .*\/> : <LekcjaStaraTresc /);
    const odtwarzacz = readFileSync(join(KORZEN, "components/lesson/LessonPlayer.tsx"), "utf8");
    expect(odtwarzacz).not.toMatch(/\bcontent\b/);
    expect(odtwarzacz).not.toMatch(/dangerouslySetInnerHTML|parsujTresc|TrescLekcji/);
  });
});
