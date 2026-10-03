// @vitest-environment node

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Przegląd źródeł ekranu „Powiadomienia”: treść wiadomości (`body_html`) jest
 * pokazywana wyłącznie w ramce `iframe` z pustym `sandbox` (bez
 * `allow-scripts` i `allow-same-origin`), przekazana przez `srcDoc`, i nigdy
 * przez `dangerouslySetInnerHTML`.
 */

const KATALOG = fileURLToPath(new URL("../", import.meta.url));
const PLIKI_EKRANU = readdirSync(KATALOG).filter((nazwa) => /\.(tsx|ts)$/.test(nazwa));
const ZRODLA = PLIKI_EKRANU.map((nazwa) => ({ nazwa, tresc: readFileSync(join(KATALOG, nazwa), "utf8") }));

describe("podgląd wiadomości — źródła ekranu", () => {
  it("żaden plik ekranu nie używa dangerouslySetInnerHTML", () => {
    const naruszenia = ZRODLA.filter((plik) => plik.tresc.includes("dangerouslySetInnerHTML")).map((plik) => plik.nazwa);
    expect(naruszenia).toEqual([]);
  });

  it("ramka z treścią ma atrybut sandbox bez żadnych zezwoleń, a treść idzie przez srcDoc", () => {
    const ramki = ZRODLA.flatMap((plik) =>
      [...plik.tresc.matchAll(/<iframe\b[\s\S]*?\/>|<iframe\b[\s\S]*?<\/iframe>/g)].map((wpis) => ({ plik: plik.nazwa, kod: wpis[0] })),
    );
    expect(ramki.length).toBeGreaterThan(0);
    for (const ramka of ramki) {
      expect(ramka.kod, `${ramka.plik}: sandbox`).toMatch(/\bsandbox=""|\bsandbox=\{""\}/);
      expect(ramka.kod, `${ramka.plik}: srcDoc`).toMatch(/\bsrcDoc=\{/);
      expect(ramka.kod, `${ramka.plik}: zezwolenia`).not.toMatch(/allow-/);
    }
  });

  it("nigdzie w plikach ekranu nie stoi zezwolenie sandboxa", () => {
    const naruszenia = ZRODLA.filter((plik) => /allow-scripts|allow-same-origin/.test(plik.tresc)).map((plik) => plik.nazwa);
    expect(naruszenia).toEqual([]);
  });
});
