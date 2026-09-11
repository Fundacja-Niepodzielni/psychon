import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";

/**
 * Uwaga werdyktu (mutacja nieuchwycona: `focus-visible:` -> `focus:`). Test
 * na tekście `globals.css` nie łapie tej zmiany, bo mutacja dotyczy klasy
 * użytej w atomie, nie tokenu w arkuszu — sprawdzamy więc klasę faktycznie
 * wyrenderowanego elementu (Z-9: pierścień fokusu tylko na klawiaturze, nigdy
 * na zwykłe kliknięcie myszą — `:focus-visible`, nie `:focus`).
 */
function classList(el: Element): string[] {
  return el.className.split(/\s+/).filter(Boolean);
}

describe("pierścień fokusu na atomach interaktywnych — klasa renderowana, nie tylko token", () => {
  it("Button używa focus-visible:focus-ring, nie focus:focus-ring", () => {
    render(<Button>Zapisz</Button>);
    const classes = classList(screen.getByRole("button", { name: "Zapisz" }));

    expect(classes).toContain("focus-visible:focus-ring");
    expect(classes).not.toContain("focus:focus-ring");
  });

  it("Input używa focus-visible:focus-ring, nie focus:focus-ring", () => {
    render(<Input label="Imię" />);
    const classes = classList(screen.getByLabelText("Imię"));

    expect(classes).toContain("focus-visible:focus-ring");
    expect(classes).not.toContain("focus:focus-ring");
  });

  it("Select używa focus-visible:focus-ring, nie focus:focus-ring", () => {
    render(
      <Select label="Rola">
        <option value="a">A</option>
      </Select>,
    );
    const classes = classList(screen.getByLabelText("Rola"));

    expect(classes).toContain("focus-visible:focus-ring");
    expect(classes).not.toContain("focus:focus-ring");
  });
});
