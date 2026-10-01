import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CourseTree, type TematCourseTree } from "../CourseTree";

/**
 * Próby drzewa kursu dla upuszczenia i nazw przycisków pasma tematu:
 *  1) upuszczenie lekcji na pasmo tematu i na wiersz lekcji zatrzymuje domyślną
 *     czynność przeglądarki (np. otwarcie przeciąganego adresu);
 *  2) przyciski pasma niosą nazwę tematu w nazwie dostępnej, a widoczny tekst
 *     stoi na jej początku.
 */

const TEMATY: TematCourseTree[] = [
  { id: "t1", tytul: "Wprowadzenie", lekcje: [{ id: "l1", tytul: "Powitanie", czasMin: 12 }] },
  { id: "t2", tytul: "Praktyka", lekcje: [{ id: "l3", tytul: "Pierwsze zadanie", czasMin: 20 }] },
];

function akcje() {
  return {
    onPrzenies: vi.fn(),
    onDodajLekcje: vi.fn(),
    onZmienTytulLekcji: vi.fn(),
    onZapisz: vi.fn(),
    onCofnij: vi.fn(),
    onPorzucWszystko: vi.fn(),
    liczbaZmian: 0,
    pusty: { naglowek: "Brak tematów", tresc: "Dodaj pierwszy temat.", przycisk: { etykieta: "Dodaj temat", onClick: vi.fn() } },
  };
}

describe("CourseTree — upuszczenie", () => {
  it("upuszczenie na pasmo tematu zatrzymuje domyślną czynność przeglądarki", () => {
    render(<CourseTree tematy={TEMATY} {...akcje()} />);
    const pasmo = screen.getByRole("heading", { name: "Praktyka" }).parentElement!;

    // `fireEvent` zwraca `false`, gdy obsługa zawołała `preventDefault()`.
    expect(fireEvent.drop(pasmo)).toBe(false);
  });

  it("upuszczenie na wiersz lekcji zatrzymuje domyślną czynność przeglądarki", () => {
    const { container } = render(<CourseTree tematy={TEMATY} {...akcje()} />);
    const wiersz = container.querySelector<HTMLElement>('[data-lekcja="l3"]')!;

    expect(fireEvent.drop(wiersz)).toBe(false);
  });
});

describe("CourseTree — przyciski pasma tematu", () => {
  it("„Dodaj lekcję w tym temacie” ma w nazwie dostępnej nazwę tematu, tekst widoczny stoi na początku", () => {
    render(<CourseTree tematy={TEMATY} {...akcje()} />);
    const przycisk = screen.getByRole("button", { name: "Dodaj lekcję w tym temacie „Praktyka”" });

    expect(przycisk).toHaveTextContent("Dodaj lekcję w tym temacie");
    expect(screen.getAllByRole("button", { name: /^Dodaj lekcję w tym temacie „/ })).toHaveLength(2);
  });

  it("„Zwiń” i „Rozwiń” mają w nazwie dostępnej nazwę tematu", async () => {
    render(<CourseTree tematy={TEMATY} {...akcje()} />);
    const przycisk = screen.getByRole("button", { name: "Zwiń temat „Praktyka”" });
    expect(przycisk).toHaveTextContent("Zwiń");

    await userEvent.click(przycisk);

    const zwiniety = screen.getByRole("button", { name: "Rozwiń temat „Praktyka”" });
    expect(zwiniety).toHaveTextContent("Rozwiń");
    expect(zwiniety).toHaveAttribute("aria-expanded", "false");
  });
});
