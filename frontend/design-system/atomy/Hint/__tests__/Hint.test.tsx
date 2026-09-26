import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Hint } from "../Hint";

describe("Hint", () => {
  it("renderuje ten sam element niezależnie od miejsca użycia", () => {
    const { container: podKontrolka } = render(<Hint id="a">Najwyżej 20 MB</Hint>);
    const { container: wNaglowku } = render(<Hint id="b">3 z 12 uczestników</Hint>);
    expect(podKontrolka.querySelector("p")?.className).toBe(
      wNaglowku.querySelector("p")?.className,
    );
  });

  it("wiąże się z kontrolką przez id do aria-describedby", () => {
    render(
      <>
        <input aria-describedby="podp-1" />
        <Hint id="podp-1">Format DD.MM.RRRR</Hint>
      </>,
    );
    expect(screen.getByText("Format DD.MM.RRRR")).toHaveAttribute("id", "podp-1");
  });
});
