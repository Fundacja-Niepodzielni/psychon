import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import Skeleton from "@/components/ui/Skeleton";

describe("Skeleton", () => {
  it("domyślnie renderuje 3 paski, wszystkie aria-hidden (status ogłasza kontener nadrzędny)", () => {
    const { container } = render(<Skeleton />);
    const bars = container.querySelectorAll("[aria-hidden] > div");

    expect(bars).toHaveLength(3);
  });

  it("liczba pasków jest parametryzowalna", () => {
    const { container } = render(<Skeleton lines={5} />);
    const bars = container.querySelectorAll("[aria-hidden] > div");

    expect(bars).toHaveLength(5);
  });

  it("F-91: każdy pasek wyłącza puls pod prefers-reduced-motion (motion-reduce:animate-none)", () => {
    const { container } = render(<Skeleton />);
    const bars = container.querySelectorAll("[aria-hidden] > div");

    bars.forEach((bar) => {
      expect(bar.className).toContain("motion-reduce:animate-none");
    });
  });
});
