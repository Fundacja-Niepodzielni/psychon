import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Arkusz strony lekcji nie wydłuża strony w poziomie na ekranie bez ramki panelu:
 * - wiersz nawigacji (powrót do kursu, sąsiednie lekcje) ma wcięcie poziome równe ujemnemu
 *   marginesowi odnośnika (`Link`: 2 px), więc skrajne odnośniki nie wychodzą poza wiersz;
 * - tekst dla czytnika ekranu to wzorzec z `clip` i marginesem −1 px, a nie samo ułożenie
 *   pozycją — pudełko nie zostaje na krawędzi okna.
 * Prawdziwy pomiar (`scrollWidth`) robi próba przeglądarkowa `e2e/przewijanie-w-bok-administracji.spec.ts`.
 */
const css = readFileSync(resolve(process.cwd(), "nowy-front/lekcja-edycja/StronaLekcji.module.css"), "utf-8");

function blok(selektor: string, od = 0): string {
  const poczatek = css.indexOf(`${selektor} {`, od);
  expect(poczatek, `blok ${selektor}`).toBeGreaterThanOrEqual(0);
  return css.slice(poczatek, css.indexOf("}", poczatek));
}

describe("StronaLekcji.module.css — bez przewijania w bok", () => {
  it("wiersz nawigacji ma wcięcie poziome na ujemny margines odnośnika", () => {
    expect(blok(".nawigacja")).toContain("padding-inline: var(--space-2)");
  });

  it("tekst dla czytnika ekranu przy odnośnikach lekcji: clip i margines −1 px", () => {
    const wTelefonie = css.indexOf("@media (max-width: 599px)");
    expect(wTelefonie).toBeGreaterThanOrEqual(0);
    const slowo = blok(".slowoLekcja", wTelefonie);
    expect(slowo).toContain("clip: rect(0 0 0 0)");
    expect(slowo).toContain("margin: -1px");
    expect(slowo).toContain("overflow: hidden");
  });

  it("pozostałe teksty tylko dla czytnika w tym arkuszu mają ten sam wzorzec", () => {
    const ukryte = blok(".tylkoCzytnika,\n.slowoLekcjaUkryte");
    expect(ukryte).toContain("clip: rect(0 0 0 0)");
    expect(ukryte).toContain("margin: -1px");
  });
});
