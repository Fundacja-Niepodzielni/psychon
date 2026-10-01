import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { EmptyStateCard } from "../EmptyStateCard";

const przycisk = { etykieta: "Wróć", onClick: () => {} };

describe("EmptyStateCard — karta z molekułą EmptyState w środku", () => {
  it("wariant pusto: karta niesie nagłówek, treść i jedyny przycisk molekuły", () => {
    render(<EmptyStateCard naglowek="Brak danych" tresc="Dane pojawią się po pierwszym zapisie." przycisk={przycisk} />);
    const karta = screen.getByTestId("karta-stanu-pustego");
    expect(within(karta).getByRole("heading", { level: 2, name: "Brak danych" })).toBeInTheDocument();
    expect(within(karta).getByText("Dane pojawią się po pierwszym zapisie.")).toBeInTheDocument();
    expect(within(karta).getAllByRole("button")).toHaveLength(1);
    expect(within(karta).getByRole("button", { name: "Wróć" })).toBeInTheDocument();
  });

  it("wariant brak-wynikow-filtra: ta sama karta, ta sama treść i przycisk", () => {
    render(
      <EmptyStateCard
        wariant="brak-wynikow-filtra"
        naglowek="Nic nie pasuje"
        tresc="Zmień filtry."
        przycisk={{ etykieta: "Wyczyść filtry", onClick: () => {} }}
      />,
    );
    const karta = screen.getByTestId("karta-stanu-pustego");
    expect(within(karta).getByRole("heading", { level: 2, name: "Nic nie pasuje" })).toBeInTheDocument();
    expect(within(karta).getByText("Zmień filtry.")).toBeInTheDocument();
    expect(within(karta).getAllByRole("button")).toHaveLength(1);
  });

  it("wariant brak-uprawnien: zdanie odmowy z nazwą roli składa molekuła, przycisk jest jeden", () => {
    render(<EmptyStateCard wariant="brak-uprawnien" naglowek="Sekcja administracji" rola="administracji" przycisk={przycisk} />);
    const karta = screen.getByTestId("karta-stanu-pustego");
    expect(within(karta).getByText("Ta funkcja jest dostępna tylko dla administracji.")).toBeInTheDocument();
    expect(within(karta).getAllByRole("button")).toHaveLength(1);
  });

  it("karta jest jednym elementem, a molekuła EmptyState jest jej jedynym dzieckiem", () => {
    render(<EmptyStateCard naglowek="Brak danych" tresc="Treść." przycisk={przycisk} />);
    const karta = screen.getByTestId("karta-stanu-pustego");
    expect(screen.getAllByTestId("karta-stanu-pustego")).toHaveLength(1);
    expect(karta.children).toHaveLength(1);
    expect(karta.firstElementChild).toContainElement(screen.getByRole("heading", { level: 2 }));
    expect(karta.firstElementChild).toContainElement(screen.getByRole("button", { name: "Wróć" }));
  });

  it("jedyny przycisk wola przekazaną funkcję", () => {
    const onClick = vi.fn();
    render(<EmptyStateCard naglowek="Brak danych" tresc="Treść." przycisk={{ etykieta: "Wróć", onClick }} />);
    fireEvent.click(screen.getByRole("button", { name: "Wróć" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("EmptyStateCard — arkusz stylów", () => {
  const css = readFileSync(join(process.cwd(), "design-system/organizmy/EmptyStateCard/EmptyStateCard.module.css"), "utf-8");

  it("karta: tło, ramka, promień i odstęp wyłącznie z tokenów", () => {
    expect(css).toMatch(/background:\s*var\(--card\);/);
    expect(css).toMatch(/border:\s*1px solid var\(--border\);/);
    expect(css).toMatch(/border-radius:\s*var\(--r-md\);/);
    expect(css).toMatch(/padding:\s*var\(--space-16\);/);
    expect(css).toMatch(/display:\s*flex;\s*flex-direction:\s*column;/);
  });

  it("zero kolorów i wymiarów zapisanych wprost poza grubością ramki", () => {
    const deklaracje = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(deklaracje).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(rgb|rgba|hsl|hsla)\(/);
    expect(deklaracje).not.toMatch(/\b\d+(\.\d+)?(px|rem|em)\b(?!\s+solid)/);
  });
});
