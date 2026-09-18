import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import postcss from "postcss";
import Badge from "@/components/ui/Badge";

// Test wiąże warianty odznaki z realnymi tokenami stylu.
//
// Warianty wyliczamy z samego pliku Badge.tsx (blok `const variants: Record<Variant, string> = {...}`),
// nie z ręcznie przepisanej listy w tym teście. Wariant o nazwie jednoczłonowej lub
// łączonej myślnikiem (np. `highlight`, `info-strong`), dopisany do typu `Variant` i do
// mapy `variants`, zostaje objęty przez ten test bez zmiany tego pliku — zmierzone przez
// dopisanie takich wariantów i sprawdzenie, że test je podchwytuje z właściwym powodem
// (brakujący wpis w mapie kończy się czytelnym niepowodzeniem, nie awarią typu
// „oczekiwaneKlasy is not iterable").
//
// Dla każdej klasy z mapy sprawdzamy, że odpowiadający jej token `--color-<nazwa>`
// jest zadeklarowany w którymkolwiek bloku `@theme { ... }` / `@theme inline { ... }`
// w app/globals.css — plik może mieć więcej niż jeden taki blok (narzędzie stylów je
// scala), więc czytamy wszystkie, nie tylko pierwszy. Plik stylów czytamy z dysku, nie
// przepisujemy listy tokenów do testu. Token zakomentowany w bloku liczy się jako
// niezadeklarowany, a brak choćby jednego bloku jest błędem testu (czerwono), nie
// cichym pominięciem.

const BADGE_SRC_PATH = path.join(__dirname, "..", "Badge.tsx");
const GLOBALS_CSS_PATH = path.join(__dirname, "..", "..", "..", "app", "globals.css");

const badgeSource = readFileSync(BADGE_SRC_PATH, "utf-8");
const globalsCss = readFileSync(GLOBALS_CSS_PATH, "utf-8");

function wyodrebnijBlokWariantow(zrodlo: string): string {
  const start = zrodlo.indexOf("const variants: Record<Variant, string> = {");
  if (start === -1) {
    throw new Error(
      "Nie znaleziono w Badge.tsx bloku `const variants: Record<Variant, string> = {...}` — zmieniono kształt komponentu, test wymaga aktualizacji.",
    );
  }
  const end = zrodlo.indexOf("};", start);
  if (end === -1) {
    throw new Error("Nie znaleziono zamknięcia bloku wariantów w Badge.tsx.");
  }
  return zrodlo.slice(start, end);
}

function wyodrebnijNazwyWariantowZTypu(zrodlo: string): string[] {
  const match = zrodlo.match(/type Variant = ([^;]+);/);
  if (!match) {
    throw new Error("Nie znaleziono definicji `type Variant = ...` w Badge.tsx.");
  }
  return Array.from(match[1].matchAll(/"([^"]+)"/g)).map((m) => m[1]);
}

// Narzędzie stylów (Tailwind v4) scala WSZYSTKIE bloki `@theme { ... }` / `@theme inline { ... }`
// napotkane w pliku — token zadeklarowany w drugim, trzecim... takim bloku istnieje i działa
// tak samo jak w pierwszym. Test musi więc czytać każdy taki blok, nie tylko pierwszy, inaczej
// zapala się na czerwono dla tokenu, który realnie jest zadeklarowany (czerwień z niewłaściwego
// powodu — zmierzone: przeniesienie tokenu do drugiego bloku `@theme` dawało fałszywy czerwony
// wynik, dopóki czytany był tylko pierwszy blok).
//
// Token pochodzi z DRZEWA DEKLARACJI, nie z tekstu. Wcześniej ten test liczył głębokość
// nawiasów klamrowych ręcznie na surowym arkuszu (z osobnym czyszczeniem komentarzy, potem
// osobnym czyszczeniem łańcuchów) — trzecia z rzędu odsłona tej samej rodziny fałszywych
// czerwieni w tym przyrządzie (komentarze, potem łańcuchy, po nich w kolejce `url()` i
// zagnieżdżone reguły z `@`). Łatanie kolejnego wyzwalacza ręcznego skanera tylko przesuwało
// termin kolejnej dziury, więc naprawa właściwa to PARSER CSS, którym front i tak buduje
// style: `postcss` (już w `package-lock.json` frontendu, żadna nowa zależność). Parser
// tokenizuje komentarze, łańcuchy i `url(...)` poprawnie z definicji — nie trzeba już samemu
// odróżniać nawiasu strukturalnego od znaku wewnątrz łańcucha czy adresu.
//
// `root.walkAtRules("theme", ...)` odwiedza KAŻDY blok `@theme` / `@theme inline` (dopasowanie
// po nazwie at-rule, parametr `inline` jest osobnym polem — nieistotnym dla wyszukiwania).
// `atRule.walkDecls(...)` zwraca wyłącznie prawdziwe deklaracje (węzły typu Declaration) —
// węzły typu Comment są przez parser odseparowane, więc zakomentowany token nigdy nie trafia
// do zbioru i nadal liczy się jako niezadeklarowany, bez żadnego dodatkowego czyszczenia.
// Brak choćby jednego bloku `@theme` jest błędem testu (czerwono), nie cichym pominięciem.
// Brak zamknięcia bloku (nawias się nie domyka) jest błędem PARSOWANIA CAŁEGO ARKUSZA —
// `postcss.parse` rzuca `CssSyntaxError` z polem `.line` wskazującym prawdziwy wiersz otwarcia
// niedomkniętego bloku w app/globals.css; ten wiersz przepisujemy do komunikatu testu.
function wyodrebnijZadeklarowaneTokenyZTheme(css: string, sciezkaPliku: string): Set<string> {
  let korzen: postcss.Root;
  try {
    korzen = postcss.parse(css, { from: sciezkaPliku });
  } catch (e) {
    if (e instanceof postcss.CssSyntaxError) {
      throw new Error(
        `Nie udało się sparsować ${sciezkaPliku}: ${e.reason} w wierszu ${e.line}, kolumna ${e.column}.`,
      );
    }
    throw e;
  }

  const tokeny = new Set<string>();
  let liczbaBlokow = 0;
  korzen.walkAtRules("theme", (atRule) => {
    liczbaBlokow++;
    atRule.walkDecls((decl) => {
      tokeny.add(decl.prop);
    });
  });

  if (liczbaBlokow === 0) {
    throw new Error(
      `Nie znaleziono w ${sciezkaPliku} żadnego bloku \`@theme { ... }\` z deklaracjami tokenów.`,
    );
  }

  return tokeny;
}

