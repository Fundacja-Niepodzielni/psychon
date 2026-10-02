import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { maTekst } from "../dane";

const katalog = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Pliki ekranu: wszystkie `.tsx` i `.css` katalogu ekranu, bez testów. */
function plikiEkranu(): { nazwa: string; tresc: string }[] {
  return readdirSync(katalog)
    .filter((nazwa) => /\.(tsx|css)$/.test(nazwa))
    .map((nazwa) => ({ nazwa, tresc: readFileSync(resolve(katalog, nazwa), "utf-8") }));
}

/** Surowe elementy interaktywne i `onClick` na elementach HTML (nie na atomach). */
function surowaInterakcja(zrodlo: string): string[] {
  return zrodlo.match(/<(button|a|input|select|textarea)[\s>]|<[a-z][\w-]*\s[^>]*\bonClick=/g) ?? [];
}

function twardyKolor(zrodlo: string): string[] {
  return zrodlo.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g) ?? [];
}

function importZKomponentow(zrodlo: string): string[] {
  return zrodlo.match(/from\s+["'](@\/components|\.\.?\/(\.\.\/)*components)\//g) ?? [];
}

describe("pliki ekranu lekcji — struktura", () => {
  it("dostrzega surowy element interaktywny (kontrola detektora)", () => {
    expect(surowaInterakcja("<div><button type='button'>x</button></div>")).not.toHaveLength(0);
    expect(surowaInterakcja('<a href="/x">x</a>')).not.toHaveLength(0);
    expect(surowaInterakcja("<div className={a} onClick={f}>x</div>")).not.toHaveLength(0);
    expect(surowaInterakcja("<Button poziom='outline' onClick={f}>x</Button>")).toHaveLength(0);
  });

  it("brak surowych elementów interaktywnych i onClick na elementach HTML", () => {
    const tsx = plikiEkranu().filter((p) => p.nazwa.endsWith(".tsx"));
    expect(tsx.length).toBeGreaterThan(0);
    for (const plik of tsx) {
      expect(surowaInterakcja(plik.tresc), plik.nazwa).toEqual([]);
    }
  });

  it("dostrzega twardy kolor (kontrola detektora)", () => {
    expect(twardyKolor("color: #fff;")).not.toHaveLength(0);
    expect(twardyKolor("background: rgb(0, 0, 0);")).not.toHaveLength(0);
    expect(twardyKolor("color: var(--text);")).toHaveLength(0);
  });

  it("brak twardych kolorów", () => {
    for (const plik of plikiEkranu()) {
      expect(twardyKolor(plik.tresc), plik.nazwa).toEqual([]);
    }
  });

  it("dostrzega import z components (kontrola detektora)", () => {
    expect(importZKomponentow('import { X } from "@/components/ui/X";')).not.toHaveLength(0);
    expect(importZKomponentow('import { X } from "@/design-system/atomy/X/X";')).toHaveLength(0);
  });

  it("brak importów z components i brak wstrzykiwania HTML", () => {
    for (const plik of plikiEkranu()) {
      expect(importZKomponentow(plik.tresc), plik.nazwa).toEqual([]);
      expect(plik.tresc, plik.nazwa).not.toContain("dangerouslySetInnerHTML");
    }
  });
});

describe("maTekst", () => {
  it("maTekst: tylko niepusty tekst po przycięciu", () => {
    expect(maTekst(null)).toBe(false);
    expect(maTekst("")).toBe(false);
    expect(maTekst("   ")).toBe(false);
    expect(maTekst("\n\t")).toBe(false);
    expect(maTekst("a")).toBe(true);
  });
});

/**
 * Odtwarzacz nagrania stoi w jednym wąskim punkcie (`odtwarzacz/`): tylko tam
 * wolno mieć surowe elementy sterujące ramki. Reszta reguł (kolory, importy,
 * HTML) obowiązuje także tam; ekran poza tym katalogiem nie sięga do ramki.
 */
describe("punkt odtwarzacza", () => {
  const katalogOdtwarzacza = resolve(katalog, "odtwarzacz");
  const pliki = readdirSync(katalogOdtwarzacza)
    .filter((nazwa) => /\.(tsx|css)$/.test(nazwa))
    .map((nazwa) => ({ nazwa, tresc: readFileSync(resolve(katalogOdtwarzacza, nazwa), "utf-8") }));

  it("jest jeden komponent i jeden plik stylów", () => {
    expect(pliki.map((p) => p.nazwa).sort()).toEqual(["OdtwarzaczNagrania.module.css", "OdtwarzaczNagrania.tsx"]);
  });

  it("bez twardych kolorów, importów z components i wstrzykiwania HTML", () => {
    for (const plik of pliki) {
      expect(twardyKolor(plik.tresc), plik.nazwa).toEqual([]);
      expect(importZKomponentow(plik.tresc), plik.nazwa).toEqual([]);
      expect(plik.tresc, plik.nazwa).not.toContain("dangerouslySetInnerHTML");
    }
  });

  it("bez żądań sieciowych: ani fetch, ani adresów dostawcy nagrań", () => {
    const komponent = pliki.find((p) => p.nazwa.endsWith(".tsx"))!.tresc;
    expect(komponent).not.toMatch(/fetch\(|XMLHttpRequest|<iframe|<video|new Audio|https?:\/\//);
  });

  it("ekran importuje odtwarzacz wyłącznie przez ten jeden komponent", () => {
    const ekran = readFileSync(resolve(katalog, "Lekcja.tsx"), "utf-8");
    const importy = ekran.match(/from\s+["']\.\/odtwarzacz\/[^"']+["']/g) ?? [];
    expect(importy).toEqual(['from "./odtwarzacz/OdtwarzaczNagrania"']);
  });
});
