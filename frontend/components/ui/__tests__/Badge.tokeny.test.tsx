import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
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
// Zamknięcie każdego bloku szukane jest licząc głębokość nawiasów klamrowych od otwarcia
// (nie pierwszą linię `}` z brzegu), żeby przetrwać zagnieżdżone reguły w bloku. Liczenie
// głębokości działa na arkuszu z WYCZYSZCZONYMI komentarzami /* ... */ (treść komentarza
// zamieniona na spacje, żeby pozycje i numery wierszy się nie przesunęły) — nawias klamrowy
// wewnątrz komentarza (np. w opisie odcienia koloru) nie jest więc liczony jako nawias
// struktury. Zmierzone: liczenie głębokości na surowym arkuszu dawało fałszywą czerwień
// (komentarz z „}” w środku zamykał blok za wcześnie) i fałszywą awarię całej suity
// (komentarz z „{” otwierał głębokość, która nigdy się nie domykała).
//
// Zwrócone bloki nadal mają komentarze zamienione na spacje (nie usunięte całkiem), żeby
// zakomentowany token nadal liczył się jako niezadeklarowany, ale bez psucia pozycji.
// Brak choćby jednego bloku albo brak jego zamknięcia jest błędem — test ma się wywrócić,
// a komunikat wskazuje WIERSZ w app/globals.css, nie samą pozycję w bajtach.
function wyczyscKomentarzeZachowujacPozycje(tekst: string): string {
  return tekst.replace(/\/\*[\s\S]*?\*\//g, (dopasowanie) => dopasowanie.replace(/[^\n]/g, " "));
}

function numerWiersza(tekst: string, pozycja: number): number {
  return tekst.slice(0, pozycja).split("\n").length;
}

function wyodrebnijBlokiDeklaracjiTokenow(css: string): string[] {
  const cssBezKomentarzy = wyczyscKomentarzeZachowujacPozycje(css);
  const wzorzecPoczatku = /@theme(?:\s+inline)?\s*\{/g;
  const bloki: string[] = [];
  let dopasowanie: RegExpExecArray | null;

  while ((dopasowanie = wzorzecPoczatku.exec(cssBezKomentarzy)) !== null) {
    const startTresci = dopasowanie.index + dopasowanie[0].length;
    let glebokosc = 1;
    let i = startTresci;
    for (; i < cssBezKomentarzy.length && glebokosc > 0; i++) {
      if (cssBezKomentarzy[i] === "{") glebokosc++;
      else if (cssBezKomentarzy[i] === "}") glebokosc--;
    }
    if (glebokosc !== 0) {
      throw new Error(
        `Nie znaleziono zamknięcia bloku \`@theme { ... }\` otwartego w app/globals.css w wierszu ${numerWiersza(css, dopasowanie.index)} (\`${dopasowanie[0]}\`).`,
      );
    }
    const koniecTresci = i - 1; // wskazuje na dopasowany "}"
    // Wycinamy z ORYGINALNEGO arkusza (pozycje są takie same, bo czyszczenie komentarzy
    // zachowuje długość), więc zwrócony blok ma prawdziwą treść, nie same spacje.
    bloki.push(css.slice(startTresci, koniecTresci));
    wzorzecPoczatku.lastIndex = i;
  }

  if (bloki.length === 0) {
    throw new Error(
      "Nie znaleziono w globals.css żadnego bloku `@theme { ... }` z deklaracjami tokenów.",
    );
  }

  return bloki.map((blok) => blok.replace(/\/\*[\s\S]*?\*\//g, ""));
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
const blokiTokenow = wyodrebnijBlokiDeklaracjiTokenow(globalsCss);

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
          const wzorzecTokenu = new RegExp(`--color-${nazwaTokenu}\\s*:`);
          const zadeklarowanyWKtoryms = blokiTokenow.some((blok) => wzorzecTokenu.test(blok));
          expect(
            zadeklarowanyWKtoryms,
            `token --color-${nazwaTokenu} (dla klasy "${klasa}" wariantu "${nazwa}") nie jest zadeklarowany w żadnym bloku @theme w app/globals.css`,
          ).toBe(true);
        }
      });
    });
  }
});
