import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KartaBoczna } from "../KartaBoczna";

describe("KartaBoczna — odmiana stała", () => {
  it("jest regionem nazwanym własnym nagłówkiem stopnia 2 i pokazuje treść", () => {
    render(
      <KartaBoczna tytul="Publikacja" opis="Zdanie pod nagłówkiem.">
        <p>Treść karty</p>
      </KartaBoczna>,
    );
    const karta = screen.getByRole("region", { name: "Publikacja" });
    expect(karta).toHaveAttribute("data-karta", "stala");
    expect(screen.getByRole("heading", { level: 2, name: "Publikacja" })).toBeInTheDocument();
    expect(screen.getByText("Zdanie pod nagłówkiem.")).toBeInTheDocument();
    expect(screen.getByText("Treść karty")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("kotwica daje id karcie i nagłówkowi, a nagłówek przyjmuje fokus programowy", () => {
    render(
      <KartaBoczna tytul="Publikacja" kotwica="publikacja">
        <p>Treść</p>
      </KartaBoczna>,
    );
    expect(screen.getByRole("region", { name: "Publikacja" })).toHaveAttribute("id", "publikacja");
    const naglowek = document.getElementById("publikacja-tytul") as HTMLElement;
    expect(naglowek.tagName).toBe("H2");
    naglowek.focus();
    expect(document.activeElement).toBe(naglowek);
  });
});

describe("KartaBoczna — odmiana zwijana", () => {
  function karta(domyslnieRozwinieta?: boolean) {
    return (
      <KartaBoczna tytul="Usunięcie kursu" zwijana niebezpieczna domyslnieRozwinieta={domyslnieRozwinieta}>
        <button type="button">Usuń kurs</button>
      </KartaBoczna>
    );
  }

  it("domyślnie jest zwinięta: przycisk nagłówka z aria-expanded=false, treści nie ma w DOM", () => {
    render(karta());
    const przelacznik = screen.getByRole("button", { name: "Usunięcie kursu" });
    expect(przelacznik).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Usuń kurs" })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Usunięcie kursu" })).toContainElement(przelacznik);
    expect(screen.getByRole("region", { name: "Usunięcie kursu" })).toHaveAttribute("data-karta", "zwijana");
  });

  it("klik rozwija i zwija; aria-controls wskazuje treść", async () => {
    render(karta());
    const przelacznik = screen.getByRole("button", { name: "Usunięcie kursu" });
    await userEvent.click(przelacznik);
    expect(przelacznik).toHaveAttribute("aria-expanded", "true");
    const tresc = document.getElementById(przelacznik.getAttribute("aria-controls") as string) as HTMLElement;
    expect(tresc).toContainElement(screen.getByRole("button", { name: "Usuń kurs" }));
    await userEvent.click(przelacznik);
    expect(przelacznik).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Usuń kurs" })).toBeNull();
  });

  it("obsługa z klawiatury: Enter na przycisku nagłówka rozwija kartę", async () => {
    render(karta());
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Usunięcie kursu" }));
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Usuń kurs" })).toBeInTheDocument();
  });

  it("domyslnieRozwinieta pokazuje treść od wejścia", () => {
    render(karta(true));
    expect(screen.getByRole("button", { name: "Usunięcie kursu" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Usuń kurs" })).toBeInTheDocument();
  });
});

describe("KartaBoczna — arkusz", () => {
  const css = readFileSync(
    resolve(process.cwd(), "design-system/szablony/UkladEdycji/KartaBoczna.module.css"),
    "utf-8",
  ).replace(/\/\*[\s\S]*?\*\//g, "");

  it("przycisk nagłówka ma wysokość co najmniej pola dotyku", () => {
    const blok = css.split(".przelacznik {")[1].split("}")[0];
    expect(blok).toContain("min-height: calc(var(--hit-min)");
  });

  it("zero barw zapisanych wprost — wyłącznie tokeny", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  });
});
