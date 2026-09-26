import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Heading } from "../Heading";

describe("Heading", () => {
  it("renderuje właściwy znacznik dla stopnia", () => {
    render(<Heading stopien={3}>Tydzień 24 z 40</Heading>);
    const el = screen.getByText("Tydzień 24 z 40");
    expect(el.tagName).toBe("H3");
  });

  it("stopień 2 przyjmuje fokus programowy (tabIndex=-1)", () => {
    render(<Heading stopien={2}>Sekcja</Heading>);
    expect(screen.getByText("Sekcja")).toHaveAttribute("tabindex", "-1");
  });

  it("stopień 1 nie ma tabIndex", () => {
    render(<Heading stopien={1}>Tytuł</Heading>);
    expect(screen.getByText("Tytuł")).not.toHaveAttribute("tabindex");
  });

  it("odmawia pustego nagłówka — nagłówek zawsze niesie informację", () => {
    expect(() => render(<Heading stopien={1}>{"   "}</Heading>)).toThrow(
      /bez treści/,
    );
  });
});
