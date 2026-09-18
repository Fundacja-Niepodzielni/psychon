import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import postcss from "postcss";
import ts from "typescript";
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

// Mapę wariantów czytamy z DRZEWA SKŁADNIOWEGO pliku Badge.tsx, nie z tekstu.
// Wcześniej ten fragment szukał końca bloku `const variants = {...}` tekstowo —
// `indexOf("};", start)` — czyli pierwszym wystąpieniem znaków `};` PO POZYCJI
// startu, bez rozróżniania, czy te znaki są składnią, czy treścią komentarza
// albo łańcucha. Zwykły komentarz w bloku wariantów zawierający `};` (np. przykład
// literału obiektu w opisie) ucinał blok w środku — zmierzone: komentarz z takim
// tekstem między wpisami `neutral` i `success` dawał 5 z 6 wariantów fałszywie
// nieznalezionych (test poniżej "błąd odbioru: komentarz..."). To druga odsłona tej
// samej rodziny błędów co w `wyodrebnijZadeklarowaneTokenyZTheme` wyżej — nawias i
// średnik bywają treścią, nie składnią, więc parser jest jedynym sposobem odróżnienia.
//
// Zamiast osobnego "wytnij blok tekstem" + "sparsuj linie tekstem" (obie manualne),
// jedna funkcja czyta CAŁY plik przez kompilator TypeScript (`ts.createSourceFile`,
// już bezpośrednia zależność narzędziowa frontu — `typescript` w `devDependencies`)
// i idzie prosto do węzłów AST: `PropertyAssignment` wewnątrz `ObjectLiteralExpression`
// przypisanego do zmiennej `variants`. Węzły komentarzy w ogóle nie istnieją w tym
// drzewie (kompilator odkłada je jako trivia dołączone do sąsiednich tokenów, nie jako
// składniki wyrażenia) — komentarz z `};` w środku nie ma żadnego wpływu na to, gdzie
// kończy się obiekt, bo AST i tak wie, gdzie jest prawdziwy `}` zamykający wyrażenie.
// Wartości czytamy tylko z węzłów `StringLiteral` (`.text` kompilatora, czyli już
// zdekodowany łańcuch — znaki ucieczki jak `\"` rozwiązane przez parser, nie ręcznie).
// Właściwość, której wartość nie jest literałem tekstowym (np. spread, wywołanie
// funkcji) jest pomijana świadomie — test dalej ją zgłosi jako brakujący wpis w mapie,
// z tym samym czytelnym powodem co brakujący klucz w ogóle.
function wyodrebnijMapeWariantowZAST(zrodlo: string, sciezkaPliku: string): Record<string, string[]> {
  const plikZrodlowy = ts.createSourceFile(sciezkaPliku, zrodlo, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  let obiektWariantow: ts.ObjectLiteralExpression | undefined;
  const odwiedz = (wezel: ts.Node): void => {
    if (
      obiektWariantow === undefined &&
      ts.isVariableDeclaration(wezel) &&
      ts.isIdentifier(wezel.name) &&
      wezel.name.text === "variants" &&
      wezel.initializer !== undefined &&
      ts.isObjectLiteralExpression(wezel.initializer)
    ) {
      obiektWariantow = wezel.initializer;
      return;
    }
    ts.forEachChild(wezel, odwiedz);
  };
  odwiedz(plikZrodlowy);

  if (obiektWariantow === undefined) {
    throw new Error(
      "Nie znaleziono w Badge.tsx deklaracji `const variants = {...}` — zmieniono kształt komponentu, test wymaga aktualizacji.",
    );
  }

  const mapa: Record<string, string[]> = {};
  for (const wlasciwosc of obiektWariantow.properties) {
    if (!ts.isPropertyAssignment(wlasciwosc)) continue;
    const klucz = wlasciwosc.name;
    const nazwa = ts.isIdentifier(klucz) || ts.isStringLiteral(klucz) ? klucz.text : undefined;
    if (nazwa === undefined) continue;
    if (!ts.isStringLiteral(wlasciwosc.initializer)) continue;
    mapa[nazwa] = wlasciwosc.initializer.text.trim().split(/\s+/);
  }
  return mapa;
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

const nazwyZTypu = wyodrebnijNazwyWariantowZTypu(badgeSource);
const mapaWariantow = wyodrebnijMapeWariantowZAST(badgeSource, BADGE_SRC_PATH);
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

// Wyzwalacze własne dla `wyodrebnijMapeWariantowZAST` — każdy sprawdza, że nawias
// klamrowy albo średnik będące TREŚCIĄ (łańcuch, komentarz jedno- i wielowierszowy,
// znak ucieczki) nie wpływają na to, gdzie kompilator widzi prawdziwy koniec obiektu
// `variants`, i że wartości wychodzą dokładnie takie, jak w źródle — pole po polu,
// nie tylko "test przeszedł". Każdy fragment budujemy jako osobny, kompletny plik
// TSX (typ `Variant` + `const variants = {...}`), bo funkcja parsuje CAŁY plik.
function zbudujZrodloZWariantami(blokWariantow: string, nazwyWariantow: string[]): string {
  const typVariant = nazwyWariantow.map((n) => `"${n}"`).join(" | ");
  return [
    `type Variant = ${typVariant};`,
    `const variants: Record<Variant, string> = {`,
    blokWariantow,
    `};`,
    `export default variants;`,
  ].join("\n");
}

describe("wyodrebnijMapeWariantowZAST — wyzwalacze własne (nawias/średnik jako treść, nie składnia)", () => {
  it("nawias klamrowy wewnątrz łańcucha znakowego nie ucina obiektu", () => {
    const zrodlo = zbudujZrodloZWariantami(
      [`  a: "bg-{nawias} text-a",`, `  b: "bg-b text-b",`].join("\n"),
      ["a", "b"],
    );
    const mapa = wyodrebnijMapeWariantowZAST(zrodlo, "syntetyczny-lancuch.tsx");
    expect(mapa).toEqual({ a: ["bg-{nawias}", "text-a"], b: ["bg-b", "text-b"] });
  });

  it("nawias klamrowy wewnątrz komentarza jednowierszowego nie ucina obiektu", () => {
    const zrodlo = zbudujZrodloZWariantami(
      [`  a: "bg-a text-a", // uwaga: } to nie jest zamknięcie`, `  b: "bg-b text-b",`].join("\n"),
      ["a", "b"],
    );
    const mapa = wyodrebnijMapeWariantowZAST(zrodlo, "syntetyczny-komentarz-1l.tsx");
    expect(mapa).toEqual({ a: ["bg-a", "text-a"], b: ["bg-b", "text-b"] });
  });

  it("nawias klamrowy wewnątrz komentarza wielowierszowego nie ucina obiektu", () => {
    const zrodlo = zbudujZrodloZWariantami(
      [`  a: "bg-a text-a",`, `  /* przykład kształtu: { x: 1 }; */`, `  b: "bg-b text-b",`].join("\n"),
      ["a", "b"],
    );
    const mapa = wyodrebnijMapeWariantowZAST(zrodlo, "syntetyczny-komentarz-wl.tsx");
    expect(mapa).toEqual({ a: ["bg-a", "text-a"], b: ["bg-b", "text-b"] });
  });

  it("średnik wewnątrz treści łańcucha nie kończy deklaracji przedwcześnie", () => {
    const zrodlo = zbudujZrodloZWariantami([`  a: "bg-a;dziwne text-a",`].join("\n"), ["a"]);
    const mapa = wyodrebnijMapeWariantowZAST(zrodlo, "syntetyczny-srednik.tsx");
    expect(mapa).toEqual({ a: ["bg-a;dziwne", "text-a"] });
  });

  it("zagnieżdżony nawias klamrowy (dwa poziomy) w komentarzu nie ucina obiektu", () => {
    const zrodlo = zbudujZrodloZWariantami(
      [
        `  a: "bg-a text-a", // przykład: { zewn: { wewn: 1 } };`,
        `  b: "bg-b text-b",`,
      ].join("\n"),
      ["a", "b"],
    );
    const mapa = wyodrebnijMapeWariantowZAST(zrodlo, "syntetyczny-zagniezdzenie.tsx");
    expect(mapa).toEqual({ a: ["bg-a", "text-a"], b: ["bg-b", "text-b"] });
  });

  it("znak ucieczki (cudzysłów w środku łańcucha) jest odczytany, nie traktowany jak koniec wartości", () => {
    const zrodlo = zbudujZrodloZWariantami(
      [String.raw`  a: "bg-a text-a-\"cytat\"",`].join("\n"),
      ["a"],
    );
    const mapa = wyodrebnijMapeWariantowZAST(zrodlo, "syntetyczny-ucieczka.tsx");
    expect(mapa).toEqual({ a: ["bg-a", 'text-a-"cytat"'] });
  });

  it("błąd odbioru: komentarz z `};` między wpisami `neutral` i `success` — musi ZNIKNĄĆ po naprawie", () => {
    // Odtworzenie dokładnie tej mutacji, którą odbiór złapał na starym skanerze:
    // 5 z 6 wariantów fałszywie nieznalezionych, bo `indexOf("};", start)` trafiał
    // w tekst komentarza zamiast w prawdziwe zamknięcie obiektu.
    const zrodlo = zbudujZrodloZWariantami(
      [
        `  neutral: "bg-grey text-muted",`,
        `  // przykład kształtu wpisu: { klucz: "wartość" };`,
        `  success: "bg-success-bg text-success",`,
        `  warning: "bg-warning-bg text-warning-dark",`,
        `  danger: "bg-danger-bg text-danger",`,
        `  info: "bg-info-bg text-info-badge",`,
        `  accent: "bg-accent-15 text-accent-dark",`,
      ].join("\n"),
      ["neutral", "success", "warning", "danger", "info", "accent"],
    );
    const mapa = wyodrebnijMapeWariantowZAST(zrodlo, "syntetyczny-blad-odbioru.tsx");
    expect(Object.keys(mapa).sort()).toEqual(
      ["accent", "danger", "info", "neutral", "success", "warning"],
    );
    expect(mapa.success).toEqual(["bg-success-bg", "text-success"]);
    expect(mapa.accent).toEqual(["bg-accent-15", "text-accent-dark"]);
  });
});
