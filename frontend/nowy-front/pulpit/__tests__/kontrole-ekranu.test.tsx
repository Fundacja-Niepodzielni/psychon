import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Button } from "@/design-system/atomy/Button/Button";
import { DashboardTemplate } from "@/design-system/szablony/DashboardTemplate/DashboardTemplate";
import { liczPrzyciskiGlowne, szablonPulpitu } from "./kontrole-ekranu";

/** Kontrola dodatnia kontroli: każda musi zaczerwienić się na drzewie, które go łamie. */
describe("kontrole ekranów pulpitów — kontrola dodatnia", () => {
  it("szablonPulpitu: prawdziwy szablon przechodzi, korzeń bez znacznika szablonu jest odrzucany", () => {
    const { container } = render(
      <DashboardTemplate naglowek={{ okruszki: [{ etykieta: "Pulpit" }], tytul: "Pulpit", onPowrot: () => {} }} glowna={<p>a</p>} wspierajaca={null} />,
    );
    expect(() => szablonPulpitu(container)).not.toThrow();

    const bezZnacznika = render(<main id="tresc" tabIndex={-1} />);
    expect(() => szablonPulpitu(bezZnacznika.container)).toThrow(/data-style-id/);
  });

  it("szablonPulpitu: dwa main są odrzucane", () => {
    const { container } = render(
      <div>
        <main id="tresc" tabIndex={-1} data-style-id="szablon-pulpit" />
        <main />
      </div>,
    );
    expect(() => szablonPulpitu(container)).toThrow(/dokładnie jednego/);
  });

  it("liczPrzyciskiGlowne: liczy tylko primary", () => {
    const { container } = render(
      <div>
        <Button poziom="primary">A</Button>
        <Button poziom="outline">B</Button>
        <Button poziom="primary">C</Button>
      </div>,
    );
    expect(liczPrzyciskiGlowne(container)).toBe(2);
  });
});
