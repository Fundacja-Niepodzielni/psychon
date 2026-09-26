import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import StatTile from "@/components/molecules/StatTile";
import { axeViolations } from "../../__tests__/axe-helper";

describe("StatTile", () => {
  it("pokazuje jedną liczbę i etykietę (wariant zwykła domyślnie)", () => {
    render(<StatTile value={12} label="Aktywne kursy" />);

    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Aktywne kursy")).toBeInTheDocument();
  });

  it("wariant dominująca renderuje kontekst", () => {
    render(
      <StatTile
        value={128}
        label="Uczestnicy"
        variant="dominant"
        context="+12 w tym tygodniu"
      />,
    );

    expect(screen.getByText("+12 w tym tygodniu")).toBeInTheDocument();
  });

  it("wariant zwykła pomija kontekst, nawet gdy podany", () => {
    render(<StatTile value={5} label="Otwarte zgłoszenia" context="powinno zniknąć" />);

    // StatTile pomija węzeł kontekstu w wariancie zwykłym synchronicznie, na
    // podstawie props variant przekazanych do render() wyżej — bez efektu.
    expect(screen.queryByText("powinno zniknąć")).not.toBeInTheDocument();
  });

  it("noga negatywna: bez kontekstu w wariancie dominującym nie renderuje pustego węzła kontekstu", () => {
    render(<StatTile value={7} label="Certyfikaty" variant="dominant" />);

    expect(screen.getByText("7")).toBeInTheDocument();
    // Bez props context StatTile nie renderuje pustego węzła kontekstu w
    // tym samym, synchronicznym render() wyżej — brak wartości nie jest
    // stanem ustalanym asynchronicznie.
    expect(screen.queryByText("undefined")).not.toBeInTheDocument();
  });

  it("axe: 0 naruszeń", async () => {
    const { container } = render(
      <StatTile value={128} label="Uczestnicy" variant="dominant" context="+12 w tym tygodniu" />,
    );

    const naruszenia = await axeViolations(container);
    expect(naruszenia).toEqual([]);
  });
});
