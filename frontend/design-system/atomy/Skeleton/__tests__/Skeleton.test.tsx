import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Skeleton } from "../Skeleton";

describe("Skeleton", () => {
  it("ma kształt treści, którą zastąpi — tyle samo wierszy", () => {
    const { container } = render(<Skeleton wiersze={5} />);
    expect(container.querySelector("[aria-busy]")?.children.length).toBe(5);
  });

  it("inna liczba wierszy daje inny kształt", () => {
    const { container } = render(<Skeleton wiersze={2} />);
    expect(container.querySelector("[aria-busy]")?.children.length).toBe(2);
  });

  it("pojemnik ma aria-busy, żeby zapowiedzieć stan ładowania", () => {
    const { container } = render(<Skeleton wiersze={1} />);
    expect(container.firstChild).toHaveAttribute("aria-busy", "true");
  });
});
