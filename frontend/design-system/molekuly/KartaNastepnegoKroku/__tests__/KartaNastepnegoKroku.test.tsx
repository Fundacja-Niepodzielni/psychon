import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { KartaNastepnegoKroku } from "../KartaNastepnegoKroku";

describe("KartaNastepnegoKroku", () => {
  it("etykieta zapisana zdaniem, pod nią h2 i zdanie; w karcie nie ma przycisku", () => {
    const { container } = render(
      <KartaNastepnegoKroku etykieta="Następny krok" naglowek="Rozpoznawanie kryzysu">
        <p>Kurs „Pierwsza pomoc”.</p>
      </KartaNastepnegoKroku>,
    );
    expect(screen.getByText("Następny krok")).toBeInTheDocument();
    expect(screen.queryByText("NASTĘPNY KROK")).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Rozpoznawanie kryzysu" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading")).toHaveLength(1);
    expect(screen.getByText("Kurs „Pierwsza pomoc”.")).toBeInTheDocument();
    expect(container.querySelector("button, a")).toBeNull();
  });

  it("stan ładowania: tylko etykieta i szkielet, bez nagłówka", () => {
    render(
      <KartaNastepnegoKroku etykieta="Do zrobienia dziś">
        <div data-testid="szkielet" />
      </KartaNastepnegoKroku>,
    );
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByTestId("szkielet")).toBeInTheDocument();
  });

  it("wersaliki tylko w CSS: etykieta ma text-transform: uppercase, karta ma cień i ramkę z tokenów", () => {
    const css = readFileSync(resolve(__dirname, "../KartaNastepnegoKroku.module.css"), "utf-8");
    expect(css).toMatch(/\.etykieta\s*\{[^}]*text-transform:\s*uppercase/);
    expect(css).toMatch(/\.karta\s*\{[^}]*box-shadow:\s*var\(--shadow\)/);
    expect(css).toMatch(/\.karta\s*\{[^}]*border:\s*1px solid var\(--border\)/);
    expect(css).toMatch(/\.karta\s*\{[^}]*border-radius:\s*var\(--r-md\)/);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  });
});
