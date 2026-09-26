import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Breadcrumbs from "@/components/molecules/Breadcrumbs";
import { axeViolations } from "../../__tests__/axe-helper";

const items = [
  { label: "Panel", href: "/panel" },
  { label: "Kursy", href: "/panel/kursy" },
  { label: "Wprowadzenie do PsychON" },
];

describe("Breadcrumbs", () => {
  it("renderuje nav z aria-label", () => {
    render(<Breadcrumbs items={items} />);

    expect(screen.getByRole("navigation", { name: "Okruszki nawigacji" })).toBeInTheDocument();
  });

  it("ostatni element ma aria-current=page i nie jest odnośnikiem", () => {
    render(<Breadcrumbs items={items} />);

    const ostatni = screen.getByText("Wprowadzenie do PsychON");
    expect(ostatni).toHaveAttribute("aria-current", "page");
    expect(ostatni.tagName).not.toBe("A");
  });

  it("elementy przed ostatnim są odnośnikami bez aria-current", () => {
    render(<Breadcrumbs items={items} />);

    const panel = screen.getByRole("link", { name: "Panel" });
    expect(panel).toHaveAttribute("href", "/panel");
    expect(panel).not.toHaveAttribute("aria-current");
  });

  it("noga negatywna: jeden element bez href renderuje sam siebie jako bieżącą stronę", () => {
    render(<Breadcrumbs items={[{ label: "Panel" }]} />);

    expect(screen.getByText("Panel")).toHaveAttribute("aria-current", "page");
    // Breadcrumbs renderuje listę z props items w jednym przebiegu render()
    // wyżej, bez pobierania danych — brak linku dla jedynego elementu jest
    // częścią tego samego, synchronicznego drzewa JSX.
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("odnośniki mają klasę pola dotyku min-h-11 (Z-10; jsdom nie liczy px, mierzy tylko przeglądarka)", () => {
    render(<Breadcrumbs items={items} />);

    const panel = screen.getByRole("link", { name: "Panel" });
    expect(panel.className).toMatch(/\bmin-h-11\b/);
  });

  it("axe: 0 naruszeń", async () => {
    const { container } = render(<Breadcrumbs items={items} />);

    const naruszenia = await axeViolations(container);
    expect(naruszenia).toEqual([]);
  });
});
