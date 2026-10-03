import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { KURS_STUDENTA_W_TOKU, LEKCJA_DO_ZROBIENIA } from "./atrapy";

/**
 * Karta „Masz pytanie?” na pulpicie studenta: zdanie i adres nie stoją przy
 * krawędzi karty. Szablon pulpitu wcina w karcie tylko nagłówek (wiersze list
 * niosą własne wcięcie), więc treść karty kontaktu stoi w jednym bloku, który
 * dostaje to samo wcięcie poziome co nagłówek i wiersze innych kart
 * (`--card-px`). Geometrię w przeglądarce mierzy `e2e/pulpit-studenta-karta-kontaktu.spec.ts`.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("../dane", () => ({
  pobierzKursy: vi.fn(async () => [KURS_STUDENTA_W_TOKU]),
  pobierzSzczegolKursu: vi.fn(async () => ({
    ...KURS_STUDENTA_W_TOKU,
    instructor: null,
    topics: [],
    lessons: [LEKCJA_DO_ZROBIENIA],
    materials: [],
  })),
}));

const { PulpitStudenta, ADRES_KONTAKTOWY } = await import("../PulpitStudenta");

const PLIK_CSS = resolve(__dirname, "../PulpitStudenta.module.css");

/** Ciało reguły dla klasy (bez zagnieżdżeń — plik ma proste reguły). */
function regula(css: string, klasa: string): string | null {
  const trafienie = new RegExp(`\\.${klasa}\\s*\\{([^}]*)\\}`).exec(css);
  return trafienie ? trafienie[1] : null;
}

/** Wcięcie poziome z deklaracji `padding` (2–4 wartości) albo `padding-inline`. */
function wciecieWPoziomie(cialo: string): string | null {
  const inline = /padding-inline\s*:\s*([^;]+);/.exec(cialo);
  if (inline) return inline[1].trim();
  const padding = /(?:^|[;\s])padding\s*:\s*([^;]+);/.exec(cialo);
  if (!padding) return null;
  const wartosci = padding[1].trim().split(/\s+(?![^(]*\))/);
  return wartosci.length >= 2 ? wartosci[1] : null;
}

describe("PulpitStudenta — karta „Masz pytanie?” ma wcięcie jak inne karty", () => {
  it("zdanie i adres stoją w jednym bloku pod nagłówkiem, a blok ma wcięcie poziome tokenu karty", async () => {
    render(<PulpitStudenta />);
    const karta = await screen.findByRole("region", { name: "Kontakt" });
    const zdanie = within(karta).getByText("Jeśli czegoś brakuje albo coś nie działa, napisz do nas.");
    const adres = within(karta).getByRole("link", { name: ADRES_KONTAKTOWY });

    const blok = zdanie.parentElement!;
    expect(blok).not.toBe(karta);
    expect(blok.parentElement).toBe(karta);
    expect(blok).toContainElement(adres);
    expect(blok.className).toMatch(/trescKontaktu/);

    const cialo = regula(readFileSync(PLIK_CSS, "utf8"), "trescKontaktu");
    expect(cialo, "reguła .trescKontaktu w PulpitStudenta.module.css").not.toBeNull();
    expect(wciecieWPoziomie(cialo!)).toBe("var(--card-px)");
  });

  it("kontrola dodatnia: odczyt wcięcia rozpoznaje skrót i padding-inline, a pomija brak wcięcia", () => {
    expect(wciecieWPoziomie("padding: var(--space-12) var(--card-px) var(--space-20);")).toBe("var(--card-px)");
    expect(wciecieWPoziomie("padding-inline: var(--card-px);")).toBe("var(--card-px)");
    expect(wciecieWPoziomie("padding: var(--space-20) 0 0;")).toBe("0");
    expect(wciecieWPoziomie("display: flex;")).toBeNull();
    expect(regula(".a { x: 1; }", "trescKontaktu")).toBeNull();
  });
});
