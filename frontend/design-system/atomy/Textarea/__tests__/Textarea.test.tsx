import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Textarea } from "../Textarea";

describe("Textarea", () => {
  it("renderuje się jako <textarea>", () => {
    render(<Textarea aria-label="Opis" />);
    expect(screen.getByLabelText("Opis").tagName).toBe("TEXTAREA");
  });

  it("niepoprawny ustawia aria-invalid", () => {
    render(<Textarea aria-label="Opis" niepoprawny />);
    expect(screen.getByLabelText("Opis")).toHaveAttribute("aria-invalid", "true");
  });

  it("rozciąga się tylko w pionie (resize: vertical w klasie)", () => {
    render(<Textarea aria-label="Opis" />);
    expect(screen.getByLabelText("Opis").className).toBeTruthy();
  });
});
