import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import EmptyState from "@/components/molecules/EmptyState";

describe("EmptyState", () => {
  it('pokazuje tytuł i zdanie „co teraz zrobić" (Z-6)', () => {
    render(
      <EmptyState
        title="Nie masz jeszcze kursów"
        description="Gdy opiekun projektu udostępni Ci pierwszy etap, pojawi się tutaj."
      />,
    );

    expect(screen.getByRole("heading", { name: "Nie masz jeszcze kursów" })).toBeInTheDocument();
    expect(
      screen.getByText("Gdy opiekun projektu udostępni Ci pierwszy etap, pojawi się tutaj."),
    ).toBeInTheDocument();
  });

  it("noga negatywna: bez opisu i akcji renderuje sam tytuł", () => {
    render(<EmptyState title="Brak kursów" />);

    expect(screen.getByRole("heading", { name: "Brak kursów" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
