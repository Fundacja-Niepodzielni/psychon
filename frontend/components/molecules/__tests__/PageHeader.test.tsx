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
});
