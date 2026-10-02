import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DialogActions } from "../DialogActions";

/**
 * Rząd przycisków okna: bez nowych właściwości renderuje się jak dotąd (fokus na
 * wycofaniu, przyciski bez atrybutu `type`), a w oknie formularza potwierdzenie
 * wysyła formularz, wycofanie go nie wysyła, w czasie zapisu potwierdzenie mówi
 * „Zapisywanie…”, jest niedostępne i nie wysyła drugi raz.
 */

describe("DialogActions", () => {
  it("bez nowych właściwości: fokus na wycofaniu, przyciski jak dotąd", () => {
    render(<DialogActions etykietaWycofania="Anuluj" etykietaPotwierdzenia="Usuń" onWycofaj={() => {}} onPotwierdz={() => {}} />);
    const anuluj = screen.getByRole("button", { name: "Anuluj" });
    expect(anuluj).toHaveFocus();
    expect(anuluj).not.toHaveAttribute("type");
    expect(screen.getByRole("button", { name: "Usuń" })).not.toHaveAttribute("type");
  });

  it("`fokusPrzyOtwarciu={false}` nie przenosi fokusu", () => {
    render(
      <DialogActions etykietaWycofania="Anuluj" etykietaPotwierdzenia="Zapisz" onWycofaj={() => {}} fokusPrzyOtwarciu={false} />,
    );
    expect(document.body).toHaveFocus();
  });

  it("w formularzu: potwierdzenie wysyła formularz, wycofanie nie", async () => {
    const wyslij = vi.fn((zdarzenie: { preventDefault: () => void }) => zdarzenie.preventDefault());
    const onWycofaj = vi.fn();
    render(
      <form onSubmit={wyslij}>
        <DialogActions etykietaWycofania="Anuluj" etykietaPotwierdzenia="Zapisz" onWycofaj={onWycofaj} typPotwierdzenia="submit" />
      </form>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Anuluj" }));
    expect(onWycofaj).toHaveBeenCalledTimes(1);
    expect(wyslij).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Zapisz" }));
    expect(wyslij).toHaveBeenCalledTimes(1);
  });

  it("w czasie zapisu: „Zapisywanie…”, aria-disabled, kliknięcie niczego nie wysyła; fokus zostaje na przycisku", async () => {
    const wyslij = vi.fn((zdarzenie: { preventDefault: () => void }) => zdarzenie.preventDefault());
    const onPotwierdz = vi.fn();
    render(
      <form onSubmit={wyslij}>
        <DialogActions
          etykietaWycofania="Anuluj"
          etykietaPotwierdzenia="Zapisz"
          onWycofaj={() => {}}
          onPotwierdz={onPotwierdz}
          typPotwierdzenia="submit"
          zapisywanie
        />
      </form>,
    );
    const przycisk = screen.getByRole("button", { name: "Zapisywanie…" });
    expect(przycisk).toHaveAttribute("aria-disabled", "true");
    expect(przycisk).not.toBeDisabled();
    await userEvent.click(przycisk);
    expect(wyslij).not.toHaveBeenCalled();
    expect(onPotwierdz).not.toHaveBeenCalled();
    expect(przycisk).toHaveFocus();
  });

  it("własna etykieta zapisu", () => {
    render(
      <DialogActions etykietaWycofania="Anuluj" etykietaPotwierdzenia="Wyślij" onWycofaj={() => {}} zapisywanie etykietaZapisywania="Wysyłanie…" />,
    );
    expect(screen.getByRole("button", { name: "Wysyłanie…" })).toBeInTheDocument();
  });
});
