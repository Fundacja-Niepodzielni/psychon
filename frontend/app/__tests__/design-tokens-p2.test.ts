import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const css = readFileSync(
  path.join(process.cwd(), "app", "globals.css"),
  "utf8",
);

const layoutSource = readFileSync(
  path.join(process.cwd(), "app", "layout.tsx"),
  "utf8",
);

/** Usuwa komentarze blokowe `/* … *\/`, żeby liczenia i sprawdzenia „0
 * wystąpień X poza dozwolonym miejscem" nie łapały cytatów w komentarzach
 * wyjaśniających (np. ten plik cytuje `outline: none` w prozie obok reguły).
 */
function stripCssComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

const cssCode = stripCssComments(css);

/** Wycina treść bloku `@utility focus-ring { … }` (nawiasy proste, jeden
 * poziom zagnieżdżenia dla `@media` w środku) — żeby sprawdzić, że pierścień
 * fokusu naprawdę korzysta z tokenu, a nie tylko że token istnieje gdzieś w
 * pliku (uwaga werdyktu: test dopasowujący regex do tekstu tokenu nie łapie
 * mutacji, która wyłącza samą regułę `@utility`, np. `box-shadow: none`).
 * Działa na kodzie bez komentarzy (`cssCode`). */
function extractUtilityBlock(source: string, name: string): string {
  const start = source.indexOf(`@utility ${name} {`);
  if (start === -1) {
    throw new Error(`brak bloku @utility ${name} w globals.css`);
  }
  let depth = 0;
  let i = source.indexOf("{", start);
  const blockStart = i;
  for (; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  return source.slice(blockStart, i + 1);
}

const focusRingBlock = extractUtilityBlock(cssCode, "focus-ring");

describe("tokeny P2 w app/globals.css", () => {
  it("F-90: pierścień fokusu ma 3px w --psy-violet-dark (#1500BB), nie zielony z alfą < 3:1", () => {
    expect(css).toMatch(
      /--psy-focus-ring:\s*0 0 0 3px var\(--psy-violet-dark\)/,
    );
  });

  it("F-89: Roboto ładowany z plików lokalnych /fonts/, nie z CDN Google", () => {
    expect(css).toMatch(/src:\s*url\("\/fonts\/roboto-v51-latin-ext\.woff2"\)/);
    expect(css).toMatch(/src:\s*url\("\/fonts\/roboto-v51-latin\.woff2"\)/);
    expect(css).not.toMatch(/fonts\.googleapis\.com/);
    expect(css).not.toMatch(/fonts\.gstatic\.com/);
  });

  it("F-91: reguła prefers-reduced-motion: reduce jest zdefiniowana", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)/);
  });

  it("nagłówki zostają czarne (--psy-text-strong #1a1a1a), granat strony tylko jako akcent/fokus", () => {
    expect(css).toMatch(/--psy-text-strong:\s*#1a1a1a/i);
    expect(css).not.toMatch(/--psy-text-strong:\s*#1500bb/i);
  });

  it("F-89: app/layout.tsx nie ładuje Google Fonts przez <link>/CDN — Roboto jest wyłącznie lokalny", () => {
    expect(layoutSource).not.toMatch(/fonts\.googleapis\.com/);
    expect(layoutSource).not.toMatch(/fonts\.gstatic\.com/);
    expect(layoutSource).not.toMatch(/<link[^>]*fonts/i);
  });

  it("F-90: @utility focus-ring naprawdę stosuje --psy-focus-ring (box-shadow), nie samą pustą regułę", () => {
    expect(focusRingBlock).toMatch(/box-shadow:\s*var\(--psy-focus-ring\)/);
    expect(focusRingBlock).not.toMatch(/box-shadow:\s*none/);
  });

  it("F-90: outline: none w @utility focus-ring ma zamiennik widoczny w trybie forced-colors (Z-9)", () => {
    expect(focusRingBlock).toMatch(/outline:\s*none/);
    expect(focusRingBlock).toMatch(/@media \(forced-colors:\s*active\)/);
    // Zamiennik musi być realnym outline w kolorze systemowym, nie pustym blokiem.
    const forcedColorsMatch = focusRingBlock.match(
      /@media \(forced-colors:\s*active\)\s*\{([^}]*)\}/,
    );
    expect(forcedColorsMatch).not.toBeNull();
    expect(forcedColorsMatch![1]).toMatch(
      /outline:\s*\d+px\s+solid\s+(Highlight|CanvasText)/i,
    );
  });

  it("liczba reguł forced-colors w globals.css (w kodzie, bez komentarzy) jest co najmniej 1 (F-90 domknięte w całości)", () => {
    const matches = cssCode.match(/@media \(forced-colors:\s*active\)/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("0 wystąpień 'outline: none' bez zamiennika forced-colors w kodzie app/globals.css", () => {
    // Jedyne dozwolone 'outline: none' to to wewnątrz @utility focus-ring,
    // które ma bezpośrednio obok siebie zamiennik forced-colors (sprawdzony
    // wyżej). Licząc poza tym blokiem (i poza komentarzami — cssCode), w
    // reszcie pliku nie ma być ani jednego kolejnego 'outline: none'.
    const outsideBlock = cssCode.replace(focusRingBlock, "");
    expect(outsideBlock).not.toMatch(/outline:\s*none/);
  });
});
