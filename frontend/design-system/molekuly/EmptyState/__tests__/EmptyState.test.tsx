import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EmptyState } from "../EmptyState";

describe("EmptyState", () => {
  it("wariant brak-uprawnien sklada zdanie slownika z nazwa roli w dopelniaczu", () => {
    render(
      <EmptyState
        naglowek="Sekcja dla administracji"
        wariant="brak-uprawnien"
        rola="administracji"
        przycisk={{ etykieta: "Wróć", onClick: () => {} }}
      />,
    );

    expect(screen.getByText("Ta funkcja jest dostępna tylko dla administracji.")).toBeInTheDocument();
  });

  it("wariant brak-uprawnien wstawia kazda podana role w to samo zdanie", () => {
    const { container } = render(
      <EmptyState
        naglowek="Sekcja dla prowadzących"
        wariant="brak-uprawnien"
        rola="prowadzących"
        przycisk={{ etykieta: "Wróć", onClick: () => {} }}
      />,
    );

    expect(container.textContent).toContain("Ta funkcja jest dostępna tylko dla prowadzących.");
  });

  it("wariant pusto pokazuje wlasna tresc, nie zdanie o roli", () => {
    const { container } = render(
      <EmptyState
        naglowek="Brak danych"
        tresc="Dane pojawią się po pierwszym zapisie."
        przycisk={{ etykieta: "Dodaj", onClick: () => {} }}
      />,
    );

    expect(container.textContent).toContain("Dane pojawią się po pierwszym zapisie.");
    expect(container.textContent).not.toContain("dostępna tylko dla");
  });

  it("jedyny przycisk wola przekazana funkcje", () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        naglowek="Sekcja dla administracji"
        wariant="brak-uprawnien"
        rola="administracji"
        przycisk={{ etykieta: "Wróć", onClick }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Wróć" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
