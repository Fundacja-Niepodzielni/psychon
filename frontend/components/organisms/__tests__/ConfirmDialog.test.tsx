import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axeViolations } from "../../__tests__/axe-helper";
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

    // ConfirmDialog zwraca null z open=false w tym samym, synchronicznym
    // render() wyżej — nie ma efektu, który mógłby dorenderować dialog.
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

  it("zapowiedź dla czytnika ekranu: aria-labelledby wskazuje na istniejący węzeł z tytułem okna", () => {
    render(
      <ConfirmDialog
        open
        title="Usuń wpis"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog");
    const labelledBy = dialog.getAttribute("aria-labelledby");

    expect(labelledBy).toEqual(expect.any(String));
    const tytul = document.getElementById(labelledBy as string);
    expect(tytul).not.toBeNull();
    expect(tytul).toHaveTextContent("Usuń wpis");
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

  it("klik w tło w spoczynku NIE wywołuje zamknięcia — zachowanie zamierzone: chroni wpisany powód odrzucenia przed utratą przy przypadkowym kliknięciu obok", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const { container } = render(
      <ConfirmDialog
        open
        title="Usuń wpis"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.click(container.firstElementChild as HTMLElement);

    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
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

  it("w stanie zapisu utrata fokusu «donikąd» wraca do okna", () => {
    // Realna przeglądarka: gdy przycisk z fokusem zablokuje się (`disabled`),
    // zdejmuje z niego fokus bez nowego celu — leci `focusout` z
    // `relatedTarget === null`. jsdom tego sam nie odtwarza (blokowanie
    // atrybutem `disabled` w re-renderze nie przenosi fokusu), więc test
    // wywołuje to zdarzenie wprost, tak jak zrobiłaby to przeglądarka po
    // wciśnięciu Enter/Spacji na przycisku, który się właśnie zablokował.
    // Nasłuch działa tylko w stanie zapisu — dlatego przycisk fokusujemy
    // przed przejściem w ten stan (w spoczynku jest jeszcze dostępny).
    const { rerender } = render(
      <ConfirmDialog open title="Usuń wpis" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );

    const dialog = screen.getByRole("dialog");
    const confirmButton = screen.getByRole("button", { name: "Potwierdź" });
    confirmButton.focus();
    expect(confirmButton).toHaveFocus();

    rerender(
      <ConfirmDialog open loading title="Usuń wpis" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );

    fireEvent.focusOut(confirmButton, { relatedTarget: null });

    expect(dialog).toHaveFocus();
  });

  it("focusout z celem wewnątrz okna nie przenosi fokusu na kontener — w stanie zapisu", () => {
    render(
      <ConfirmDialog open loading title="Usuń wpis" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );

    const dialog = screen.getByRole("dialog");
    const focusSpy = vi.spyOn(dialog, "focus");

    fireEvent.focusOut(dialog, { relatedTarget: dialog.querySelector("h2") });

    // fireEvent.focusOut wyżej wywołuje synchronicznie handler onBlur — jeśli
    // focus() miałby zostać wywołany, stałoby się to w tym samym wywołaniu.
    expect(focusSpy).not.toHaveBeenCalled();
    focusSpy.mockRestore();
  });

  it("focusout „donikąd” w spoczynku nie przenosi fokusu na kontener", () => {
    render(
      <ConfirmDialog open title="Usuń wpis" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );

    const dialog = screen.getByRole("dialog");
    const focusSpy = vi.spyOn(dialog, "focus");

    fireEvent.focusOut(dialog, { relatedTarget: null });

    // fireEvent.focusOut wyżej wywołuje synchronicznie handler onBlur — jeśli
    // focus() miałby zostać wywołany, stałoby się to w tym samym wywołaniu.
    expect(focusSpy).not.toHaveBeenCalled();
    focusSpy.mockRestore();
  });

  it("po powrocie do spoczynku przy otwartym oknie utrata fokusu «donikąd» nie przenosi go na kontener", () => {
    // Zachowanie, nie mechanizm: liczenie wywołań add/removeEventListener nie
    // wykrywa nasłuchu, który zostaje zarejestrowany, mimo że stan już nie
    // jest stanem zapisu (np. zdjęty inny nasłuch albo zdjęty w innej fazie
    // niż dodany) — dopiero kolejna utrata fokusu ujawnia taki wyciek.
    const { rerender } = render(
      <ConfirmDialog open loading title="Usuń wpis" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );

    rerender(
      <ConfirmDialog open title="Usuń wpis" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );

    const dialog = screen.getByRole("dialog");
    const confirmButton = screen.getByRole("button", { name: "Potwierdź" });
    const focusSpy = vi.spyOn(dialog, "focus");

    fireEvent.focusOut(confirmButton, { relatedTarget: null });

    // fireEvent.focusOut wyżej wywołuje synchronicznie handler onBlur — jeśli
    // focus() miałby zostać wywołany, stałoby się to w tym samym wywołaniu.
    expect(focusSpy).not.toHaveBeenCalled();
    focusSpy.mockRestore();
  });

  it("po zamknięciu i ponownym otwarciu utrata fokusu «donikąd» nie przenosi go na kontener", () => {
    const { rerender } = render(
      <ConfirmDialog open loading title="Usuń wpis" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );

    rerender(
      <ConfirmDialog open={false} title="Usuń wpis" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );

    rerender(
      <ConfirmDialog open title="Usuń wpis" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );

    const dialog = screen.getByRole("dialog");
    const confirmButton = screen.getByRole("button", { name: "Potwierdź" });
    const focusSpy = vi.spyOn(dialog, "focus");

    fireEvent.focusOut(confirmButton, { relatedTarget: null });

    // fireEvent.focusOut wyżej wywołuje synchronicznie handler onBlur — jeśli
    // focus() miałby zostać wywołany, stałoby się to w tym samym wywołaniu.
    expect(focusSpy).not.toHaveBeenCalled();
    focusSpy.mockRestore();
  });

  it("aktywacja «Potwierdź» przenosi fokus na kontener przed wywołaniem potwierdzenia", async () => {
    const user = userEvent.setup();
    const dialogAtCallTime: (Element | null)[] = [];
    const onConfirm = vi.fn(() => {
      dialogAtCallTime.push(document.activeElement);
    });

    render(
      <ConfirmDialog open title="Usuń wpis" onConfirm={onConfirm} onCancel={vi.fn()} />,
    );

    const dialog = screen.getByRole("dialog");
    const confirmButton = screen.getByRole("button", { name: "Potwierdź" });

    await user.click(confirmButton);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(dialogAtCallTime[0]).toBe(dialog);
  });

  it("region ogłoszeń: tekst obecny w stanie zapisu, pusty przed i po", () => {
    const { rerender } = render(
      <ConfirmDialog open title="Usuń wpis" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );

    const region = screen.getByRole("status");
    expect(region).toHaveTextContent("");

    rerender(
      <ConfirmDialog open loading title="Usuń wpis" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(region).toHaveTextContent("Trwa zapisywanie.");

    rerender(
      <ConfirmDialog open title="Usuń wpis" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(region).toHaveTextContent("");
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

  it("opis podany: aria-describedby wskazuje na istniejący węzeł z treścią opisu", () => {
    render(
      <ConfirmDialog
        open
        title="Usuń wpis"
        description="Tej operacji nie można cofnąć."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog");
    const describedBy = dialog.getAttribute("aria-describedby");

    expect(describedBy).toEqual(expect.any(String));
    const opis = document.getElementById(describedBy as string);
    expect(opis).not.toBeNull();
    expect(opis).toHaveTextContent("Tej operacji nie można cofnąć.");
  });

  it("opis nie podany: brak wiszącego aria-describedby (nie wskazuje na nieistniejący element)", () => {
    render(
      <ConfirmDialog title="Usuń wpis" open onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );

    const dialog = screen.getByRole("dialog");

    expect(dialog).not.toHaveAttribute("aria-describedby");
  });

  it("opis pusty (\"\"): brak wiszącego aria-describedby (nie wskazuje na nieistniejący element)", () => {
    render(
      <ConfirmDialog title="Usuń wpis" description="" open onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );

    const dialog = screen.getByRole("dialog");

    expect(dialog).not.toHaveAttribute("aria-describedby");
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

    const naruszenia = await axeViolations(container);
    expect(naruszenia).toEqual([]);
  });
});
