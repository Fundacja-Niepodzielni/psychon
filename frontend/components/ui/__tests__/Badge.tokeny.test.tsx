import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import Badge from "@/components/ui/Badge";

// Świadek wiązania odznaki z tokenami stylu.
//
// K1: warianty wyliczamy z samego pliku Badge.tsx (blok `const variants: Record<Variant, string> = {...}`),
// nie z ręcznie przepisanej listy w tym teście. Dopisanie siódmego wariantu w Badge.tsx
// wystarczy, żeby ten test objął go automatycznie — bez zmiany tego pliku.
//
// K3: dla każdej klasy z mapy sprawdzamy, że odpowiadający jej token `--color-<nazwa>`
// jest zadeklarowany w app/globals.css. Plik stylów czytamy z dysku, nie przepisujemy
// listy tokenów do testu.

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

// Parsowanie linii postaci: nazwa: "klasa1 klasa2", ignorując linie komentarzy (`//`).
function wyodrebnijMapeWariantow(blok: string): Record<string, string[]> {
  const mapa: Record<string, string[]> = {};
  const linie = blok.split("\n");
  for (const linia of linie) {
    const bezKomentarza = linia.split("//")[0];
    const dopasowanie = bezKomentarza.match(/^\s*(\w+):\s*"([^"]+)"/);
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

describe("Badge — wiązanie wariantów z tokenami stylu (świadek)", () => {
  it("każdy wariant z typu Variant ma wpis w mapie klas w Badge.tsx", () => {
    expect(nazwyZTypu.length).toBeGreaterThan(0);
    for (const nazwa of nazwyZTypu) {
      expect(Object.keys(mapaWariantow)).toContain(nazwa);
    }
    // Ten sam zestaw, bez rozbieżności w żadną stronę.
    expect(Object.keys(mapaWariantow).sort()).toEqual([...nazwyZTypu].sort());
  });

  // K2 + K3, wyliczone dynamicznie z Badge.tsx — brak ręcznie przepisanej listy wariantów/klas.
  for (const nazwa of nazwyZTypu) {
    describe(`wariant "${nazwa}"`, () => {
      it("odznaka niesie dokładnie klasy przypisane temu wariantowi w Badge.tsx", () => {
        const oczekiwaneKlasy = mapaWariantow[nazwa];
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
        expect(klasy.length).toBeGreaterThan(0);

        for (const klasa of klasy) {
          const dopasowaniePrefiksu = klasa.match(/^(bg|text)-(.+)$/);
          expect(
            dopasowaniePrefiksu,
            `klasa "${klasa}" wariantu "${nazwa}" nie ma prefiksu bg- ani text- — nie da się jej powiązać z tokenem --color-*`,
          ).not.toBeNull();

          const nazwaTokenu = dopasowaniePrefiksu![2];
          const wzorzecTokenu = new RegExp(`--color-${nazwaTokenu}\\s*:`);
          expect(
            wzorzecTokenu.test(globalsCss),
            `token --color-${nazwaTokenu} (dla klasy "${klasa}" wariantu "${nazwa}") nie jest zadeklarowany w app/globals.css`,
          ).toBe(true);
        }
      });
    });
  }
});
