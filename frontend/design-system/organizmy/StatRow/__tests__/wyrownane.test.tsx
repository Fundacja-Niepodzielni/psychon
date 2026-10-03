import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { StatRow } from "../StatRow";

/**
 * Rząd liczb z wyrównaniem (`wyrownane`): od 1180 px liczby czterech kafli stoją
 * na jednej linii, a paski i podpowiedzi zaczynają się na jednej wysokości. Układ
 * robi CSS (subgrid), a jego warunkiem jest struktura: kafel rzędu ma najwyżej
 * TRZY dzieci — podpis, liczbę i jeden blok pod nią. Tu pilnujemy struktury i
 * reguł arkuszy; położenia mierzy próba przeglądarkowa
 * (`e2e/pulpity-rowne-kafle.spec.ts`).
 */

const KAFLE = [
  { id: "k-kursy", etykieta: "Kursy w programie", wartosc: 2, mianownik: "z 5 ukończone", procent: 40, dominujacy: true },
  {
    id: "k-biezacy",
    etykieta: "Bieżący kurs",
    wartosc: 40,
    mianownik: "% ukończone",
    procent: 40,
    podpowiedz: "Wywiad psychologiczny",
  },
  { id: "k-staz", etykieta: "Dziennik stażu", wartosc: 18, mianownik: "z 72 godzin" },
  { id: "k-hint", etykieta: "Superwizja", wartosc: 1, mianownik: "z 3 odbyta", podpowiedz: "najbliższa 4 października" },
];

function kafelWKomorce(komorka: HTMLElement): HTMLElement {
  const kafel = komorka.querySelector("[data-wyrownany], [data-dominujacy]") ?? komorka.firstElementChild;
  if (!(kafel instanceof HTMLElement)) throw new Error("komórka bez kafla");
  return kafel;
}

describe("StatRow z wyrownane — struktura kafla", () => {
  it("rząd niesie znacznik wyrównania, a każdy kafel ma najwyżej trzy dzieci (także z paskiem i podpowiedzią naraz)", () => {
    render(<StatRow kafle={KAFLE} wyrownane />);
    const rzad = screen.getByRole("list");
    expect(rzad).toHaveAttribute("data-wyrownane");
    const komorki = within(rzad).getAllByRole("listitem");
    expect(komorki).toHaveLength(4);
    for (const komorka of komorki) {
      const kafel = kafelWKomorce(komorka);
      expect(kafel).toHaveAttribute("data-wyrownany");
      expect(kafel.children.length, kafel.outerHTML).toBeLessThanOrEqual(3);
    }
  });

  it("kafel z paskiem i podpowiedzią: trzecie dziecko to jeden blok z paskiem i podpowiedzią (kontrola: bez wyrównania są to dwa osobne dzieci)", () => {
    const { unmount } = render(<StatRow kafle={KAFLE} wyrownane />);
    const kafel = kafelWKomorce(screen.getAllByRole("listitem")[1]);
    expect(kafel.children).toHaveLength(3);
    const blok = kafel.children[2] as HTMLElement;
    expect(within(blok).getByRole("progressbar")).toBeInTheDocument();
    expect(within(blok).getByText("Wywiad psychologiczny")).toBeInTheDocument();
    unmount();

    render(<StatRow kafle={KAFLE} />);
    const bez = screen.getAllByRole("listitem")[1].firstElementChild as HTMLElement;
    expect(bez.children).toHaveLength(4);
    expect(bez).not.toHaveAttribute("data-wyrownany");
  });

  it("kafle bez paska i bez podpowiedzi mają dwoje dzieci, kafel z samym paskiem albo samą podpowiedzią — troje", () => {
    render(<StatRow kafle={KAFLE} wyrownane />);
    const liczby = screen.getAllByRole("listitem").map((komorka) => kafelWKomorce(komorka).children.length);
    expect(liczby).toEqual([3, 3, 2, 3]);
  });

  it("kafel-odnośnik: odnośnik owija kafel, a kafel nadal ma trzy dzieci", () => {
    render(<StatRow kafle={KAFLE.map((kafel) => ({ ...kafel, href: "/panel/kursy" }))} wyrownane />);
    const komorka = screen.getAllByRole("listitem")[1];
    const odnosnik = komorka.firstElementChild as HTMLElement;
    expect(odnosnik.tagName).toBe("A");
    const kafel = odnosnik.firstElementChild as HTMLElement;
    expect(kafel).toHaveAttribute("data-wyrownany");
    expect(kafel.children).toHaveLength(3);
  });

  it("bez właściwości `wyrownane` rząd i kafle zostają bez znaczników (karta osoby: do czworga dzieci)", () => {
    render(<StatRow kafle={KAFLE} />);
    expect(screen.getByRole("list")).not.toHaveAttribute("data-wyrownane");
    expect(document.querySelector("[data-wyrownany]")).toBeNull();
  });
});

