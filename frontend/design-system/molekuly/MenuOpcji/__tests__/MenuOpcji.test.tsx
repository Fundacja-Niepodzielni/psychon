import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MenuOpcji, type PozycjaMenuOpcji } from "../MenuOpcji";

function pozycje(wybrano: (id: string) => void = () => {}): PozycjaMenuOpcji[] {
  return [
    { id: "zmien-nazwe", etykieta: "Zmień nazwę", onWybierz: () => wybrano("zmien-nazwe") },
    { id: "wyzej", etykieta: "Przenieś temat wyżej", onWybierz: () => wybrano("wyzej") },
    { id: "nizej", etykieta: "Przenieś temat niżej", onWybierz: () => wybrano("nizej") },
    { id: "usun", etykieta: "Usuń temat", niebezpieczna: true, liniaPrzed: true, onWybierz: () => wybrano("usun") },
  ];
}

function przycisk() {
  return screen.getByRole("button", { name: "Opcje tematu Praktyka" });
}

function menuNaStronie(wybrano?: (id: string) => void) {
  return render(
    <div>
      <button type="button">Poza menu</button>
      <MenuOpcji etykieta="Opcje tematu Praktyka" pozycje={pozycje(wybrano)} znacznikFokusu="opcje-8" />
    </div>,
  );
}

describe("MenuOpcji", () => {
  it("zamknięte: przycisk ma aria-haspopup „menu” i aria-expanded „false”, listy nie ma", () => {
    menuNaStronie();
    expect(przycisk()).toHaveAttribute("aria-haspopup", "menu");
    expect(przycisk()).toHaveAttribute("aria-expanded", "false");
    expect(przycisk()).not.toHaveAttribute("aria-controls");
    expect(przycisk()).toHaveAttribute("data-fokus", "opcje-8");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("po otwarciu: aria-expanded „true”, menu z nazwą przycisku, fokus na pierwszej pozycji", async () => {
    menuNaStronie();
    await userEvent.click(przycisk());
    expect(przycisk()).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByRole("menu", { name: "Opcje tematu Praktyka" });
    expect(przycisk()).toHaveAttribute("aria-controls", menu.id);
    expect(screen.getAllByRole("menuitem").map((pozycja) => pozycja.textContent)).toEqual([
      "Zmień nazwę",
      "Przenieś temat wyżej",
      "Przenieś temat niżej",
      "Usuń temat",
    ]);
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Zmień nazwę" }));
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });

  it("strzałka w dół i w górę przechodzą po pozycjach w kółko; Home i End skaczą na brzegi", async () => {
    menuNaStronie();
    await userEvent.click(przycisk());
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Przenieś temat wyżej" }));
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Usuń temat" }));
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Zmień nazwę" }));
    await userEvent.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Usuń temat" }));
    await userEvent.keyboard("{Home}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Zmień nazwę" }));
    await userEvent.keyboard("{End}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Usuń temat" }));
  });

  it("strzałka w dół na przycisku otwiera menu", async () => {
    menuNaStronie();
    przycisk().focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(przycisk()).toHaveAttribute("aria-expanded", "true");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Zmień nazwę" }));
  });

  it("Escape zamyka menu i oddaje fokus ołówkowi", async () => {
    menuNaStronie();
    await userEvent.click(przycisk());
    await userEvent.keyboard("{ArrowDown}{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(przycisk()).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(przycisk());
  });

  it("kliknięcie poza menu zamyka je i oddaje fokus ołówkowi", async () => {
    menuNaStronie();
    await userEvent.click(przycisk());
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await userEvent.click(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(przycisk()));
  });

  it("kliknięcie poza menu w inny przycisk zamyka menu, ale nie zabiera mu fokusu", async () => {
    menuNaStronie();
    await userEvent.click(przycisk());
    const inny = screen.getByRole("button", { name: "Poza menu" });
    await userEvent.click(inny);
    expect(screen.queryByRole("menu")).toBeNull();
    await new Promise((gotowe) => setTimeout(gotowe, 20));
    expect(document.activeElement).toBe(inny);
  });

  it("kliknięcie w sam przycisk przy otwartym menu zamyka je", async () => {
    menuNaStronie();
    await userEvent.click(przycisk());
    await userEvent.click(przycisk());
    expect(screen.queryByRole("menu")).toBeNull();
    expect(przycisk()).toHaveAttribute("aria-expanded", "false");
  });

  it("wybór pozycji woła jej działanie raz, zamyka menu i oddaje fokus ołówkowi", async () => {
    const wybrano = vi.fn();
    menuNaStronie(wybrano);
    await userEvent.click(przycisk());
    await userEvent.click(screen.getByRole("menuitem", { name: "Przenieś temat niżej" }));
    expect(wybrano).toHaveBeenCalledTimes(1);
    expect(wybrano).toHaveBeenCalledWith("nizej");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(przycisk());
  });

  it("Enter na pozycji wybiera ją", async () => {
    const wybrano = vi.fn();
    menuNaStronie(wybrano);
    await userEvent.click(przycisk());
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(wybrano).toHaveBeenCalledWith("wyzej");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Tab zamyka menu bez zabierania fokusu ołówkowi", async () => {
    menuNaStronie();
    await userEvent.click(przycisk());
    await userEvent.tab();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(przycisk()).toHaveAttribute("aria-expanded", "false");
  });
});
