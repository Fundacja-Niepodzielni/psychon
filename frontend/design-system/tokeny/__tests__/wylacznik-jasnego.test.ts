import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Wyłącznik jasnego motywu musi działać na DOWOLNYM elemencie z atrybutem
 * `data-theme="light"`, nie tylko na korzeniu dokumentu: układy nowego frontu
 * (`app/nowy-front/layout.tsx`, `app/(przelaczenie)/layout.tsx`) niosą ten
 * atrybut na `div`, a selektor `:root[data-theme="light"]` takiego `div`a nie
 * łapie — przy systemie w trybie ciemnym tokeny szłyby wtedy za
 * `@media (prefers-color-scheme: dark)`. jsdom nie liczy `@media`, więc
 * skutek w przeglądarce mierzy `e2e/tryb-jasny-nowego-frontu.spec.ts`; ten
 * test pilnuje samego zapisu reguły w pliku.
 */
const sciezkaCss = resolve(process.cwd(), "design-system/tokeny/tokeny.css");
const css = readFileSync(sciezkaCss, "utf-8").replace(/\/\*[\s\S]*?\*\//g, "");

type Regula = { selektory: string[]; tresc: string; poczatek: number };

/** Reguły płaskie (bez zagnieżdżeń): selektory rozdzielone przecinkami + treść. */
function reguly(): Regula[] {
  const wynik: Regula[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    wynik.push({
      selektory: m[1].split(",").map((s) => s.trim()),
      tresc: m[2],
      poczatek: m.index ?? 0,
    });
  }
  return wynik;
}

const reguleJasne = reguly().filter((r) =>
  r.selektory.some((s) => s.includes('data-theme="light"')),
);

describe("tokeny — wyłącznik jasnego motywu", () => {
  it("jest dokładnie jedna reguła wyłącznika (selektor z data-theme=\"light\")", () => {
    expect(reguleJasne).toHaveLength(1);
  });

  it('zawiera selektor [data-theme="light"] bez :root (łapie div układu)', () => {
    expect(reguleJasne[0].selektory).toContain('[data-theme="light"]');
  });

  it('zachowuje selektor :root[data-theme="light"] (korzeń dokumentu)', () => {
    expect(reguleJasne[0].selektory).toContain(':root[data-theme="light"]');
  });

  it("niesie jasne wartości tokenów", () => {
    expect(reguleJasne[0].tresc).toMatch(/color-scheme:\s*light\s*;/);
    expect(reguleJasne[0].tresc).toMatch(/--bg:\s*#f3f1ed\s*;/);
    expect(reguleJasne[0].tresc).toMatch(/--card:\s*#ffffff\s*;/);
  });

  it("leży po bloku prefers-color-scheme: dark (równa specyficzność, wygrywa kolejność)", () => {
    const poczatekMedia = css.indexOf("@media (prefers-color-scheme: dark)");
    expect(poczatekMedia).toBeGreaterThanOrEqual(0);
    expect(reguleJasne[0].poczatek).toBeGreaterThan(poczatekMedia);
  });
});
