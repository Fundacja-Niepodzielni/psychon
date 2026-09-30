import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Arkusz tokenów działa wyłącznie w poddrzewie elementu z atrybutem
 * `data-theme`. Next.js zostawia arkusz po nawigacji klienckiej, więc każda
 * reguła na elemencie głównym dokumentu albo na `body` przeciekałaby na stare
 * strony otwarte z menu po nowym ekranie (obrys fokusu, `color-scheme`,
 * czcionka). Ten test pilnuje samego zapisu w pliku; skutek w przeglądarce
 * mierzy `e2e/tokeny-bez-wycieku.spec.ts`.
 */
const sciezkaCss = resolve(process.cwd(), "design-system/tokeny/tokeny.css");
const css = readFileSync(sciezkaCss, "utf-8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Selektory każdej reguły stylu (także wewnątrz `@media`), bez komentarzy. */
function selektoryRegul(tekst: string): string[] {
  const wynik: string[] = [];
  // Nagłówek reguły = tekst między poprzednim `{`/`}`/`;` a otwierającym `{`.
  for (const m of tekst.matchAll(/([^{};]+)\{/g)) {
    const naglowek = m[1].trim();
    if (naglowek.startsWith("@")) continue; // @media / @supports — nie selektor
    for (const s of naglowek.split(",")) wynik.push(s.trim());
  }
  return wynik;
}

const selektory = selektoryRegul(css);

describe("tokeny — zakres arkusza: tylko poddrzewo [data-theme]", () => {
  it("arkusz ma reguły do sprawdzenia (licznik wycięty z pliku, nie z literału)", () => {
    expect(selektory.length).toBeGreaterThan(8);
  });

  it("0 selektorów :root poza komentarzami", () => {
    expect(selektory.filter((s) => /:root\b/.test(s))).toEqual([]);
  });

  it("0 selektorów html poza komentarzami", () => {
    expect(selektory.filter((s) => /(^|[\s>+~(,])html\b/i.test(s))).toEqual([]);
  });

  it("0 selektorów body poza komentarzami", () => {
    expect(selektory.filter((s) => /(^|[\s>+~(,])body\b/i.test(s))).toEqual([]);
  });

  it('każdy selektor zaczyna się od [data-theme], [data-theme="…"] albo :where([data-theme])', () => {
    const poza = selektory.filter((s) => !/^(:where\(\[data-theme\]\)|\[data-theme[\]=])/.test(s));
    expect(poza).toEqual([]);
  });

  it("selektor `*` występuje wyłącznie jako potomek [data-theme]", () => {
    const gole = selektory.filter((s) => /^\*/.test(s));
    expect(gole).toEqual([]);
  });

  it("reguła fokusu ma specyficzność 0-2-0: [data-theme] :focus-visible", () => {
    expect(selektory).toContain("[data-theme] :focus-visible");
  });
});
