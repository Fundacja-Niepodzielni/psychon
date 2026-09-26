import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Num } from "../Num";

describe("Num", () => {
  it("pokazuje liczbę razem z jednostką albo mianownikiem", () => {
    render(<Num wartosc={18} etykieta="z 72 godzin" />);
    expect(screen.getByText("z 72 godzin")).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
  });

  it("wstawia wąską spację co trzy cyfry", () => {
    const { container } = render(<Num wartosc={12345} etykieta="uczestników" />);
    expect(container.textContent).toContain(`12${" "}345`);
  });

  it("odmawia liczby bez jednostki ani mianownika", () => {
    expect(() => render(<Num wartosc={5} etykieta="  " />)).toThrow(/jednostki/);
  });
});
