import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Text } from "../Text";

describe("Text", () => {
  it("renderuje akapit ze zdaniem", () => {
    render(<Text>18 z 72 godzin ukończone</Text>);
    expect(screen.getByText("18 z 72 godzin ukończone").tagName).toBe("P");
  });

  it("odmawia pustego akapitu — zero zdań bez danej", () => {
    expect(() => render(<Text>{" "}</Text>)).toThrow(/bez treści/);
  });

  it("wariant lekcja i pusty da się rozróżnić po klasie", () => {
    const { rerender, container } = render(<Text wariant="lekcja">Treść lekcji</Text>);
    const klasaLekcji = container.querySelector("p")?.className;
    rerender(<Text wariant="pusty">Nic tu jeszcze nie ma</Text>);
    const klasaPusty = container.querySelector("p")?.className;
    expect(klasaLekcji).not.toBe(klasaPusty);
  });
});
