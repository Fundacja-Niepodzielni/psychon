import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import LoadingState from "@/components/molecules/LoadingState";

describe("LoadingState", () => {
  it("ma role=status z domyślną etykietą (Z-6: 0 stanów ładowania bez role=status)", () => {
    render(<LoadingState />);

    expect(screen.getByRole("status", { name: "Wczytywanie…" })).toBeInTheDocument();
  });

  it("noga negatywna: przyjmuje własną etykietę zamiast domyślnej", () => {
    render(<LoadingState label="Wczytywanie listy kursów…" />);

    expect(
      screen.getByRole("status", { name: "Wczytywanie listy kursów…" }),
    ).toBeInTheDocument();
    // LoadingState wybiera etykietę synchronicznie na podstawie props label w
    // tym samym render() wyżej — etykieta domyślna nie może współistnieć z
    // własną.
    expect(screen.queryByRole("status", { name: "Wczytywanie…" })).not.toBeInTheDocument();
  });
});
