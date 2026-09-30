import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CollapsibleSection } from "../CollapsibleSection";

function sekcja(domyslnieRozwinieta?: boolean) {
  return (
    <CollapsibleSection tytul="Więcej danych" liczba={2} domyslnieRozwinieta={domyslnieRozwinieta} dzieci={<p>Treść sekcji</p>} />
  );
}

function naglowek() {
  return screen.getByRole("button", { name: "Więcej danych (2)" });
}

describe("CollapsibleSection", () => {
  it("przy montowaniu bez właściwości jest zwinięta, treści nie ma w DOM", () => {
    render(sekcja());
    expect(naglowek()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Treść sekcji")).toBeNull();
  });

  it("przy montowaniu z domyslnieRozwinieta=true jest rozwinięta", () => {
    render(sekcja(true));
    expect(naglowek()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Treść sekcji")).toBeInTheDocument();
  });

  it("klik nagłówka przełącza sekcję w obie strony", async () => {
    render(sekcja());
    await userEvent.click(naglowek());
    expect(naglowek()).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(naglowek());
    expect(naglowek()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Treść sekcji")).toBeNull();
  });

  it("zmiana domyslnieRozwinieta z false na true po montowaniu rozwija sekcję", () => {
    const { rerender } = render(sekcja(false));
    expect(naglowek()).toHaveAttribute("aria-expanded", "false");
    rerender(sekcja(true));
    expect(naglowek()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Treść sekcji")).toBeInTheDocument();
  });

  it("zmiana domyslnieRozwinieta z false na true rozwija też sekcję zwiniętą ręcznie po wcześniejszym rozwinięciu", async () => {
    const { rerender } = render(sekcja(false));
    await userEvent.click(naglowek());
    await userEvent.click(naglowek());
    expect(naglowek()).toHaveAttribute("aria-expanded", "false");
    rerender(sekcja(true));
    expect(naglowek()).toHaveAttribute("aria-expanded", "true");
  });

  it("zmiana domyslnieRozwinieta z true na false nie zwija rozwiniętej sekcji", () => {
    const { rerender } = render(sekcja(true));
    rerender(sekcja(false));
    expect(naglowek()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Treść sekcji")).toBeInTheDocument();
  });

  it("ponowny render z tą samą wartością nie zmienia stanu wybranego klikiem", async () => {
    const { rerender } = render(sekcja(false));
    await userEvent.click(naglowek());
    rerender(sekcja(false));
    expect(naglowek()).toHaveAttribute("aria-expanded", "true");
  });
});
