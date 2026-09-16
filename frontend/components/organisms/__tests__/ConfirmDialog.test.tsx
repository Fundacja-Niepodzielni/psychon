import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import ConfirmDialog from "@/components/organisms/ConfirmDialog";

describe("ConfirmDialog", () => {
  it("zamknięte: nie renderuje okna", () => {
    render(
      <ConfirmDialog
        open={false}
        title="Usuń wpis"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("otwarte: fokus wchodzi do okna (K2)", () => {
    render(
      <ConfirmDialog
        open
        title="Usuń wpis"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveFocus();
  });

  it("Escape zamyka okno (wywołuje onCancel)", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Usuń wpis"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.keyboard("{Escape}");

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("po zamknięciu fokus wraca do elementu, który okno otworzył", async () => {
    function Scenariusz() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Usuń
          </button>
          <ConfirmDialog
            open={open}
            title="Usuń wpis"
            onConfirm={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        </>
      );
    }

    const user = userEvent.setup();
    render(<Scenariusz />);

    const opener = screen.getByRole("button", { name: "Usuń" });
    await user.click(opener);
    expect(screen.getByRole("dialog")).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("axe: 0 naruszeń na wyrenderowanym oknie", async () => {
    const { container } = render(
      <ConfirmDialog
        open
        title="Usuń wpis"
        description="Tej operacji nie można cofnąć."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});
