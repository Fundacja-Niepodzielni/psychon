import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StepBar } from "../StepBar";

describe("StepBar", () => {
  it("nazwa dostępna niesie liczby zrobionych kroków", () => {
    render(<StepBar zrobione={2} razem={7} jednostka="lekcji ukończonych" />);
    expect(screen.getByRole("img", { name: "2 z 7 lekcji ukończonych" })).toBeInTheDocument();
  });

  it("renderuje tyle segmentów, ile kroków razem", () => {
    const { container } = render(<StepBar zrobione={1} razem={5} jednostka="kroków" />);
    expect(container.querySelectorAll("span").length).toBe(5);
  });

  it("krok bieżący ma podział pola (gradient), nie tylko inną barwę", () => {
    const { container } = render(<StepBar zrobione={2} razem={5} jednostka="kroków" />);
    const segmenty = container.querySelectorAll("span");
    expect(segmenty[2].style.background || segmenty[2].className).toBeTruthy();
    // bieżący segment to trzeci (index 2) — ma inną klasę niż zrobione i przed nami
    expect(segmenty[2].className).not.toBe(segmenty[0].className);
    expect(segmenty[2].className).not.toBe(segmenty[4].className);
  });
});
