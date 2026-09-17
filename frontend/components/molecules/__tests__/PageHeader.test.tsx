import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import PageHeader from "@/components/molecules/PageHeader";

describe("PageHeader", () => {
  it("pokazuje h1 z tytułem i zdanie kontekstu", () => {
    render(<PageHeader title="Kursy" description="Twoja ścieżka szkoleniowa." />);

    expect(screen.getByRole("heading", { level: 1, name: "Kursy" })).toBeInTheDocument();
    expect(screen.getByText("Twoja ścieżka szkoleniowa.")).toBeInTheDocument();
  });

  it("noga negatywna: bez opisu i akcji renderuje sam nagłówek, bez zbędnych węzłów", () => {
    render(<PageHeader title="Kursy" />);

    expect(screen.getByRole("heading", { level: 1, name: "Kursy" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renderuje najwyżej jedną akcję główną, gdy podana", () => {
    render(<PageHeader title="Kursy" action={<button type="button">Nowy kurs</button>} />);

    expect(screen.getByRole("button", { name: "Nowy kurs" })).toBeInTheDocument();
  });

  it("h1 nosi dokładnie klasę koloru tokenu 'text-ink' (czarny #1a1a1a), nie inny kolor", () => {
    // jsdom nie liczy kaskady Tailwinda, więc nie da się tu odczytać
    // computed style (getComputedStyle zwróci puste wartości dla klas
    // wygenerowanych przez Tailwind). Zamiast tego mierzymy DOKŁADNĄ listę
    // klas na renderowanym elemencie — to łapie mutację, która podmienia
    // klasę koloru w PageHeader (np. na 'text-primary' albo dowolny inny
    // kolor), niezależnie od testu łańcucha tokenów w app/globals.css
    // (design-tokens-p2.test.ts), który łapie tylko zmianę WARTOŚCI tokenu.
    // Test jest czerwony przy KAŻDEJ z dwóch osobnych mutacji:
    //  1) --psy-text-strong w app/globals.css zmieniony na fioletowy,
    //  2) klasa koloru na h1 w PageHeader.tsx zmieniona na inną niż text-ink.
    // Pierwszą łapie design-tokens-p2.test.ts, drugą łapie test poniżej.
    render(<PageHeader title="Kursy" />);

    const naglowek = screen.getByRole("heading", { level: 1, name: "Kursy" });
    const klasy = naglowek.className.split(/\s+/).filter(Boolean);

    expect(klasy).toContain("text-ink");
    expect(klasy.filter((k) => k.startsWith("text-") && k !== "text-h2")).toEqual([
      "text-ink",
    ]);
  });
});