describe("StatRow z duzeLiczby", () => {
  it("rząd niesie znacznik, a kafel nie zmienia struktury", () => {
    render(<StatRow kafle={KAFLE} duzeLiczby />);
    expect(screen.getByRole("list")).toHaveAttribute("data-duze-liczby");
    expect(document.querySelector("[data-wyrownany]")).toBeNull();
    expect((screen.getAllByRole("listitem")[1].firstElementChild as HTMLElement).children).toHaveLength(4);
  });
});

describe("arkusze wyrównania", () => {
  const arkuszRzedu = readFileSync(join(process.cwd(), "design-system/organizmy/StatRow/StatRow.module.css"), "utf-8");
  const arkuszKafla = readFileSync(join(process.cwd(), "design-system/molekuly/StatTile/StatTile.module.css"), "utf-8");

  /** Treść bloku `@media (min-width: …) { … }` z podanego arkusza (zagnieżdżone nawiasy klamrowe liczone). */
  function blokiMedia(arkusz: string, szerokosc: number): string[] {
    const bloki: string[] = [];
    const wzor = new RegExp(`@media \\(min-width: ${szerokosc}px\\) \\{`, "g");
    for (const dopasowanie of arkusz.matchAll(wzor)) {
      let glebokosc = 1;
      let i = (dopasowanie.index ?? 0) + dopasowanie[0].length;
      const poczatek = i;
      while (glebokosc > 0 && i < arkusz.length) {
        if (arkusz[i] === "{") glebokosc += 1;
        if (arkusz[i] === "}") glebokosc -= 1;
        i += 1;
      }
      bloki.push(arkusz.slice(poczatek, i - 1));
    }
    return bloki;
  }

  it("podsiatka i linia bazowa liczby tylko od 1180 px, wyłącznie dla kafli i rzędów z `wyrownane`", () => {
    const rzad = blokiMedia(arkuszRzedu, 1180).join("\n");
    expect(rzad).toMatch(/\.rzad\[data-wyrownane\][\s\S]*grid-template-rows: auto auto auto/);
    expect(rzad).toMatch(/\.komorka\s*\{[^}]*grid-template-rows: subgrid/);
    const kafel = blokiMedia(arkuszKafla, 1180).join("\n");
    expect(kafel).toMatch(/\.kafel\[data-wyrownany\]\s*\{[^}]*grid-template-rows: subgrid/);
    expect(kafel).toMatch(/\.kafel\[data-wyrownany\] \.wartosc\s*\{[^}]*align-self: baseline/);
    // Poza blokiem od 1180 px żaden arkusz nie używa subgridu ani linii bazowej liczby.
    for (const arkusz of [arkuszRzedu, arkuszKafla]) {
      const poza = arkusz.replace(/@media \(min-width: 1180px\) \{[\s\S]*?\n\}\n/g, "");
      expect(poza).not.toMatch(/subgrid/);
      expect(poza).not.toMatch(/align-self: baseline/);
    }
  });
});
