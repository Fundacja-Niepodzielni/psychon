import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Świadek `/deklaracja-dostepnosci` — ekran statyczny (bez API, bez
 * routera, bez stanu). Wzorem `app/dostep-wygasl/__tests__/dostep-wygasl.test.tsx`
 * mierzy WYŁĄCZNIE to, co użytkownik widzi: nagłówek, jedyny kanał kontaktu
 * (mailto) i — noga przecząca — że pole „Data ostatniego przeglądu
 * deklaracji" NIE jest cicho wypełnione zmyśloną datą, tylko jawnie zostaje
 * oznaczone jako nierozstrzygnięte (decyzja właściciela, patrz treść karty).
 */

const AccessibilityStatementPage = (
  await import("@/app/deklaracja-dostepnosci/page")
).default;

describe("/deklaracja-dostepnosci — nagłówek i treść", () => {
  it("pokazuje nagłówek główny 'Deklaracja dostępności'", () => {
    render(<AccessibilityStatementPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Deklaracja dostępności" }),
    ).toBeInTheDocument();
  });

  it("nazywa wprost standard zgodności WCAG 2.1 AA i stan częściowej zgodności", () => {
    render(<AccessibilityStatementPage />);

    expect(screen.getByText(/częściowo zgodna/)).toBeInTheDocument();
    // Standard jest nazwany w co najmniej dwóch miejscach (opis pod
    // nagłówkiem i karta „Stan zgodności") — liczy się, że wystąpił,
    // dokładna liczba powtórzeń nie jest przedmiotem tego świadka.
    expect(screen.getAllByText(/WCAG\s*2\.1/).length).toBeGreaterThanOrEqual(1);
  });

  it("udostępnia dokładnie jeden link — kontakt mailowy do zgłaszania barier", () => {
    render(<AccessibilityStatementPage />);

    const linki = screen.getAllByRole("link");
    expect(linki).toHaveLength(1);
    expect(linki[0]).toHaveAttribute("href", "mailto:kontakt@niepodzielni.com");
    expect(linki[0]).toHaveTextContent("kontakt@niepodzielni.com");
  });

  it("pokazuje logo fundacji jako obrazek z dostępną nazwą 'Fundacja Niepodzielni'", () => {
    render(<AccessibilityStatementPage />);

    expect(
      screen.getByRole("img", { name: "Fundacja Niepodzielni" }),
    ).toBeInTheDocument();
  });
});

describe("/deklaracja-dostepnosci — data przeglądu (noga przecząca)", () => {
  it("NIE podaje żadnej konkretnej daty przeglądu deklaracji — pole zostaje jawnie oznaczone jako do uzupełnienia przez właściciela", () => {
    render(<AccessibilityStatementPage />);

    expect(
      screen.getByText(/Data ostatniego przeglądu deklaracji/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("[do uzupełnienia przez Fundację]"),
    ).toBeInTheDocument();

    // Data SPORZĄDZENIA (inne pole, inna karta) jest jedyną konkretną datą
    // na ekranie — nie może być pomylona z datą PRZEGLĄDU, która nie ma
    // jeszcze wartości.
    expect(screen.getByText(/Deklarację sporządzono: 2026-09-16\./)).toBeInTheDocument();
  });
});
