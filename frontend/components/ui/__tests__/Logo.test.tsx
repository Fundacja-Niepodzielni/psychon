import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Logo from "@/components/ui/Logo";

describe("Logo", () => {
  it("wariant domyślny ma kolor akcentu (--psy-violet-dark, #1500BB przez token text-accent-dark)", () => {
    render(<Logo />);
    const svg = screen.getByRole("img", { name: "Fundacja Niepodzielni" });

    expect(svg).toHaveClass("text-accent-dark");
  });

  it("wariant inverted przejmuje currentColor z tekstu jasnego (ciemne tło) — ten sam plik, nie drugi znak", () => {
    render(<Logo variant="inverted" />);
    const svg = screen.getByRole("img", { name: "Fundacja Niepodzielni" });

    expect(svg).toHaveClass("text-light");
    expect(svg).not.toHaveClass("text-accent-dark");
  });

  it("wszystkie ścieżki znaku używają currentColor, nie własnej wartości koloru", () => {
    const { container } = render(<Logo />);
    const paths = container.querySelectorAll("path");

    expect(paths.length).toBeGreaterThan(0);
    paths.forEach((path) => {
      expect(path.getAttribute("fill")).toBe("currentColor");
    });
  });

  it("noga negatywna: title pusty ukrywa znak przed czytnikiem ekranu (kontekst ma już etykietę)", () => {
    render(<Logo title="" />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
