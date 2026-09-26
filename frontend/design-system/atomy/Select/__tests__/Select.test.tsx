import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Select } from "../Select";

const OPCJE = [
  { wartosc: "a", etykieta: "Opcja A" },
  { wartosc: "b", etykieta: "Opcja B" },
];

describe("Select", () => {
  it("renderuje się jako natywny <select>", () => {
    render(<Select opcje={OPCJE} aria-label="Wybór" />);
    expect(screen.getByLabelText("Wybór").tagName).toBe("SELECT");
  });

  it("renderuje jedną <option> na każdą pozycję z opcje", () => {
    render(<Select opcje={OPCJE} aria-label="Wybór" />);
    expect(screen.getAllByRole("option")).toHaveLength(OPCJE.length);
  });

  it("niepoprawny ustawia aria-invalid", () => {
    render(<Select opcje={OPCJE} aria-label="Wybór" niepoprawny />);
    expect(screen.getByLabelText("Wybór")).toHaveAttribute("aria-invalid", "true");
  });
});
