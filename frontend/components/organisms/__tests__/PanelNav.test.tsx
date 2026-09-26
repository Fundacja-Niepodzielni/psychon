import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { axeViolations } from "../../__tests__/axe-helper";
import PanelNav, { type PanelNavGroup } from "@/components/organisms/PanelNav";

const grupyPlaskie: PanelNavGroup[] = [
  {
    items: [
      { label: "Pulpit", href: "/panel" },
      { label: "Kursy", href: "/panel/kursy" },
    ],
  },
];

const grupyNazwane: PanelNavGroup[] = [
  {
    label: "Szkolenia",
    items: [
      { label: "Kursy", href: "/panel/kursy" },
      { label: "Egzaminy", href: "/panel/egzaminy" },
    ],
  },
  {
    label: "Konto",
    items: [{ label: "Ustawienia", href: "/panel/ustawienia" }],
  },
];

describe("PanelNav", () => {
  it("render w spoczynku: pojedyncza płaska lista bez nagłówka grupy", () => {
    render(<PanelNav groups={grupyPlaskie} currentPath="/panel" />);

    expect(screen.getByRole("navigation")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pulpit" })).toBeInTheDocument();
    // PanelNav z płaską listą grup (bez podgrupy "Szkolenia" w danych)
    // renderuje wyłącznie przekazane linki synchronicznie w render() wyżej.
    expect(screen.queryByText("Szkolenia")).not.toBeInTheDocument();
  });

  it("grupuje dłuższą listę w nazwane sekcje (Z-16)", () => {
    render(<PanelNav groups={grupyNazwane} currentPath="/panel/kursy" />);

    expect(screen.getByText("Szkolenia")).toBeInTheDocument();
    expect(screen.getByText("Konto")).toBeInTheDocument();
  });

  it("aria-current='page' na bieżącej pozycji, nie na pozostałych", () => {
    render(<PanelNav groups={grupyNazwane} currentPath="/panel/egzaminy" />);

    expect(screen.getByRole("link", { name: "Egzaminy" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Kursy" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Ustawienia" })).not.toHaveAttribute("aria-current");
  });

  it("nie czyta ról sam: renderuje dokładnie te pozycje, które dostał w props", () => {
    render(<PanelNav groups={grupyPlaskie} currentPath="/panel" />);

    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("axe: 0 naruszeń na wyrenderowanej nawigacji", async () => {
    const { container } = render(
      <PanelNav groups={grupyNazwane} currentPath="/panel/kursy" />,
    );

    const naruszenia = await axeViolations(container);
    expect(naruszenia).toEqual([]);
  });
});
