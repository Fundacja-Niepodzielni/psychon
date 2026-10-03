import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ZwinieteFiltry } from "../ZwinieteFiltry";

/**
 * Wzorzec zwiniętych filtrów na telefonie. Układ (wiersz widoczny tylko poniżej
 * 600 px, panel zawsze widoczny od 600 px) robi CSS, którego jsdom nie liczy —
 * tutaj są próby zachowania: stan `aria-expanded`, powiązanie `aria-controls`,
 * zwijanie i oddawanie fokusu.
 */

function wiersz() {
  return screen.getByRole("button", { name: /^Filtry/ });
}

function ekran(opcje: { onSubmit?: () => void; fokus?: string } = {}) {
  return render(
    <ZwinieteFiltry etykieta="Filtry" podsumowanie="Wszystkie osoby" liczba={11} fokusPoOtwarciu={opcje.fokus}>
      {({ zwin }) => (
        <form
          onSubmit={(zdarzenie) => {
            zdarzenie.preventDefault();
            opcje.onSubmit?.();
          }}
        >
          <label htmlFor="rola">Rola</label>
          <input id="rola" />
          <button type="submit">Filtruj</button>
          <button type="button" onClick={zwin}>
            Wybierz
          </button>
        </form>
      )}
    </ZwinieteFiltry>,
  );
}

describe("ZwinieteFiltry — wiersz", () => {
  it("jest przyciskiem zwiniętym, z podsumowaniem, licznikiem i napisem „Zmień”", () => {
    ekran();
    const przycisk = wiersz();
    expect(przycisk).toHaveAttribute("aria-expanded", "false");
    expect(przycisk).toHaveAccessibleName("Filtry: Wszystkie osoby (11) Zmień");
    expect(przycisk).not.toHaveAttribute("aria-label");
  });

  it("aria-controls wskazuje panel z treścią filtrów", () => {
    ekran();
    const panel = document.getElementById(wiersz().getAttribute("aria-controls") ?? "");
    expect(panel).not.toBeNull();
    expect(panel).toContainElement(screen.getByLabelText("Rola"));
  });

  it("bez licznika nie wypisuje pustych nawiasów", () => {
    render(
      <ZwinieteFiltry etykieta="Rodzaj" podsumowanie="Wszystkie">
        <p>treść</p>
      </ZwinieteFiltry>,
    );
    expect(screen.getByRole("button", { name: "Rodzaj: Wszystkie Zmień" })).toBeInTheDocument();
  });
});

describe("ZwinieteFiltry — rozwijanie i zwijanie", () => {
  it("klik rozwija panel (aria-expanded=true, napis „Zwiń”), drugi klik zwija", async () => {
    ekran();
    await userEvent.click(wiersz());
    expect(wiersz()).toHaveAttribute("aria-expanded", "true");
    expect(wiersz()).toHaveAccessibleName("Filtry: Wszystkie osoby (11) Zwiń");
    await userEvent.click(wiersz());
    expect(wiersz()).toHaveAttribute("aria-expanded", "false");
  });

  it("po rozwinięciu fokus idzie na pierwszą kontrolkę panelu", async () => {
    ekran();
    await userEvent.click(wiersz());
    expect(screen.getByLabelText("Rola")).toHaveFocus();
  });

  it("po rozwinięciu fokus idzie na element wskazany selektorem", async () => {
    ekran({ fokus: "button[type=submit]" });
    await userEvent.click(wiersz());
    expect(screen.getByRole("button", { name: "Filtruj" })).toHaveFocus();
  });

  it("Escape w panelu zwija i oddaje fokus na wiersz", async () => {
    ekran();
    await userEvent.click(wiersz());
    await userEvent.keyboard("{Escape}");
    expect(wiersz()).toHaveAttribute("aria-expanded", "false");
    expect(wiersz()).toHaveFocus();
  });

  it("Escape już obsłużony wewnątrz panelu (np. lista wyboru) niczego nie zwija", async () => {
    ekran();
    await userEvent.click(wiersz());
    const pole = screen.getByLabelText("Rola");
    pole.addEventListener("keydown", (zdarzenie) => zdarzenie.preventDefault());
    fireEvent.keyDown(pole, { key: "Escape" });
    expect(wiersz()).toHaveAttribute("aria-expanded", "true");
  });

  it("Escape na zwiniętym wierszu nic nie zmienia", async () => {
    ekran();
    wiersz().focus();
    await userEvent.keyboard("{Escape}");
    expect(wiersz()).toHaveAttribute("aria-expanded", "false");
  });

  it("wysłanie formularza w panelu („Filtruj”) zwija panel, oddaje fokus na wiersz i nie blokuje obsługi formularza", async () => {
    const naWyslanie = vi.fn();
    ekran({ onSubmit: naWyslanie });
    await userEvent.click(wiersz());
    await userEvent.click(screen.getByRole("button", { name: "Filtruj" }));
    expect(naWyslanie).toHaveBeenCalledTimes(1);
    expect(wiersz()).toHaveAttribute("aria-expanded", "false");
    expect(wiersz()).toHaveFocus();
  });

  it("zwin() z treści (wybór opcji) zwija panel i oddaje fokus na wiersz", async () => {
    ekran();
    await userEvent.click(wiersz());
    await userEvent.click(screen.getByRole("button", { name: "Wybierz" }));
    expect(wiersz()).toHaveAttribute("aria-expanded", "false");
    expect(wiersz()).toHaveFocus();
  });
});
