import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { adresPodgladu } from "../KolumnaBoczna";

/**
 * Adres „Podgląd jako uczestnik” składa jedna funkcja. Próba liczy też miejsca
 * w kodzie ekranów (bez prób), które wpisują parametr podglądu ręcznie.
 */

const KORZEN = path.resolve(process.cwd(), "nowy-front");

function plikiZrodlowe(katalog: string): string[] {
  return readdirSync(katalog).flatMap((nazwa) => {
    const pelna = path.join(katalog, nazwa);
    if (statSync(pelna).isDirectory()) {
      return nazwa === "__tests__" || nazwa === "node_modules" ? [] : plikiZrodlowe(pelna);
    }
    return /\.(ts|tsx)$/.test(nazwa) ? [pelna] : [];
  });
}

describe("adres podglądu kursu jako uczestnik", () => {
  it("niesie parametr podglądu i slug kursu", () => {
    expect(adresPodgladu({ slug: "wywiad-psychologiczny" })).toBe("/panel/kursy/wywiad-psychologiczny?podglad=1");
  });

  it("parametr podglądu jest wpisany w kodzie ekranów dokładnie w jednym miejscu", () => {
    const miejsca = plikiZrodlowe(KORZEN).flatMap((plik) => {
      const trafienia = readFileSync(plik, "utf8").split(/\r?\n/).filter((linia) => linia.includes("podglad=1"));
      return trafienia.map(() => path.relative(KORZEN, plik).replaceAll("\\", "/"));
    });
    // Komentarz dokumentujący parametr stoi w tym samym pliku co funkcja.
    expect(new Set(miejsca)).toEqual(new Set(["kurs-administracji/KolumnaBoczna.tsx"]));
    const wSamejFunkcji = readFileSync(path.join(KORZEN, "kurs-administracji/KolumnaBoczna.tsx"), "utf8")
      .split(/\r?\n/)
      .filter((linia) => linia.includes("`/panel/kursy/") && linia.includes("podglad=1"));
    expect(wSamejFunkcji).toHaveLength(1);
  });
});
