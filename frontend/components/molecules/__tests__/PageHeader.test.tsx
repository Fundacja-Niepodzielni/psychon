import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import PageHeader from "@/components/molecules/PageHeader";

/** Rozwiązuje wartość zmiennej CSS przez łańcuch `var(--x)` aż do wartości
 * szesnastkowej. Kopia rozumowania z app/__tests__/design-tokens-p2.test.ts,
 * celowo powielona (nie zaimportowana), żeby ten plik testowy pozostał
 * samodzielny i nie zależał od istnienia/kształtu innego pliku testów. */
function rozwiazZmiennaCss(css: string, nazwa: string, glebokosc = 0): string {
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
    ? rozwiazZmiennaCss(css, zagniezdzona[1], glebokosc + 1)
    : wartosc.toLowerCase();
}

describe("PageHeader", () => {
  it("pokazuje h1 z tytułem i zdanie kontekstu", () => {
    render(<PageHeader title="Kursy" description="Twoja ścieżka szkoleniowa." />);

    expect(screen.getByRole("heading", { level: 1, name: "Kursy" })).toBeInTheDocument();
    expect(screen.getByText("Twoja ścieżka szkoleniowa.")).toBeInTheDocument();
  });

  it("noga negatywna: bez opisu i akcji renderuje sam nagłówek, bez zbędnych węzłów", () => {
    render(<PageHeader title="Kursy" />);

    expect(screen.getByRole("heading", { level: 1, name: "Kursy" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renderuje najwyżej jedną akcję główną, gdy podana", () => {
    render(<PageHeader title="Kursy" action={<button type="button">Nowy kurs</button>} />);

    expect(screen.getByRole("button", { name: "Nowy kurs" })).toBeInTheDocument();
  });

  it("h1 ma KOLOR WYLICZONY czarny #1a1a1a (przez łańcuch tokenu roli), nie nazwę konkretnej klasy", () => {
    // jsdom nie liczy kaskady Tailwinda, więc nie da się tu odczytać computed
    // style (getComputedStyle zwróci puste wartości dla klas wygenerowanych
    // przez Tailwind). Zamiast żądać dosłownej nazwy klasy (np. 'text-ink'),
    // co czerwieniłoby poprawny kod używający innej roli koloru o tej samej
    // wartości (np. 'text-heading' — nagłówek ekranu ma własną rolę koloru,
    // patrz app/globals.css: --color-heading -> --psy-heading ->
    // --psy-text-strong, ta sama wartość co --color-ink), mierzymy WARTOŚĆ:
    // z klasy koloru na h1 wyprowadzamy zmienną `--color-*` i rozwiązujemy
    // cały łańcuch `var(--x)` w app/globals.css aż do szesnastkowej wartości.
    //
    // Test jest czerwony przy KAŻDEJ z trzech osobnych mutacji:
    //  1) klasa koloru na h1 w PageHeader.tsx zmieniona na inną rolę koloru
    //     (np. text-primary/text-accent/text-muted/text-body) — te role
    //     rozwiązują się do innych wartości niż #1a1a1a w app/globals.css;
    //  2) klasa koloru na h1 usunięta w całości — wtedy nie znajdujemy
    //     dokładnie jednej klasy koloru i test pada na długości listy;
    //  3) wartość tokenu, z którego wywodzi się kolor nagłówka
    //     (--psy-text-strong) w app/globals.css zmieniona na inny kolor —
    //     łańcuch rozwiązuje się wtedy do tej innej wartości.
    render(<PageHeader title="Kursy" />);

    const naglowek = screen.getByRole("heading", { level: 1, name: "Kursy" });
    const klasy = naglowek.className.split(/\s+/).filter(Boolean);
    const klasyKoloru = klasy.filter((k) =>
      /^text-(heading|ink|accent|accent-dark|primary|muted|body)$/.test(k),
    );

    expect(
      klasyKoloru,
      `dokładnie jedna klasa koloru na h1, znaleziono: ${klasy.join(", ") || "(brak)"}`,
    ).toHaveLength(1);

    const zmienna = `--color-${klasyKoloru[0].replace(/^text-/, "")}`;
    const css = readFileSync(
      path.join(process.cwd(), "app", "globals.css"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "");

    expect(rozwiazZmiennaCss(css, zmienna)).toBe("#1a1a1a");
  });
});
