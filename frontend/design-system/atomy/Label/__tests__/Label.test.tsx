import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Label } from "../Label";

describe("Label", () => {
  it("łączy się z kontrolką przez htmlFor/id", () => {
    render(
      <>
        <Label htmlFor="imie" dzieci="Imię" />
        <input id="imie" />
      </>,
    );
    expect(screen.getByLabelText("Imię")).toBeInTheDocument();
  });

  it("gwiazdka obowiązkowości jest oznaczona aria-hidden, nie zastępuje tekstu", () => {
    render(<Label htmlFor="e" dzieci="E-mail" wymagane />);
    const etykieta = screen.getByText("E-mail", { exact: false });
    expect(etykieta.textContent).toContain("*");
  });

  it("bez wymagane nie pokazuje gwiazdki", () => {
    render(<Label htmlFor="e" dzieci="E-mail" />);
    expect(screen.getByText("E-mail").textContent).toBe("E-mail");
  });
});
