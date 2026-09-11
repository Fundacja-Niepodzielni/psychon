import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";

/**
 * Uwaga werdyktu (mutacja nieuchwycona: prefiks pseudoklasy `focus-visible:`
 * zamieniony na sam `focus:`). Test na tekście `globals.css` nie łapie tej
 * zmiany, bo mutacja dotyczy klasy użytej w atomie, nie tokenu w arkuszu —
 * sprawdzamy więc klasę faktycznie wyrenderowanego elementu (Z-9: pierścień
 * fokusu tylko na klawiaturze, nigdy na zwykłe kliknięcie myszą —
 * `:focus-visible`, nie samo `:focus`).
 */
function classList(el: Element): string[] {
  return el.className.split(/\s+/).filter(Boolean);
}

/**
 * Złożone z części (nie jeden literał w źródle), żeby Tailwind nie
 * wygenerował martwej reguły w buildzie: skaner treści czyta surowy tekst
 * pliku i dla dosłownej nazwy klasy `focus` + dwukropek + `focus-ring`
 * generuje regułę CSS, mimo że żaden element jej nie używa (uwaga
 * werdyktu).
 */
const LEGACY_FOCUS_CLASS = ["focus", "focus-ring"].join(":");

describe("pierścień fokusu na atomach interaktywnych — klasa renderowana, nie tylko token", () => {
  it("Button używa prefiksu focus-visible, nie zwykłego focus, przed nazwą focus-ring", () => {
    render(<Button>Zapisz</Button>);
    const classes = classList(screen.getByRole("button", { name: "Zapisz" }));

    expect(classes).toContain("focus-visible:focus-ring");
    expect(classes).not.toContain(LEGACY_FOCUS_CLASS);
  });

  it("Input używa prefiksu focus-visible, nie zwykłego focus, przed nazwą focus-ring", () => {
    render(<Input label="Imię" />);
    const classes = classList(screen.getByLabelText("Imię"));

    expect(classes).toContain("focus-visible:focus-ring");
    expect(classes).not.toContain(LEGACY_FOCUS_CLASS);
  });

  it("Select używa prefiksu focus-visible, nie zwykłego focus, przed nazwą focus-ring", () => {
    render(
      <Select label="Rola">
        <option value="a">A</option>
      </Select>,
    );
    const classes = classList(screen.getByLabelText("Rola"));

    expect(classes).toContain("focus-visible:focus-ring");
    expect(classes).not.toContain(LEGACY_FOCUS_CLASS);
  });
});
