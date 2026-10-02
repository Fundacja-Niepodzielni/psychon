import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Po zapisie formy stażu ekran potwierdza wynik paskiem nad listą: powodzenie
 * jako status, niepowodzenie nie zostawia paska powodzenia.
 */

const pobierzFormyStazu = vi.fn();
const utworzFormeStazu = vi.fn();
const zaktualizujFormeStazu = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("../dane", () => ({
  pobierzFormyStazu: (...args: unknown[]) => pobierzFormyStazu(...args),
}));

vi.mock("@/lib/api/h11-formy", () => ({
  utworzFormeStazu: (...args: unknown[]) => utworzFormeStazu(...args),
  zaktualizujFormeStazu: (...args: unknown[]) => zaktualizujFormeStazu(...args),
}));

const { ApiError } = await import("@/lib/api/klient");
const { FormyStazu } = await import("../FormyStazu");

const FORMA = {
  id: 1,
  name: "Dyżur telefoniczny",
  description: "Rozmowa telefoniczna.",
  is_active: true,
  sort_order: 1,
  created_at: null,
  updated_at: null,
};

beforeEach(() => {
  pobierzFormyStazu.mockReset().mockResolvedValue([FORMA]);
  utworzFormeStazu.mockReset();
  zaktualizujFormeStazu.mockReset();
});

async function otworzEkran() {
  render(<FormyStazu />);
  await waitFor(() => expect(screen.getByText("Dyżur telefoniczny")).toBeInTheDocument());
}

describe("FormyStazu — potwierdzenie zapisu", () => {
  it("do czasu zapisu nie ma żadnego paska potwierdzenia", async () => {
    await otworzEkran();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("zapis zmian formy: pasek ze statusem „Zapisano zmiany formy stażu …”", async () => {
    const uzytkownik = userEvent.setup();
    zaktualizujFormeStazu.mockResolvedValue({ ...FORMA, name: "Dyżur telefoniczny 2" });
    await otworzEkran();

    await uzytkownik.click(screen.getByRole("button", { name: "Edytuj" }));
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Zapisano zmiany formy stażu „Dyżur telefoniczny 2”.");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("dodanie formy: pasek ze statusem „Dodano formę stażu …”", async () => {
    const uzytkownik = userEvent.setup();
    utworzFormeStazu.mockResolvedValue({ ...FORMA, id: 2, name: "Czat" });
    await otworzEkran();

    await uzytkownik.click(screen.getByRole("button", { name: "Dodaj formę" }));
    await uzytkownik.type(screen.getByLabelText(/^Nazwa/), "Czat");
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Dodano formę stażu „Czat”.");
  });

  it("odmowa serwera nie pokazuje paska powodzenia", async () => {
    const uzytkownik = userEvent.setup();
    zaktualizujFormeStazu.mockRejectedValue(
      new ApiError({ status: 403, code: "forbidden", message: "Brak dostępu do tej akcji." }),
    );
    await otworzEkran();

    await uzytkownik.click(screen.getByRole("button", { name: "Edytuj" }));
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz" }));

    expect(await screen.findByText("Brak dostępu do tej akcji.")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("pasek zostaje po zapisie, zamyka go przycisk, a fokus wraca na nagłówek ekranu", async () => {
    const uzytkownik = userEvent.setup();
    zaktualizujFormeStazu.mockResolvedValue({ ...FORMA });
    await otworzEkran();

    await uzytkownik.click(screen.getByRole("button", { name: "Edytuj" }));
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz" }));
    await screen.findByRole("status");
    await uzytkownik.click(screen.getByRole("button", { name: "Zamknij komunikat" }));

    expect(screen.queryByRole("status")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1 }));
  });

  it("następna akcja formularza (otwarcie edycji) zdejmuje poprzedni komunikat", async () => {
    const uzytkownik = userEvent.setup();
    zaktualizujFormeStazu.mockResolvedValue({ ...FORMA });
    await otworzEkran();

    await uzytkownik.click(screen.getByRole("button", { name: "Edytuj" }));
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz" }));
    await screen.findByRole("status");
    await uzytkownik.click(screen.getByRole("button", { name: "Edytuj" }));

    expect(screen.queryByRole("status")).toBeNull();
  });
});
