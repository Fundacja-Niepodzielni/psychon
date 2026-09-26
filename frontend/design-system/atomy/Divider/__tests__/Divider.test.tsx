import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Divider } from "../Divider";

describe("Divider", () => {
  it("renderuje separator jako linię, nie ramkę pojemnika", () => {
    render(<Divider />);
    const linia = screen.getByRole("separator");
    expect(linia.tagName).toBe("HR");
  });

  it("nie przyjmuje wariantów — jedna implementacja", () => {
    expect(Divider.length).toBe(0);
  });
});
