import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Field from "@/components/ui/Field";

describe("Field", () => {
  it("etykieta wskazuje na id kontrolki (Z-15: powiązanie etykiety z polem)", () => {
    render(
      <Field id="wiek" label="Wiek">
        <input id="wiek" />
      </Field>,
    );

    expect(screen.getByLabelText("Wiek")).toBeInTheDocument();
  });

  it("pokazuje podpowiedź pod własnym id", () => {
    render(
      <Field id="wiek" label="Wiek" hint="Liczba pełnych lat">
        <input id="wiek" />
      </Field>,
    );

    expect(screen.getByText("Liczba pełnych lat")).toHaveAttribute("id", "wiek-hint");
  });

  it("pokazuje błąd pod własnym id, gdy jest podany", () => {
    render(
      <Field id="wiek" label="Wiek" error="Pole jest wymagane">
        <input id="wiek" />
      </Field>,
    );

    expect(screen.getByText("Pole jest wymagane")).toHaveAttribute("id", "wiek-error");
  });

  it("noga negatywna: bez błędu nie renderuje komunikatu błędu", () => {
    render(
      <Field id="wiek" label="Wiek">
        <input id="wiek" />
      </Field>,
    );

    expect(screen.queryByText(/wymagane/i)).not.toBeInTheDocument();
  });
});
