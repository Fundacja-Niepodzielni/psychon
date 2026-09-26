import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { axeViolations } from "../../__tests__/axe-helper";
import SupportBlock from "@/components/organisms/SupportBlock";

describe("SupportBlock", () => {
  it("render w spoczynku: nagłówek i opis", () => {
    render(<SupportBlock title="Potrzebujesz pomocy?" description="Napisz do opiekuna." />);

    expect(screen.getByRole("heading", { name: "Potrzebujesz pomocy?" })).toBeInTheDocument();
    expect(screen.getByText("Napisz do opiekuna.")).toBeInTheDocument();
  });

  it("bez akcji: nie renderuje żadnego przycisku", () => {
    render(<SupportBlock title="Potrzebujesz pomocy?" />);

    // SupportBlock renderuje przycisk akcji tylko, gdy props action jest
    // podane — render() wyżej bez action kończy się synchronicznie bez tego
    // węzła.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("akcja poboczna, gdy podana", () => {
    render(
      <SupportBlock
        title="Potrzebujesz pomocy?"
        action={<button type="button">Napisz do wsparcia</button>}
      />,
    );

    expect(screen.getByRole("button", { name: "Napisz do wsparcia" })).toBeInTheDocument();
  });

  it("axe: 0 naruszeń na wyrenderowanym bloku", async () => {
    const { container } = render(
      <SupportBlock
        title="Potrzebujesz pomocy?"
        description="Napisz do opiekuna."
        action={<button type="button">Napisz do wsparcia</button>}
      />,
    );

    const naruszenia = await axeViolations(container);
    expect(naruszenia).toEqual([]);
  });
});
