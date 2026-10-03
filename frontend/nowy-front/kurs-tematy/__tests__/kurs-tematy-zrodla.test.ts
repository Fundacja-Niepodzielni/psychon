import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Świadkowie źródeł ekranu A-12 — mierzą tekst plików, nie render:
 *  - szablon wyłącznie z warstwy `design-system` (zero importów starego
 *    `components/templates`);
 *  - logika checklisty publikacji tylko importem z
 *    `nowy-front/kurs-publikacja/dane.ts` (jedna definicja w drzewie nowego frontu);
 *  - `KursPublikacja` nie jest montowany w `app/` (plik zostaje);
 *  - ekran nie niesie własnego znacznika `main` — jedyny `main` to korzeń
 *    szablonu (wzorzec złożony z dwóch części, żeby ten plik sam nie był
 *    trafieniem pomiaru znaczników `main` w drzewie nowego frontu).
 */

/** Korzeń `frontend/` — vitest uruchamia się z tego katalogu (`vitest.config.ts`). */
const KATALOG_APLIKACJI = process.cwd();

function plikiZrodlowe(katalog: string): string[] {
  const pelny = join(KATALOG_APLIKACJI, katalog);
  if (!existsSync(pelny)) return [];
  return readdirSync(pelny).flatMap((nazwa) => {
    const sciezka = join(pelny, nazwa);
    if (statSync(sciezka).isDirectory()) return plikiZrodlowe(relative(KATALOG_APLIKACJI, sciezka));
    return /\.(ts|tsx)$/.test(nazwa) && !sciezka.includes("__tests__") ? [sciezka] : [];
  });
}

const PLIKI_EKRANU = [
  ...plikiZrodlowe("nowy-front/kurs-tematy"),
  join(KATALOG_APLIKACJI, "app/nowy-front/kurs/[id]/page.tsx"),
  join(KATALOG_APLIKACJI, "app/nowy-front/kurs/[id]/loading.tsx"),
];

function tresc(sciezka: string) {
  return readFileSync(sciezka, "utf-8");
}

describe("A-12 — źródła ekranu", () => {
  it("pliki ekranu istnieją (pomiar nie jest pusty)", () => {
    expect(PLIKI_EKRANU.length).toBeGreaterThanOrEqual(3);
    expect(PLIKI_EKRANU.every((p) => existsSync(p))).toBe(true);
  });

  it("DetailTemplate wyłącznie z @/design-system/szablony/DetailTemplate, zero importów components/templates", () => {
    const stary = PLIKI_EKRANU.filter((p) => /from\s+["'][^"']*components\/templates/.test(tresc(p)));
    expect(stary.map((p) => relative(KATALOG_APLIKACJI, p))).toEqual([]);
    const ekran = tresc(join(KATALOG_APLIKACJI, "nowy-front/kurs-tematy/KursTematy.tsx"));
    expect(ekran).toMatch(
      /import \{ DetailTemplate \} from "@\/design-system\/szablony\/DetailTemplate\/DetailTemplate";/,
    );
    expect(ekran).toMatch(/<DetailTemplate\b/);
    const ladowanie = tresc(join(KATALOG_APLIKACJI, "app/nowy-front/kurs/[id]/loading.tsx"));
    expect(ladowanie).toMatch(
      /import \{ DetailTemplate \} from "@\/design-system\/szablony\/DetailTemplate\/DetailTemplate";/,
    );
    expect(ladowanie).toMatch(/<DetailTemplate\b/);
  });

  it("checklistaPublikacji: jedna definicja w dane.ts, ekran ją importuje", () => {
    const wszystkie = [...plikiZrodlowe("nowy-front"), ...plikiZrodlowe("app/nowy-front")];
    const definicje = wszystkie.filter((p) =>
      /(function\s+checklistaPublikacji\b|(const|let)\s+checklistaPublikacji\s*=)/.test(tresc(p)),
    );
    expect(definicje.map((p) => relative(KATALOG_APLIKACJI, p).replace(/\\/g, "/"))).toEqual([
      "nowy-front/kurs-publikacja/dane.ts",
    ]);
    expect(tresc(join(KATALOG_APLIKACJI, "nowy-front/kurs-tematy/KursTematy.tsx"))).toMatch(
      /import \{ checklistaPublikacji[^}]*\} from "@\/nowy-front\/kurs-publikacja\/dane";/,
    );
    // Trasa robocza prowadzącego pokazuje wspólny ekran kursu administracji w roli prowadzącego.
    const trasaRobocza = tresc(join(KATALOG_APLIKACJI, "app/nowy-front/kurs/[id]/page.tsx"));
    expect(trasaRobocza).toMatch(
      /import \{ KursAdministracji \} from "@\/nowy-front\/kurs-administracji\/KursAdministracji";/,
    );
    expect(trasaRobocza).toMatch(/<KursAdministracji idKursu=\{id\} rola="instructor" \/>/);
  });

  it("KursPublikacja: zero importów w app/, plik zostaje", () => {
    const importy = plikiZrodlowe("app").filter((p) => /import[^;]*\bKursPublikacja\b/.test(tresc(p)));
    expect(importy.map((p) => relative(KATALOG_APLIKACJI, p))).toEqual([]);
    expect(existsSync(join(KATALOG_APLIKACJI, "nowy-front/kurs-publikacja/KursPublikacja.tsx"))).toBe(true);
  });

  it("ekran bez własnego znacznika main", () => {
    const wzorzec = new RegExp("<" + "main\\b");
    const zMain = PLIKI_EKRANU.filter((p) => wzorzec.test(tresc(p)));
    expect(zMain.map((p) => relative(KATALOG_APLIKACJI, p))).toEqual([]);
  });
});
