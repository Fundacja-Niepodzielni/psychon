import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { createEvent, fireEvent, render, screen } from "@testing-library/react";
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

  it("otwarte: fokus wchodzi do okna", () => {
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

  it("pułapka fokusu: Shift+Tab zaraz po otwarciu trzyma fokus w oknie, na ostatnim elemencie", async () => {
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        open
        title="Usuń wpis"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveFocus();

    await user.tab({ shift: true });

    expect(screen.getByRole("button", { name: "Anuluj" })).toHaveFocus();
  });

  it("pułapka fokusu: Tab z ostatniego elementu wraca na pierwszy, nie wychodzi z okna", async () => {
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        open
        title="Usuń wpis"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    screen.getByRole("button", { name: "Anuluj" }).focus();

    await user.tab();

    expect(screen.getByRole("button", { name: "Potwierdź" })).toHaveFocus();
  });

  it("w trakcie zapisu (Anuluj zablokowane) Escape nie zamyka okna", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        loading
        title="Usuń wpis"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.keyboard("{Escape}");

    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("w trakcie zapisu (Anuluj zablokowane) klik w tło nie zamyka okna", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const { container } = render(
      <ConfirmDialog
        open
        loading
        title="Usuń wpis"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.click(container.firstElementChild as HTMLElement);

    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("klik w tło w spoczynku: fokus zostaje wewnątrz okna", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ConfirmDialog
        open
        title="Usuń wpis"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveFocus();

    await user.click(container.firstElementChild as HTMLElement);

    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("klik w tło w trakcie zapisu: fokus zostaje wewnątrz okna", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ConfirmDialog
        open
        loading
        title="Usuń wpis"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog");

    await user.click(container.firstElementChild as HTMLElement);

    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("przejście w stan zapisu zdejmuje fokus z przycisku „donikąd” — okno odsyła go do siebie", async () => {
    // Realna przeglądarka: gdy przycisk z fokusem zablokuje się (`disabled`),
    // zdejmuje z niego fokus bez nowego celu — leci `focusout` z
    // `relatedTarget === null`. jsdom tego sam nie odtwarza (blokowanie
    // atrybutem `disabled` w re-renderze nie przenosi fokusu), więc świadek
    // wywołuje to zdarzenie wprost, tak jak zrobiłaby to przeglądarka po
    // wciśnięciu Enter/Spacji na przycisku, który się właśnie zablokował.
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        open
        title="Usuń wpis"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog");
    await user.tab();
    const confirmButton = screen.getByRole("button", { name: "Potwierdź" });
    expect(confirmButton).toHaveFocus();

    fireEvent.focusOut(confirmButton, { relatedTarget: null });

    expect(dialog).toHaveFocus();
  });

  it("mousedown na tle ma zablokowane domyślne zachowanie; wewnątrz okna — nie", () => {
    const { container } = render(
      <ConfirmDialog
        open
        title="Usuń wpis"
        description="Tej operacji nie można cofnąć."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const backdrop = container.firstElementChild as HTMLElement;
    const dialog = screen.getByRole("dialog");
    const description = screen.getByText("Tej operacji nie można cofnąć.");

    const backdropEvent = createEvent.mouseDown(backdrop);
    fireEvent(backdrop, backdropEvent);
    expect(backdropEvent.defaultPrevented).toBe(true);

    const insideEvent = createEvent.mouseDown(description);
    fireEvent(description, insideEvent);
    expect(insideEvent.defaultPrevented).toBe(false);
    expect(dialog).toBeInTheDocument();
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
