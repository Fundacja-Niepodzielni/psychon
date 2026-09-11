import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Logo from "@/components/ui/Logo";
import { LOGO_SOURCE_D_SHA256 } from "./__fixtures__/logo-source-hash";

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

  it("liczba ścieżek znaku = 20, tyle samo co widocznych glifów (#1500BB) w pliku wzorcowym (uwaga werdyktu: 'paths > 0' nie łapie okaleczonego znaku)", () => {
    const { container } = render(<Logo />);
    const paths = container.querySelectorAll("path");

    expect(paths.length).toBe(20);
  });

  it("treść atrybutów d odpowiada dokładnie plikowi wzorcowemu ze strony, nie tylko ich liczbie (uwaga werdyktu: d=\"M0 0Z\" na jednej ścieżce przechodziło przy samym liczeniu)", () => {
    const { container } = render(<Logo />);
    const paths = Array.from(container.querySelectorAll("path"));
    const joined = paths.map((path) => path.getAttribute("d") ?? "").join("|");
    const hash = createHash("sha256").update(joined).digest("hex");

    expect(hash).toBe(LOGO_SOURCE_D_SHA256);
  });

  it("noga negatywna: title pusty ukrywa znak przed czytnikiem ekranu (kontekst ma już etykietę)", () => {
    render(<Logo title="" />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
