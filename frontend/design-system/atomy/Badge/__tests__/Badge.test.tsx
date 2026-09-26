import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "../Badge";

describe("Badge", () => {
  it("stan dobry (ok) wygląda tak samo jak neutralny — bez barwy", () => {
    const { container: neutralny } = render(<Badge wariant="neutral">Gotowe</Badge>);
    const { container: dobry } = render(<Badge wariant="ok">Gotowe</Badge>);
    expect(neutralny.querySelector("span")?.className).toBe(
      dobry.querySelector("span")?.className,
    );
  });

  it("stan zawsze niesie słowo, nie tylko barwę czy kropkę", () => {
    render(<Badge wariant="warn">Wymaga uwagi</Badge>);
    expect(screen.getByText("Wymaga uwagi")).toBeInTheDocument();
  });

  it("wariant pending dokłada kropkę, ale słowo zostaje", () => {
    const { container } = render(<Badge wariant="pending">Czeka</Badge>);
    expect(container.querySelectorAll("span[aria-hidden]").length).toBe(1);
    expect(screen.getByText("Czeka")).toBeInTheDocument();
  });

  it("warn i error mają różne klasy niż neutralny", () => {
    const { container: n } = render(<Badge wariant="neutral">A</Badge>);
    const { container: w } = render(<Badge wariant="warn">A</Badge>);
    const { container: e } = render(<Badge wariant="error">A</Badge>);
    const klasy = [n, w, e].map((c) => c.querySelector("span")?.className);
    expect(new Set(klasy).size).toBe(3);
  });
});
