import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import UkladPrzelaczenia from "../layout";
import { ListTemplate } from "@/design-system/szablony/ListTemplate/ListTemplate";

/** Elementy w naturalnej kolejności fokusu klawiatury (kolejność w drzewie). */
function fokusowalne(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex]"),
  );
}

describe("układ grupy tras (przelaczenie) — wspólny korzeń bez własnego linku skoku", () => {
  it('układ grupy nie dokłada linku "Przejdź do treści" — jedyny niesie powłoka segmentu', () => {
    const { container } = render(
      <UkladPrzelaczenia>
        <ListTemplate naglowek={<div>Nagłówek</div>} lista={<div>Lista</div>} />
      </UkladPrzelaczenia>,
    );

    expect(container.querySelectorAll('a[href="#tresc"]')).toHaveLength(0);
    expect(fokusowalne(container).filter((el) => el.tagName === "A")).toHaveLength(0);
  });

  it("kontrola dodatnia: licznik odnośników do treści widzi odnośnik dołożony do układu", () => {
    const { container } = render(
      <UkladPrzelaczenia>
        <a href="#tresc">Przejdź do treści</a>
        <ListTemplate naglowek={<div>Nagłówek</div>} lista={<div>Lista</div>} />
      </UkladPrzelaczenia>,
    );

    expect(container.querySelectorAll('a[href="#tresc"]')).toHaveLength(1);
  });

  it("cel #tresc to jedyny main szablonu i przyjmuje fokus programowy", () => {
    const { container } = render(
      <UkladPrzelaczenia>
        <ListTemplate naglowek={<div>Nagłówek</div>} lista={<div>Lista</div>} />
      </UkladPrzelaczenia>,
    );

    expect(container.querySelectorAll("main")).toHaveLength(1);
    const cel = document.getElementById("tresc");
    expect(cel?.tagName).toBe("MAIN");
    cel?.focus();
    expect(document.activeElement).toBe(cel);
  });

  it("układ sam nie renderuje żadnego main", () => {
    const { container } = render(
      <UkladPrzelaczenia>
        <div>Placeholder bez własnego main.</div>
      </UkladPrzelaczenia>,
    );
    expect(container.querySelectorAll("main")).toHaveLength(0);
  });

  it('korzeń układu niesie data-theme="light"', () => {
    const { container } = render(
      <UkladPrzelaczenia>
        <div>Treść</div>
      </UkladPrzelaczenia>,
    );
    expect((container.firstElementChild as HTMLElement).getAttribute("data-theme")).toBe("light");
  });
});

/**
 * Tokeny nowego frontu pod trasą produktu: układ ładuje wyłącznie
 * `design-system/tokeny/tokeny.css`, nie importuje `app/globals.css`, a
 * zmienna, którą definiują tokeny nowego frontu, nie istnieje w `globals.css`
 * — oba zestawy żyją obok siebie bez wzajemnego wpływu.
 */
const KATALOG = process.cwd();
const ZRODLO_UKLADU = readFileSync(path.join(KATALOG, "app", "(przelaczenie)", "layout.tsx"), "utf-8");
const TOKENY = readFileSync(path.join(KATALOG, "design-system", "tokeny", "tokeny.css"), "utf-8");
const GLOBALS = readFileSync(path.join(KATALOG, "app", "globals.css"), "utf-8");

function importujeArkusz(zrodlo: string, fragmentSciezki: string): boolean {
  return zrodlo
    .split("\n")
    .some((linia) => /^\s*import\s+["'][^"']*["']\s*;?\s*$/.test(linia) && linia.includes(fragmentSciezki));
}

function definiujeZmienna(css: string, nazwa: string): boolean {
  return new RegExp(`(^|[\\s;{])${nazwa}\\s*:`).test(css);
}

describe("tokeny nowego frontu pod trasą produktu", () => {
  it("układ importuje tokeny nowego frontu i nie importuje globals.css", () => {
    expect(importujeArkusz(ZRODLO_UKLADU, "design-system/tokeny/tokeny.css")).toBe(true);
    expect(importujeArkusz(ZRODLO_UKLADU, "globals.css")).toBe(false);
  });

  it("zmienna --space-16 jest zdefiniowana w tokenach nowego frontu, a nie w globals.css", () => {
    expect(definiujeZmienna(TOKENY, "--space-16")).toBe(true);
    expect(definiujeZmienna(GLOBALS, "--space-16")).toBe(false);
  });

  it("przypadek odwrotny: wykrywacze rozpoznają import globals.css i zmienną w zdefiniowanym miejscu", () => {
    expect(importujeArkusz('import "@/app/globals.css";\n', "globals.css")).toBe(true);
    expect(importujeArkusz("// import \"@/app/globals.css\";\n", "globals.css")).toBe(false);
    expect(definiujeZmienna(":root { --space-16: 16px; }", "--space-16")).toBe(true);
    expect(definiujeZmienna(":root { --space-160: 16px; }", "--space-16")).toBe(false);
  });
});

