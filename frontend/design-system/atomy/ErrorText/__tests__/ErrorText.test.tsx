import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorText } from "../ErrorText";

describe("ErrorText", () => {
  it("pokazuje błąd przy polu z rolą alert", () => {
    render(<ErrorText id="e1">Podaj poprawny adres e-mail</ErrorText>);
    expect(screen.getByRole("alert")).toHaveTextContent("Podaj poprawny adres e-mail");
  });

  it("znika, gdy błędu już nie ma — nic nie renderuje", () => {
    const { container } = render(<ErrorText id="e1" />);
    expect(container).toBeEmptyDOMElement();
  });
});
