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

/** Rozwiązuje wartość zmiennej CSS przez łańcuch `var(--x)` aż do wartości
 * szesnastkowej — na kodzie bez komentarzy, żeby cytat w prozie nie podszedł
 * pod definicję. */
function rozwiazZmienna(css: string, nazwa: string, glebokosc = 0): string {
  if (glebokosc > 10) {
    throw new Error("pętla zmiennych CSS");
  }
  const dopasowanie = css.match(new RegExp(`${nazwa}:\\s*([^;]+);`));
  if (!dopasowanie) {
    throw new Error(`brak zmiennej ${nazwa} w globals.css`);
  }
  const wartosc = dopasowanie[1].trim();
  const zagniezdzona = wartosc.match(/^var\((--[\w-]+)\)$/);

  return zagniezdzona
    ? rozwiazZmienna(css, zagniezdzona[1], glebokosc + 1)
    : wartosc.toLowerCase();
}

const KLOCKI_Z_NAGLOWKAMI = [
  "components/molecules/PageHeader.tsx",
  "components/ui/Card.tsx",
  "components/templates/AuthTemplate.tsx",
  "components/molecules/EmptyState.tsx",
  "components/ui/Inset.tsx",
];

const DOZWOLONE_KLASY_KOLORU = ["text-heading", "text-ink"];

/** Klasy koloru znalezione na każdym h1–h3 wspólnych klocków — tylko klasy
 * z rodziny `text-*` używane do koloru nagłówka (nie np. `text-title` czy
 * `font-bold`, które opisują rozmiar/wagę, nie kolor). */
function klasyKoloruNaglowkow(frontendDir: string): { plik: string; klasy: string[] }[] {
  return KLOCKI_Z_NAGLOWKAMI.flatMap((plik) => {
    const zrodlo = readFileSync(path.join(frontendDir, plik), "utf8");
    const naglowki = [...zrodlo.matchAll(/<h[1-3][^>]*className="([^"]*)"/g)];

    return naglowki.map((dopasowanie) => ({
      plik,
      klasy: dopasowanie[1]
        .split(/\s+/)
        .filter((klasa) =>
          /^text-(heading|ink|accent|accent-dark|primary|muted|body)$/.test(klasa),
        ),
    }));
  });
}

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
 * pliku (uwaga: test dopasowujący regex do tekstu tokenu nie łapie
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
  it("pierścień fokusu ma 3px w --psy-violet-dark (#1500BB), nie zielony z alfą < 3:1", () => {
    expect(css).toMatch(
      /--psy-focus-ring:\s*0 0 0 3px var\(--psy-violet-dark\)/,
    );
  });

  it("Roboto ładowany z plików lokalnych /fonts/, nie z CDN Google", () => {
    expect(css).toMatch(/src:\s*url\("\/fonts\/roboto-v51-latin-ext\.woff2"\)/);
    expect(css).toMatch(/src:\s*url\("\/fonts\/roboto-v51-latin\.woff2"\)/);
    expect(css).not.toMatch(/fonts\.googleapis\.com/);
    expect(css).not.toMatch(/fonts\.gstatic\.com/);
  });

  it("reguła prefers-reduced-motion: reduce jest zdefiniowana", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)/);
  });

  it("h1–h3 wspólnych klocków (PageHeader, Card, AuthTemplate, EmptyState, Inset) mają kolor wyłącznie text-heading albo text-ink", () => {
    const znalezione = klasyKoloruNaglowkow(process.cwd());

    expect(znalezione.length).toBeGreaterThanOrEqual(KLOCKI_Z_NAGLOWKAMI.length);

    for (const { plik, klasy } of znalezione) {
      expect(klasy, `${plik}: dokładnie jedna klasa koloru na nagłówku`).toHaveLength(1);
      expect(
        DOZWOLONE_KLASY_KOLORU,
        `${plik}: kolor nagłówka to ${klasy[0]}, nie text-heading/text-ink`,
      ).toContain(klasy[0]);
    }
  });

  it("nagłówki zostają czarne: --color-heading i --color-ink, rozwiązane łańcuchem zmiennych w globals.css, dają #1a1a1a", () => {
    expect(rozwiazZmienna(cssCode, "--color-heading")).toBe("#1a1a1a");
    expect(rozwiazZmienna(cssCode, "--color-ink")).toBe("#1a1a1a");
  });

  it("klasa Tailwind 'text-ink' (użyta w PageHeader na h1) jest podpięta pod --psy-text-strong", () => {
    // Domyka łańcuch od klasy widocznej na elemencie do wartości tokenu:
    // sam test wartości tokenu (wyżej) nie łapie mutacji, która odłącza
    // `--color-ink` od `--psy-text-strong` (np. podmienia na literał koloru
    // albo na inną zmienną) — kaskada Tailwinda nie jest liczona w jsdom,
    // więc computed style na elemencie nie jest tu dostępny (brak
    // Playwright/e2e w repo — zob. meldunek). To najsilniejsza kontrola
    // dostępna bez dodawania nowej zależności.
    expect(css).toMatch(/--color-ink:\s*var\(--psy-text-strong\)/);
  });

  it("app/layout.tsx nie ładuje Google Fonts przez <link>/CDN — Roboto jest wyłącznie lokalny", () => {
    expect(layoutSource).not.toMatch(/fonts\.googleapis\.com/);
    expect(layoutSource).not.toMatch(/fonts\.gstatic\.com/);
    expect(layoutSource).not.toMatch(/<link[^>]*fonts/i);
  });

  it("@utility focus-ring naprawdę stosuje --psy-focus-ring (box-shadow), nie samą pustą regułę", () => {
    expect(focusRingBlock).toMatch(/box-shadow:\s*var\(--psy-focus-ring\)/);
    expect(focusRingBlock).not.toMatch(/box-shadow:\s*none/);
  });

  it("outline: none w @utility focus-ring ma zamiennik widoczny w trybie forced-colors (Z-9)", () => {
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

  it("liczba reguł forced-colors w globals.css (w kodzie, bez komentarzy) jest co najmniej 1 (pierścień fokusu domknięty w całości)", () => {
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