/**
 * Dotychczasowa powłoka panelu wchodzi do grupy wyłącznie w trzech miejscach:
 * dokładnie trzy importy `components/layout/PanelShell` poza testami, po
 * jednym w każdym wyborze ramki dla stron starej grupy tras —
 * `admin/RamkaAdministracji.tsx`, `panel/RamkaUczestnika.tsx` i
 * `prowadzacy/RamkaProwadzacego.tsx`. Układy segmentów `admin/layout.tsx`
 * i `panel/layout.tsx` niosą już nową ramkę z makiety
 * (`PowlokaAdministracji`, `PowlokaUczestnika`) i `PanelShell` nie
 * importują. Układ grupy go nie importuje, a oba układy segmentów owijają
 * treść w dostawcę kontekstu powłoki.
 */
const KORZEN_GRUPY = path.join(KATALOG, "app", "(przelaczenie)");

function plikiZrodlowe(katalog: string): string[] {
  return readdirSync(katalog).flatMap((nazwa) => {
    const pelna = path.join(katalog, nazwa);
    if (statSync(pelna).isDirectory()) return nazwa === "__tests__" ? [] : plikiZrodlowe(pelna);
    return /\.tsx?$/.test(nazwa) ? [pelna] : [];
  });
}

function importyPanelShell(zrodlo: string): number {
  return zrodlo
    .split(/\r?\n/)
    .filter((linia) => /^\s*import\b.*from\s+["']@\/components\/layout\/PanelShell["']/.test(linia)).length;
}

describe("powłoka panelu w grupie tras (przelaczenie)", () => {
  it("dokładnie trzy importy PanelShell poza testami: wybory ramki administracji, uczestnika i prowadzącego", () => {
    const wPlikach = plikiZrodlowe(KORZEN_GRUPY)
      .map((plik) => ({ plik: path.relative(KORZEN_GRUPY, plik).split(path.sep).join("/"), liczba: importyPanelShell(readFileSync(plik, "utf-8")) }))
      .filter((wpis) => wpis.liczba > 0);

    expect(wPlikach).toEqual([
      { plik: "admin/RamkaAdministracji.tsx", liczba: 1 },
      { plik: "panel/RamkaUczestnika.tsx", liczba: 1 },
      { plik: "prowadzacy/RamkaProwadzacego.tsx", liczba: 1 },
    ]);
  });

  it("układ segmentu panel/layout.tsx niesie nową ramkę uczestnika z makiety, nie PanelShell", () => {
    const zrodlo = readFileSync(path.join(KORZEN_GRUPY, "panel", "layout.tsx"), "utf-8");
    expect(importyPanelShell(zrodlo)).toBe(0);
    expect(zrodlo).toMatch(/import\s*\{\s*PowlokaUczestnika\s*\}\s*from\s*["']\.\/PowlokaUczestnika["']/);
    expect(zrodlo).toMatch(/<PowlokaUczestnika>/);
  });

  it("układ segmentu admin/layout.tsx niesie nową ramkę z makiety, nie PanelShell", () => {
    const zrodlo = readFileSync(path.join(KORZEN_GRUPY, "admin", "layout.tsx"), "utf-8");
    expect(importyPanelShell(zrodlo)).toBe(0);
    expect(zrodlo).toMatch(/import\s*\{\s*PowlokaAdministracji\s*\}\s*from\s*["']\.\/PowlokaAdministracji["']/);
    expect(zrodlo).toMatch(/<PowlokaAdministracji>/);
  });

  it("układ grupy nie importuje PanelShell", () => {
    expect(importyPanelShell(ZRODLO_UKLADU)).toBe(0);
  });

  it("oba układy segmentów owijają treść w dostawcę kontekstu powłoki", () => {
    for (const plik of ["panel/layout.tsx", "admin/layout.tsx"]) {
      const zrodlo = readFileSync(path.join(KORZEN_GRUPY, plik), "utf-8");
      expect(zrodlo).toMatch(/import\s*\{\s*DostawcaPowloki\s*\}\s*from\s*["']@\/design-system\/szablony\/KontekstPowloki["']/);
      expect(zrodlo).toMatch(/<DostawcaPowloki>\{children\}<\/DostawcaPowloki>/);
    }
  });

  it("przypadek odwrotny: licznik importów rozpoznaje import i pomija komentarz", () => {
    expect(importyPanelShell('import PanelShell from "@/components/layout/PanelShell";')).toBe(1);
    expect(importyPanelShell('// import PanelShell from "@/components/layout/PanelShell";')).toBe(0);
    expect(importyPanelShell('import X from "@/components/layout/HelpWidget";')).toBe(0);
  });
});
