import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import StatRow from "@/components/organisms/StatRow";
import { axeViolations } from "../../__tests__/axe-helper";

const cztery = [
  { value: 12, label: "Kursy", dominant: true, context: "+3 w tym miesiącu" },
  { value: 4, label: "W toku" },
  { value: 8, label: "Ukończone" },
  { value: 1, label: "Zaległe" },
];

// Dominująca celowo NIE na pozycji 0 — świadek ma łapać wyróżnienie
// przypięte do indeksu zamiast do flagi `dominant`.
const dominujacaNiePierwsza = [
  { value: 4, label: "W toku" },
  { value: 12, label: "Kursy", dominant: true, context: "+3 w tym miesiącu" },
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

  it("wyróżnienie i kontekst podążają za flagą dominant, nie za pozycją kafla (Z-3)", () => {
    render(<StatRow items={dominujacaNiePierwsza} />);

    const dominujaca = screen.getByText("12");
    const pierwszyKafel = screen.getByText("4");

    expect(dominujaca.className).toMatch(/\btext-h1\b/);
    expect(pierwszyKafel.className).not.toMatch(/\btext-h1\b/);
    expect(screen.getByText("+3 w tym miesiącu")).toBeInTheDocument();
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

  it("w trybie produkcyjnym nie rzuca błędu przy nadmiarze kafli i obcina renderowanie do 4", () => {
    vi.stubEnv("NODE_ENV", "production");

    try {
      const piec = [...cztery, { value: 2, label: "Nadmiarowy" }];
      expect(() => render(<StatRow items={piec} />)).not.toThrow();

      expect(screen.getByText("Kursy")).toBeInTheDocument();
      expect(screen.getByText("W toku")).toBeInTheDocument();
      expect(screen.getByText("Ukończone")).toBeInTheDocument();
      expect(screen.getByText("Zaległe")).toBeInTheDocument();
      expect(screen.queryByText("Nadmiarowy")).not.toBeInTheDocument();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("w trybie produkcyjnym nie rzuca błędu, gdy brak liczby dominującej", () => {
    vi.stubEnv("NODE_ENV", "production");

    try {
      const bezDominujacej = cztery.map((kafel) => ({ ...kafel, dominant: false }));
      expect(() => render(<StatRow items={bezDominujacej} />)).not.toThrow();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("w trybie produkcyjnym nie rzuca błędu, gdy liczba dominująca jest bez kontekstu", () => {
    vi.stubEnv("NODE_ENV", "production");

    try {
      const bezKontekstu = cztery.map((kafel) =>
        kafel.dominant ? { ...kafel, context: undefined } : kafel,
      );
      expect(() => render(<StatRow items={bezKontekstu} />)).not.toThrow();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("axe: 0 naruszeń dla 4 kafli", async () => {
    const { container } = render(<StatRow items={cztery} />);

    const naruszenia = await axeViolations(container);
    expect(naruszenia).toEqual([]);
  });
});
