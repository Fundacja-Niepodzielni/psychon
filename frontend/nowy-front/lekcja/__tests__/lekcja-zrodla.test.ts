import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { maTekst, okruszkiLekcji, ukladGlownej } from "../dane";

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

describe("ukladGlownej", () => {
  const OPIS = "Opis lekcji";
  const TRESC = "Treść lekcji";

  it("z nagraniem zawsze odtwarzacz", () => {
    expect(ukladGlownej({ description: null, content: null }, false)).toBe("odtwarzacz");
    expect(ukladGlownej({ description: OPIS, content: TRESC }, false)).toBe("odtwarzacz");
  });

  it("bez nagrania, z opisem: odtwarzacz (sam pokazuje opis bez ramki)", () => {
    expect(ukladGlownej({ description: OPIS, content: null }, true)).toBe("odtwarzacz");
  });

  it("bez nagrania i bez opisu, z treścią: sama treść", () => {
    expect(ukladGlownej({ description: null, content: TRESC }, true)).toBe("sama-tresc");
    expect(ukladGlownej({ description: "  ", content: TRESC }, true)).toBe("sama-tresc");
  });

  it("bez nagrania, opisu i treści: stan pusty", () => {
    expect(ukladGlownej({ description: null, content: null }, true)).toBe("pusta");
    expect(ukladGlownej({ description: "", content: "  \n" }, true)).toBe("pusta");
  });
});

describe("maTekst i okruszkiLekcji", () => {
  it("maTekst: tylko niepusty tekst po przycięciu", () => {
    expect(maTekst(null)).toBe(false);
    expect(maTekst("")).toBe(false);
    expect(maTekst(" \n\t")).toBe(false);
    expect(maTekst("a")).toBe(true);
  });

  it("okruszki: temat tylko gdy lekcja go ma", () => {
    expect(okruszkiLekcji({ title: "L", topic: null })).toEqual([{ etykieta: "Kursy" }, { etykieta: "L" }]);
    expect(okruszkiLekcji({ title: "L", topic: { id: 1, title: "T", position: 1 } })).toEqual([
      { etykieta: "Kursy" },
      { etykieta: "T" },
      { etykieta: "L" },
    ]);
  });
});
