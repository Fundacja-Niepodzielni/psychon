import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import StatRow from "@/components/organisms/StatRow";
import { axeViolations } from "./axe-helper";

const cztery = [
  { value: 12, label: "Kursy", dominant: true },
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

  it("piąty kafel w trybie deweloperskim rzuca błąd (nie cichy render)", () => {
    const piec = [...cztery, { value: 2, label: "Nadmiarowy" }];

    expect(() => render(<StatRow items={piec} />)).toThrow(/najwyżej 4 kafle/);
  });

  it("axe: 0 naruszeń dla 4 kafli", async () => {
    const { container } = render(<StatRow items={cztery} />);

    const naruszenia = await axeViolations(container);
    expect(naruszenia).toEqual([]);
  });
});
