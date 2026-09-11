import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Badge from "@/components/ui/Badge";

describe("Badge", () => {
  it("renderuje treść statusu jako tekst (Z-1: kolor zawsze z tekstem)", () => {
    render(<Badge variant="success">Zaakceptowano</Badge>);

    expect(screen.getByText("Zaakceptowano")).toBeInTheDocument();
  });

  it("domyślny wariant to neutral", () => {
    render(<Badge>Domyślny</Badge>);

    expect(screen.getByText("Domyślny")).toHaveClass("bg-grey", "text-muted");
  });

  it("F-93: wariant accent używa text-accent-dark, nie text-accent (4,37:1 < 4,5:1)", () => {
    render(<Badge variant="accent">Info</Badge>);

    expect(screen.getByText("Info")).toHaveClass("text-accent-dark");
    expect(screen.getByText("Info")).not.toHaveClass("text-accent");
  });

  it("noga negatywna: warianty status mają odrębne klasy tła", () => {
    render(<Badge variant="danger">Błąd</Badge>);

    expect(screen.getByText("Błąd")).toHaveClass("bg-danger-bg", "text-danger");
  });
});
