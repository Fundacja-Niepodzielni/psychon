import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Świadek `/katalog-komponentow/b` — katalog roboczy organizmów panelu
 * (Z-11), nie ekran produktu: poza produkcją renderuje `KatalogPrzykladyB`,
 * w `NODE_ENV=production` kończy się jako 404. Ten sam kształt co
 * `/katalog-komponentow/a` — patrz `katalog-komponentow-a.test.tsx` — dla
 * drugiego wariantu katalogu.
 */

const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("next/navigation", () => ({ notFound: () => notFound() }));

const { default: KatalogKomponentowBPage } = await import(
  "@/app/katalog-komponentow/b/page"
);

beforeEach(() => {
  notFound.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/katalog-komponentow/b — poza produkcją", () => {
  it("renderuje katalog przykładów organizmów panelu z jego własnym nagłówkiem", () => {
    render(<KatalogKomponentowBPage />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Katalog komponentów — organizmy panelu",
      }),
    ).toBeInTheDocument();
    expect(notFound).not.toHaveBeenCalled();
  });
});

describe("/katalog-komponentow/b — w produkcji (noga przecząca)", () => {
  it("wywołuje notFound i NIE renderuje katalogu przykładów", () => {
    vi.stubEnv("NODE_ENV", "production");

    // Wołane jako zwykła funkcja — patrz komentarz w
    // `katalog-komponentow-a.test.tsx` (ten sam powód: `render()` w trybie
    // deweloperskim Reacta wywołałby funkcję komponentu wielokrotnie po
    // błędzie, zaciemniając liczbę wywołań `notFound`).
    expect(() => KatalogKomponentowBPage()).toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("heading", { name: "Katalog komponentów — organizmy panelu" }),
    ).not.toBeInTheDocument();
  });
});
