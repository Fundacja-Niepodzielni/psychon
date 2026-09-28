import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SaveBar } from "../SaveBar";

function renderSaveBar(liczbaZmian: number) {
  return render(
    <SaveBar
      liczbaZmian={liczbaZmian}
      temat="Dane kontaktowe"
      onCofnij={vi.fn()}
      onPorzucWszystko={vi.fn()}
      onZapisz={vi.fn()}
    />,
  );
}

describe("SaveBar", () => {
  it("nie renderuje niczego przy zerze zmian", () => {
    const { container } = renderSaveBar(0);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    [1, "zmiana"],
    [2, "zmiany"],
    [5, "zmian"],
    [12, "zmian"],
    [22, "zmiany"],
  ])("liczba %i zmian daje odmianę: %s", (liczba, oczekiwana) => {
    renderSaveBar(liczba);
    expect(screen.getByText(String(liczba))).toBeInTheDocument();
    expect(screen.getByText(oczekiwana)).toBeInTheDocument();
  });
});