// Parsowanie linii postaci: nazwa: "klasa1 klasa2" albo "nazwa-z-myślnikiem": "klasa1 klasa2",
// ignorując linie komentarzy (`//`). Klucz może być cytowany (wymagane w TS dla nazw
// z myślnikiem) albo nie.
function wyodrebnijMapeWariantow(blok: string): Record<string, string[]> {
  const mapa: Record<string, string[]> = {};
  const linie = blok.split("\n");
  for (const linia of linie) {
    const bezKomentarza = linia.split("//")[0];
    const dopasowanie = bezKomentarza.match(/^\s*"?([\w-]+)"?:\s*"([^"]+)"/);
    if (dopasowanie) {
      const [, nazwa, klasy] = dopasowanie;
      mapa[nazwa] = klasy.trim().split(/\s+/);
    }
  }
  return mapa;
}

const nazwyZTypu = wyodrebnijNazwyWariantowZTypu(badgeSource);
const blokWariantow = wyodrebnijBlokWariantow(badgeSource);
const mapaWariantow = wyodrebnijMapeWariantow(blokWariantow);
const tokenyZTheme = wyodrebnijZadeklarowaneTokenyZTheme(globalsCss, GLOBALS_CSS_PATH);

describe("Badge — wiązanie wariantów z tokenami stylu", () => {
  it("każdy wariant z typu Variant ma wpis w mapie klas w Badge.tsx", () => {
    expect(nazwyZTypu.length).toBeGreaterThan(0);
    for (const nazwa of nazwyZTypu) {
      expect(Object.keys(mapaWariantow)).toContain(nazwa);
    }
    // Ten sam zestaw, bez rozbieżności w żadną stronę.
    expect(Object.keys(mapaWariantow).sort()).toEqual([...nazwyZTypu].sort());
  });

  // Warianty i ich klasy wyliczone dynamicznie z Badge.tsx — brak ręcznie przepisanej listy.
  for (const nazwa of nazwyZTypu) {
    describe(`wariant "${nazwa}"`, () => {
      it("odznaka niesie dokładnie klasy przypisane temu wariantowi w Badge.tsx", () => {
        const oczekiwaneKlasy = mapaWariantow[nazwa];
        expect(
          oczekiwaneKlasy,
          `wariant "${nazwa}" jest w typie Variant, ale parser mapy klas w Badge.tsx go nie znalazł — literówka albo nierozpoznany kształt klucza, nie brak tokenu`,
        ).toBeDefined();
        render(<Badge variant={nazwa as never}>Treść {nazwa}</Badge>);
        const el = screen.getByText(`Treść ${nazwa}`);

        for (const klasa of oczekiwaneKlasy) {
          expect(el).toHaveClass(klasa);
        }
        // Dokładność, nie tylko obecność: liczba klas z wariantu się zgadza
        // (reszta className elementu pochodzi ze stałych klas Badge, nie z wariantu).
        const klasyElementu = el.className.split(/\s+/);
        for (const klasa of oczekiwaneKlasy) {
          expect(klasyElementu.filter((k) => k === klasa)).toHaveLength(1);
        }
      });

      it("każda klasa tego wariantu ma odpowiadający token --color-<nazwa> w globals.css", () => {
        const klasy = mapaWariantow[nazwa];
        expect(
          klasy,
          `wariant "${nazwa}" jest w typie Variant, ale parser mapy klas w Badge.tsx go nie znalazł — literówka albo nierozpoznany kształt klucza, nie brak tokenu`,
        ).toBeDefined();
        expect(klasy.length).toBeGreaterThan(0);

        for (const klasa of klasy) {
          const dopasowaniePrefiksu = klasa.match(/^(bg|text)-(.+)$/);
          expect(
            dopasowaniePrefiksu,
            `klasa "${klasa}" wariantu "${nazwa}" nie ma prefiksu bg- ani text- — nie da się jej powiązać z tokenem --color-*`,
          ).not.toBeNull();

          const nazwaTokenu = dopasowaniePrefiksu![2];
          const zadeklarowanyWKtoryms = tokenyZTheme.has(`--color-${nazwaTokenu}`);
          expect(
            zadeklarowanyWKtoryms,
            `token --color-${nazwaTokenu} (dla klasy "${klasa}" wariantu "${nazwa}") nie jest zadeklarowany w żadnym bloku @theme w app/globals.css`,
          ).toBe(true);
        }
      });
    });
  }
});
