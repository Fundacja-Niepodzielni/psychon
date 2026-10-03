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

const klasy = (przycisk: HTMLElement) => przycisk.className.split(/\s+/);
const maKlase = (przycisk: HTMLElement, nazwa: string) => klasy(przycisk).some((klasa) => new RegExp(`(^|_)${nazwa}(_|$)`).test(klasa));

describe("DialogActions — potwierdzenie destrukcyjne", () => {
  it("bez `niebezpieczne`: wycofanie `quiet`, potwierdzenie `primary`, bez barwy błędu", () => {
    render(<DialogActions etykietaWycofania="Anuluj" etykietaPotwierdzenia="Zapisz" onWycofaj={() => {}} onPotwierdz={() => {}} />);
    expect(maKlase(screen.getByRole("button", { name: "Anuluj" }), "quiet")).toBe(true);
    const potwierdz = screen.getByRole("button", { name: "Zapisz" });
    expect(maKlase(potwierdz, "primary")).toBe(true);
    expect(maKlase(potwierdz, "niebezpieczny")).toBe(false);
  });

  it("`niebezpieczne`: wycofanie jest przyciskiem głównym z fokusem, potwierdzenie drugorzędnym ostrzegawczym — czerwony napis nigdy na wypełnionym tle", () => {
    render(<DialogActions etykietaWycofania="Wróć" etykietaPotwierdzenia="Usuń" niebezpieczne onWycofaj={() => {}} onPotwierdz={() => {}} />);
    const wroc = screen.getByRole("button", { name: "Wróć" });
    const usun = screen.getByRole("button", { name: "Usuń" });
    expect(maKlase(wroc, "primary")).toBe(true);
    expect(maKlase(wroc, "niebezpieczny")).toBe(false);
    expect(maKlase(usun, "outline")).toBe(true);
    expect(maKlase(usun, "niebezpieczny")).toBe(true);
    expect(maKlase(usun, "primary")).toBe(false);
    expect(wroc).toHaveFocus();
  });

  it("żaden przycisk rzędu nie łączy `primary` z barwą błędu, w żadnej odmianie", () => {
    for (const niebezpieczne of [false, true]) {
      const { unmount } = render(
        <DialogActions etykietaWycofania="A" etykietaPotwierdzenia="B" niebezpieczne={niebezpieczne} onWycofaj={() => {}} onPotwierdz={() => {}} />,
      );
      for (const przycisk of screen.getAllByRole("button")) {
        expect(maKlase(przycisk, "primary") && maKlase(przycisk, "niebezpieczny")).toBe(false);
      }
      unmount();
    }
  });
});

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
