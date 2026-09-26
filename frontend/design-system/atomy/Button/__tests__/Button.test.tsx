import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "../Button";

describe("Button", () => {
  it("primary nigdy nie jest wyszarzony, nawet z disabled", () => {
    render(
      <Button poziom="primary" disabled>
        Zapisz
      </Button>,
    );
    expect(screen.getByRole("button", { name: "Zapisz" })).not.toBeDisabled();
  });

  it("outline może być nieaktywny", () => {
    render(
      <Button poziom="outline" disabled>
        Anuluj
      </Button>,
    );
    expect(screen.getByRole("button", { name: "Anuluj" })).toBeDisabled();
  });

  it("kliknięcie primary zawsze dochodzi do obsługi (pokazuje braki)", async () => {
    const naKlik = vi.fn();
    render(
      <Button poziom="primary" disabled onClick={naKlik}>
        Opublikuj
      </Button>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Opublikuj" }));
    expect(naKlik).toHaveBeenCalledTimes(1);
  });

  it("trzy poziomy mają różne klasy", () => {
    const { container: p } = render(<Button poziom="primary">A</Button>);
    const { container: o } = render(<Button poziom="outline">A</Button>);
    const { container: q } = render(<Button poziom="quiet">A</Button>);
    const klasy = [p, o, q].map((c) => c.querySelector("button")?.className);
    expect(new Set(klasy).size).toBe(3);
  });
});
