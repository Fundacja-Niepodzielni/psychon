import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Card from "@/components/ui/Card";

describe("Card", () => {
  it("renderuje treść przekazaną jako children", () => {
    render(<Card>Treść karty</Card>);

    expect(screen.getByText("Treść karty")).toBeInTheDocument();
  });

  it("tytuł renderuje się jako nagłówek h2 (Card nie jest głównym h1 ekranu)", () => {
    render(<Card title="Nagłówek karty">Treść</Card>);

    expect(screen.getByRole("heading", { level: 2, name: "Nagłówek karty" })).toBeInTheDocument();
  });

  it("wariant warm używa tokenu bg-card-warm zamiast bg-card", () => {
    const { container } = render(<Card warm>Treść</Card>);
    const section = container.querySelector("section");

    expect(section).toHaveClass("bg-card-warm");
    expect(section).not.toHaveClass("bg-card");
  });

  it("noga negatywna: bez tytułu nie renderuje żadnego nagłówka", () => {
    render(<Card>Treść bez tytułu</Card>);

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });
});
