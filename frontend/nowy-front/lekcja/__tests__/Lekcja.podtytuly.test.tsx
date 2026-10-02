import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { KURS, LEKCJA, zrodloRamki } from "./pomoce";

/**
 * Podtytuły z treści lekcji są o stopień mniejsze niż tytuł karty „Treść lekcji” — samym stylem
 * w obrębie karty: pogrubiony tekst wielkości akapitu z odstępem nad. Poziomy nagłówków w kodzie
 * strony (h2 i h3) zostają bez zmiany. jsdom nie liczy arkuszy modułów, więc styl czyta próba
 * z pliku arkusza ekranu i porównuje z arkuszem akapitu; wymiar na stronie mierzy przeglądarka w e2e.
 */

const pobierzDaneLekcji = vi.fn();
const pobierzOdczytKursu = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("../dane", async (importOriginal) => {
  const original = await importOriginal<typeof import("../dane")>();
  return { ...original, pobierzDaneLekcji: (...args: unknown[]) => pobierzDaneLekcji(...args), pobierzPytania: async () => [] };
});

vi.mock("../kurs", async (importOriginal) => {
  const original = await importOriginal<typeof import("../kurs")>();
  return { ...original, pobierzOdczytKursu: (...args: unknown[]) => pobierzOdczytKursu(...args) };
});

const { Lekcja } = await import("../Lekcja");

const TRESC = "## Cel lekcji\n\nPo tej lekcji rozpoznasz sygnały kryzysu.\n\n### Na co patrzeć\n\nNa ton głosu.\n\n## Przebieg\n\nKrok po kroku.";

beforeEach(() => {
  pobierzDaneLekcji.mockReset();
  pobierzOdczytKursu.mockReset();
  pobierzOdczytKursu.mockResolvedValue(KURS);
});

async function otworzZTrescia() {
  pobierzDaneLekcji.mockResolvedValue({
    status: "ok",
    dane: { ...LEKCJA, content: TRESC },
    bezNagrania: false,
    zrodloNagrania: zrodloRamki(),
  });
  render(<Lekcja id="21" />);
  return screen.findByRole("region", { name: "Treść lekcji" });
}

function odczytajArkusz(sciezka: string): string {
  return readFileSync(resolve(__dirname, sciezka), "utf8");
}

function regula(arkusz: string, selektor: RegExp): string {
  const trafienie = selektor.exec(arkusz);
  if (!trafienie) throw new Error(`brak reguły ${selektor}`);
  return trafienie[1];
}

describe("Lekcja — podtytuły w treści lekcji", () => {
  it("poziomy nagłówków bez zmiany: tytuł karty i dwa podtytuły to h2, jeden podtytuł to h3", async () => {
    const tresc = await otworzZTrescia();

    expect(within(tresc).getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Treść lekcji",
      "Cel lekcji",
      "Przebieg",
    ]);
    expect(within(tresc).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Na co patrzeć"]);
  });

  it("podtytuły z treści stoją w obudowie treści, a tytuł karty poza nią", async () => {
    const tresc = await otworzZTrescia();

    const obudowa = within(tresc).getByText("Po tej lekcji rozpoznasz sygnały kryzysu.").closest('[class*="tresc"]');
    expect(obudowa).not.toBeNull();
    for (const nazwa of ["Cel lekcji", "Na co patrzeć", "Przebieg"]) {
      expect(obudowa).toContainElement(within(tresc).getByRole("heading", { name: nazwa }));
    }
    expect(obudowa).not.toContainElement(within(tresc).getByRole("heading", { name: "Treść lekcji" }));
  });

  it("styl podtytułu: wielkość akapitu i pogrubienie, odstęp nad, h2 i h3 tak samo", () => {
    const arkusz = odczytajArkusz("../Lekcja.module.css");
    const podtytul = regula(arkusz, /\.tresc h2,\s*\.tresc h3\s*\{([^}]*)\}/);
    const akapit = regula(odczytajArkusz("../../../design-system/atomy/Text/Text.module.css"), /\.tekst\s*\{([^}]*)\}/);

    const wielkoscAkapitu = /font-size:\s*([^;]+);/.exec(akapit)?.[1];
    expect(wielkoscAkapitu).toBe("var(--fs-8)");
    expect(podtytul).toContain(`font-size: ${wielkoscAkapitu};`);
    expect(podtytul).toMatch(/font-weight:\s*var\(--fw-bold\);/);
    expect(podtytul).toMatch(/margin-top:\s*var\(--space-\d+\);/);
  });
});
