import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Checkbox } from "../Checkbox";

describe("Checkbox", () => {
  it("łączy się z etykietą i przełącza przez klik", async () => {
    const naZmiana = vi.fn();
    render(
      <Checkbox id="zgoda" zaznaczony={false} onZmiana={naZmiana} etykieta="Zgadzam się" />,
    );
    await userEvent.click(screen.getByLabelText("Zgadzam się"));
    expect(naZmiana).toHaveBeenCalledWith(true);
  });

  it("zaznaczenie ma widoczny znacznik, nie tylko tło", () => {
    render(<Checkbox id="a" zaznaczony onZmiana={() => {}} etykieta="A" />);
    expect(screen.getByText("✓")).toBeInTheDocument();
  });

  it("bez zaznaczenia nie pokazuje znacznika", () => {
    render(<Checkbox id="a" zaznaczony={false} onZmiana={() => {}} etykieta="A" />);
    expect(screen.queryByText("✓")).not.toBeInTheDocument();
  });
});
