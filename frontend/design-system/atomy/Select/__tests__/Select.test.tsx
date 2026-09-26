import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Select } from "../Select";

const OPCJE = [
  { wartosc: "a", etykieta: "Opcja A" },
  { wartosc: "b", etykieta: "Opcja B" },
  { wartosc: "c", etykieta: "Opcja C" },
];

// Te próby mierzą dwie rzeczy z A5/ZU-5/P-12: (1) że w drzewie nie ma
// natywnego znacznika select, tylko własna kontrolka z rolami ARIA; (2) że
// klawiatura (strzałki, Enter, Escape, Home/End) rzeczywiście przesuwa
// podświetlenie i wybór, nie tylko że atrybuty są obecne.

describe("Select — brak natywnej kontrolki (A5, ZU-5, P-12)", () => {
  it("nie renderuje żadnego natywnego znacznika select", () => {
    const { container } = render(<Select opcje={OPCJE} aria-label="Wybór" />);
    expect(container.querySelector("select")).toBeNull();
  });

  it("ma rolę combobox na przycisku, nie na natywnej kontrolce", () => {
    render(<Select opcje={OPCJE} aria-label="Wybór" />);
    const przycisk = screen.getByRole("combobox", { name: "Wybór" });
    expect(przycisk.tagName).toBe("BUTTON");
  });

  it("po otwarciu pokazuje listbox z opcjami jako role='option'", async () => {
    const uzytkownik = userEvent.setup();
    render(<Select opcje={OPCJE} aria-label="Wybór" />);
    await uzytkownik.click(screen.getByRole("combobox", { name: "Wybór" }));
    const lista = screen.getByRole("listbox");
    expect(within(lista).getAllByRole("option")).toHaveLength(OPCJE.length);
  });
});

describe("Select — klawiatura", () => {
  it("Strzałka w dół z zamkniętej listy otwiera ją i podświetla aktualny wybór", async () => {
    const uzytkownik = userEvent.setup();
    render(<Select opcje={OPCJE} aria-label="Wybór" domyslnaWartosc="a" />);
    const przycisk = screen.getByRole("combobox", { name: "Wybór" });
    przycisk.focus();
    await uzytkownik.keyboard("{ArrowDown}");
    expect(przycisk).toHaveAttribute("aria-expanded", "true");
  });

  it("Strzałka w dół przesuwa podświetlenie na kolejną opcję (aria-activedescendant)", async () => {
    const uzytkownik = userEvent.setup();
    render(<Select opcje={OPCJE} aria-label="Wybór" domyslnaWartosc="a" />);
    const przycisk = screen.getByRole("combobox", { name: "Wybór" });
    przycisk.focus();
    await uzytkownik.keyboard("{ArrowDown}"); // otwiera, podświetla "a" (indeks 0)
    await uzytkownik.keyboard("{ArrowDown}"); // przesuwa na "b" (indeks 1)
    expect(przycisk.getAttribute("aria-activedescendant")).toMatch(/opcja-1$/);
  });

  it("Enter wybiera podświetloną opcję i zamyka listę", async () => {
    const uzytkownik = userEvent.setup();
    const onZmiana = vi.fn();
    render(<Select opcje={OPCJE} aria-label="Wybór" domyslnaWartosc="a" onZmiana={onZmiana} />);
    const przycisk = screen.getByRole("combobox", { name: "Wybór" });
    przycisk.focus();
    await uzytkownik.keyboard("{ArrowDown}{ArrowDown}{Enter}"); // otwórz, przesuń na "b", wybierz
    expect(onZmiana).toHaveBeenCalledWith("b");
    expect(przycisk).toHaveAttribute("aria-expanded", "false");
    expect(przycisk).toHaveTextContent("Opcja B");
  });

  it("Escape zamyka listę bez zmiany wyboru", async () => {
    const uzytkownik = userEvent.setup();
    const onZmiana = vi.fn();
    render(<Select opcje={OPCJE} aria-label="Wybór" domyslnaWartosc="a" onZmiana={onZmiana} />);
    const przycisk = screen.getByRole("combobox", { name: "Wybór" });
    przycisk.focus();
    await uzytkownik.keyboard("{ArrowDown}{ArrowDown}{Escape}"); // otwórz, przesuń, anuluj
    expect(przycisk).toHaveAttribute("aria-expanded", "false");
    expect(onZmiana).not.toHaveBeenCalled();
    expect(przycisk).toHaveTextContent("Opcja A");
  });

  it("End podświetla ostatnią opcję, Home wraca na pierwszą", async () => {
    const uzytkownik = userEvent.setup();
    render(<Select opcje={OPCJE} aria-label="Wybór" domyslnaWartosc="a" />);
    const przycisk = screen.getByRole("combobox", { name: "Wybór" });
    przycisk.focus();
    await uzytkownik.keyboard("{End}");
    expect(przycisk.getAttribute("aria-activedescendant")).toMatch(/opcja-2$/);
    await uzytkownik.keyboard("{Home}");
    expect(przycisk.getAttribute("aria-activedescendant")).toMatch(/opcja-0$/);
  });
});

describe("Select — stan niepoprawny", () => {
  it("niepoprawny ustawia aria-invalid na przycisku", () => {
    render(<Select opcje={OPCJE} aria-label="Wybór" niepoprawny />);
    expect(screen.getByRole("combobox", { name: "Wybór" })).toHaveAttribute("aria-invalid", "true");
  });
});
