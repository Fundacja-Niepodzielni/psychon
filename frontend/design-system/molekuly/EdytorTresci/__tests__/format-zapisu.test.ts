import { Transform } from "@tiptap/pm/transform";
import { describe, expect, it } from "vitest";
import { parsujTresc } from "../../TrescLekcji/parsujTresc";
import { odciskTresci, zapiszDokument } from "../zapis";
import { otworz, schemat } from "./pomoc";

/**
 * Format tekstu, który edytor oddaje do zapisu — przykłady wejście → wyjście,
 * żeby zmiana formatu była widoczna jako czerwona próba, a nie jako inna treść
 * w bazie. Edycją jest tu zawsze litera „X” dopisana na początku jednego bloku.
 */

/** Tekst wysyłany po dopisaniu „X” na początku pierwszego tekstu bloku o podanym numerze. */
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

describe("format oddawany przez edytor: ten sam podzbiór znaczników, który czyta uczestnik", () => {
  it.each([
    ["akapity", "Pierwszy akapit.\n\nDrugi akapit.", "XPierwszy akapit.\n\nDrugi akapit."],
    ["nagłówek", "## Tytuł", "## XTytuł"],
    ["mniejszy nagłówek", "### Podtytuł", "### XPodtytuł"],
    ["pogrubienie", "To **ważne** zdanie.", "XTo **ważne** zdanie."],
    ["kursywa", "To *istotne* zdanie.", "XTo *istotne* zdanie."],
    ["lista punktowana", "- jeden\n- dwa", "- Xjeden\n- dwa"],
    ["lista numerowana", "1. jeden\n2. dwa", "1. Xjeden\n2. dwa"],
    ["kod w linii", "Wpisz `npm test` tutaj.", "XWpisz `npm test` tutaj."],
    ["twarde łamanie zapisane ukośnikiem", "pierwszy\\\ndrugi", "Xpierwszy\\\ndrugi"],
    ["link", "Zobacz [stronę](https://example.org/a).", "XZobacz [stronę](https://example.org/a)."],
  ])("%s: edytowany blok wraca w tym samym zapisie", (_nazwa, wejscie, wyjscie) => {
    expect(poEdycjiBloku(wejscie, 0)).toBe(wyjscie);
  });

  it("twarde łamanie zapisane dwiema spacjami wraca z edytowanego bloku jako ukośnik — uczestnik widzi to samo", () => {
    const wejscie = "pierwszy  \ndrugi";
    const wyjscie = poEdycjiBloku(wejscie, 0);
    expect(wyjscie).toBe("Xpierwszy\\\ndrugi");
    expect(odciskTresci(parsujTresc(wyjscie))).toBe(odciskTresci(parsujTresc(`X${wejscie}`)));
  });
});

const ZASTANA = [
  "## Cel lekcji",
  "",
  "Pierwszy akapit z **pogrubieniem**   ",
  "i drugim wierszem.",
  "",
  "",
  "*  to nie lista",
  "   - punkt z wcięciem",
  "-    punkt z odstępem",
  "",
  "3. trzy",
  "4. cztery",
  "",
  "Ostatni akapit.  ",
  "po łamaniu   ",
  "",
].join("\r\n");

describe("treść zastana po zmianie jednego znaku: przepisywany jest tylko dotknięty blok", () => {
  it("zmiana w nagłówku: reszta napisu bajt w bajt, razem z odstępami i końcami wiersza", () => {
    expect(poEdycjiBloku(ZASTANA, 0)).toBe(ZASTANA.replace("## Cel lekcji", "## XCel lekcji"));
  });

  it("zmiana w liście numerowanej: reszta napisu bajt w bajt", () => {
    expect(poEdycjiBloku(ZASTANA, 4)).toBe(ZASTANA.replace("3. trzy", "3. Xtrzy"));
  });

  it("zmiana w akapicie: jego łamanie, końcowe odstępy i nadmiarowy pusty wiersz za nim dostają zapis edytora", () => {
    expect(poEdycjiBloku(ZASTANA, 1)).toBe(
      ZASTANA.replace(
        "Pierwszy akapit z **pogrubieniem**   \r\ni drugim wierszem.\r\n\r\n\r\n",
        "XPierwszy akapit z **pogrubieniem**\\\r\ni drugim wierszem.\r\n\r\n",
      ),
    );
  });

  it("zmiana w liście punktowanej: znaczniki pozycji wracają jako „- ”, przed listą staje pusty wiersz", () => {
    expect(poEdycjiBloku(ZASTANA, 3)).toBe(
      ZASTANA.replace(
        "*  to nie lista\r\n   - punkt z wcięciem\r\n-    punkt z odstępem",
        "*  to nie lista\r\n\r\n- Xpunkt z wcięciem\r\n- punkt z odstępem",
      ),
    );
  });

  it.each([0, 1, 2, 3, 4])("zmiana w bloku %i: uczestnik widzi tę samą treść z dopisaną literą", (numer) => {
    const wynik = poEdycjiBloku(ZASTANA, numer);
    const oczekiwane = parsujTresc(ZASTANA);
    const blok = oczekiwane[numer];
    const pierwsze = blok.rodzaj === "lista" ? blok.elementy[0] : blok.dzieci;
    const tekst = pierwsze[0];
    expect(tekst.rodzaj).toBe("tekst");
    if (tekst.rodzaj === "tekst") {
      tekst.tekst = `X${tekst.tekst}`;
    }
    expect(odciskTresci(parsujTresc(wynik))).toBe(odciskTresci(oczekiwane));
  });
});

const SPOZA_PODZBIORU: [string, string][] = [
  ["tabela", "| A | B |\n|---|---|\n| 1 | 2 |"],
  ["obraz", "![Opis](/obraz.png)"],
  ["surowy HTML", '<div class="x"><b>pogrubione</b></div>'],
  ["blok kodu", "```\nconst a = 1;\n```"],
  ["cytat", "> cytat w treści"],
  ["lista w liście", "- punkt\n    - wcięty punkt"],
  ["nagłówek pierwszego poziomu", "# Tytuł pierwszego poziomu"],
];

describe("treść spoza podzbioru", () => {
  it.each(SPOZA_PODZBIORU)("%s: po edycji innego akapitu zostaje w napisie dosłownie", (_nazwa, fragment) => {
    const zrodlo = `Akapit do edycji.\n\n${fragment}\n\nOstatni akapit.`;
    expect(poEdycjiBloku(zrodlo, 0)).toBe(`X${zrodlo}`);
  });

  it.each(SPOZA_PODZBIORU)("%s: po edycji samego fragmentu żaden jego znak nie ginie z obrazu uczestnika", (_nazwa, fragment) => {
    const przed = parsujTresc(fragment);
    const po = parsujTresc(poEdycjiBloku(fragment, 0));
    expect(po).toHaveLength(przed.length);
    expect(odciskTresci(po).replace("X", "")).toBe(odciskTresci(przed));
  });
});
