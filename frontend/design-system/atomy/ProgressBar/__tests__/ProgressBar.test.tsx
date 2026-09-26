import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProgressBar } from "../ProgressBar";

describe("ProgressBar", () => {
  it("tor jest widoczny nawet przy 0%", () => {
    render(<ProgressBar procent={0} etykieta="0 z 7 lekcji" />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("zawsze pokazuje wartość z jednostką obok paska", () => {
    render(<ProgressBar procent={40} etykieta="18 z 72 godzin" />);
    expect(screen.getByText("18 z 72 godzin")).toBeInTheDocument();
  });

  it("odmawia pracy bez etykiety — liczba nie może być samą barwą", () => {
    expect(() => render(<ProgressBar procent={40} etykieta="  " />)).toThrow(
      /jednostk/,
    );
  });
});
