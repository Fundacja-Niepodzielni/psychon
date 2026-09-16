import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import StatRow from "@/components/organisms/StatRow";
import { axeViolations } from "../../molecules/__tests__/axe-helper";

const cztery = [
  { value: 12, label: "Kursy", dominant: true, context: "+3 w tym miesiącu" },
  { value: 4, label: "W toku" },
  { value: 8, label: "Ukończone" },
  { value: 1, label: "Zaległe" },
];

describe("StatRow", () => {
  it("renderuje 4 kafle", () => {
    render(<StatRow items={cztery} />);

    expect(screen.getByText("Kursy")).toBeInTheDocument();
    expect(screen.getByText("W toku")).toBeInTheDocument();
    expect(screen.getByText("Ukończone")).toBeInTheDocument();
    expect(screen.getByText("Zaległe")).toBeInTheDocument();
  });

  it("liczba dominująca jest wyróżniona większą czcionką niż kafle zwykłe (Z-3)", () => {
    render(<StatRow items={cztery} />);

    const dominujaca = screen.getByText("12");
    const zwykla = screen.getByText("4");

    expect(dominujaca.className).toMatch(/\btext-h1\b/);
    expect(zwykla.className).not.toMatch(/\btext-h1\b/);
    expect(zwykla.className).toMatch(/\btext-h3\b/);
  });

  it("piąty kafel w trybie deweloperskim rzuca błąd (nie cichy render)", () => {
    const piec = [...cztery, { value: 2, label: "Nadmiarowy" }];

    expect(() => render(<StatRow items={piec} />)).toThrow(/najwyżej 4 kafle/);
  });

  it("0 liczb dominujących w trybie deweloperskim rzuca błąd (Z-3)", () => {
    const bezDominujacej = cztery.map((kafel) => ({ ...kafel, dominant: false }));

    expect(() => render(<StatRow items={bezDominujacej} />)).toThrow(
      /dokładnie jedna liczba dominująca/,
    );
  });

  it("2 liczby dominujące w trybie deweloperskim rzucają błąd (Z-3)", () => {
    const dwieDominujace = cztery.map((kafel, index) =>
      index < 2 ? { ...kafel, dominant: true } : kafel,
    );

    expect(() => render(<StatRow items={dwieDominujace} />)).toThrow(
      /dokładnie jedna liczba dominująca/,
    );
  });

  it("liczba dominująca bez kontekstu w trybie deweloperskim rzuca błąd (Z-3)", () => {
    const bezKontekstu = cztery.map((kafel) =>
      kafel.dominant ? { ...kafel, context: undefined } : kafel,
    );

    expect(() => render(<StatRow items={bezKontekstu} />)).toThrow(
      /liczba dominująca musi mieć kontekst/,
    );
  });

  it("axe: 0 naruszeń dla 4 kafli", async () => {
    const { container } = render(<StatRow items={cztery} />);

    const naruszenia = await axeViolations(container);
    expect(naruszenia).toEqual([]);
  });
});
