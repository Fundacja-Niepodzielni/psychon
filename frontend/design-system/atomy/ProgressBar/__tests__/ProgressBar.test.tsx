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

  it("nazwa dostępna paska to jego etykieta", () => {
    render(<ProgressBar procent={40} etykieta="18 z 72 godzin" />);
    const pasek = screen.getByRole("progressbar", { name: "18 z 72 godzin" });
    expect(pasek.getAttribute("aria-label")).toBe("18 z 72 godzin");
  });

  it("ten sam kod HTML przy każdym montowaniu (nazwa bez identyfikatora)", () => {
    const { container: pierwszy, unmount } = render(<ProgressBar procent={40} etykieta="8 z 20 min" />);
    const html = pierwszy.innerHTML;
    unmount();
    const { container: drugi } = render(<ProgressBar procent={40} etykieta="8 z 20 min" />);
    expect(drugi.innerHTML).toBe(html);
  });

  it("kontrola dodatnia: dwa paski mają każdy swoją nazwę, obca nazwa nie trafia", () => {
    render(
      <>
        <ProgressBar procent={10} etykieta="1 z 10 kursów" />
        <ProgressBar procent={50} etykieta="36 z 72 godzin" />
      </>,
    );
    const [pierwszy, drugi] = screen.getAllByRole("progressbar");
    expect(screen.getByRole("progressbar", { name: "1 z 10 kursów" })).toBe(pierwszy);
    expect(screen.getByRole("progressbar", { name: "36 z 72 godzin" })).toBe(drugi);
    expect(screen.queryByRole("progressbar", { name: "inna etykieta" })).toBeNull();
  });

  it("odmawia pracy bez etykiety — liczba nie może być samą barwą", () => {
    expect(() => render(<ProgressBar procent={40} etykieta="  " />)).toThrow(
      /jednostk/,
    );
  });
});
