import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Input } from "../Input";

describe("Input", () => {
  it("rodzaj tekst renderuje się jako input[type=text]", () => {
    render(<Input rodzaj="tekst" aria-label="Imię" />);
    expect(screen.getByLabelText("Imię")).toHaveAttribute("type", "text");
  });

  it("rodzaj data renderuje się jako input[type=date]", () => {
    render(<Input rodzaj="data" aria-label="Data" />);
    expect(screen.getByLabelText("Data")).toHaveAttribute("type", "date");
  });

  it("niepoprawny ustawia aria-invalid", () => {
    render(<Input rodzaj="tekst" aria-label="E-mail" niepoprawny />);
    expect(screen.getByLabelText("E-mail")).toHaveAttribute("aria-invalid", "true");
  });

  it("każdy rodzaj ma inną klasę ograniczenia szerokości", () => {
    const { container: t } = render(<Input rodzaj="tekst" aria-label="a" />);
    const { container: l } = render(<Input rodzaj="liczba" aria-label="b" />);
    const { container: d } = render(<Input rodzaj="data" aria-label="c" />);
    const klasy = [t, l, d].map((c) => c.querySelector("input")?.className);
    expect(new Set(klasy).size).toBe(3);
  });
});
