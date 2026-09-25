import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Świadek `/katalog-komponentow/a` — katalog roboczy (Z-11), nie ekran
 * produktu: poza produkcją renderuje `KatalogA`, w `NODE_ENV=production`
 * kończy się jako 404, żeby katalog nie wyciekł do klienta. Wzorem
 * `app/(uczestnik)/panel/lekcje/[id]/__tests__/lesson-page.test.tsx` atrapa
 * `notFound` rzuca tak, jak robi to prawdziwy Next.js, więc noga przecząca
 * mierzy DOKŁADNIE to wywołanie, a nie jego brak.
 */

const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("next/navigation", () => ({ notFound: () => notFound() }));

const { default: KatalogKomponentowAPage } = await import(
  "@/app/katalog-komponentow/a/page"
);

beforeEach(() => {
  notFound.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/katalog-komponentow/a — poza produkcją", () => {
  it("renderuje katalog przykładów z jego własnym nagłówkiem", () => {
    render(<KatalogKomponentowAPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Katalog komponentów — zestaw A" }),
    ).toBeInTheDocument();
    expect(notFound).not.toHaveBeenCalled();
  });
});

describe("/katalog-komponentow/a — w produkcji (noga przecząca)", () => {
  it("wywołuje notFound i NIE renderuje katalogu przykładów", () => {
    vi.stubEnv("NODE_ENV", "production");

    // Wołane jako zwykła funkcja (nie przez `render()`): komponent rzuca
    // PRZED zwróceniem JSX, więc drzewo Reacta nigdy nie powstaje — dokładnie
    // to samo, co dzieje się na serwerze Next.js. Przez `render()` React w
    // trybie deweloperskim próbuje odzyskać się po błędzie i wywołuje
    // funkcję komponentu wielokrotnie, co zaciemniłoby liczbę wywołań
    // `notFound` niezwiązaną z logiką samego ekranu.
    expect(() => KatalogKomponentowAPage()).toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("heading", { name: "Katalog komponentów — zestaw A" }),
    ).not.toBeInTheDocument();
  });
});
