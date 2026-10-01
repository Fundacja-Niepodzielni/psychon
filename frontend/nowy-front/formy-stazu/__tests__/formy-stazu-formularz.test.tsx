import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Formularz „Nowa forma” / „Edytuj formę” w słowniku form stażu: stoi na wspólnym
 * organizmie `FormSection` (jedna kolumna pól, „Anuluj” i „Zapisz” w jednym rzędzie),
 * pole kolejności nazywa się dla osoby „Miejsce na liście” i ma podpowiedź, a domyślne
 * miejsce nowej formy to następne wolne (makieta 2.0.4, `.dacts`, `.btn.q`).
 */

const pobierzFormyStazu = vi.fn();
const utworzFormeStazu = vi.fn();
const zaktualizujFormeStazu = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("../dane", () => ({ pobierzFormyStazu: (...args: unknown[]) => pobierzFormyStazu(...args) }));
vi.mock("@/lib/api/h11-formy", () => ({
  utworzFormeStazu: (...args: unknown[]) => utworzFormeStazu(...args),
  zaktualizujFormeStazu: (...args: unknown[]) => zaktualizujFormeStazu(...args),
}));

const { ApiError } = await import("@/lib/api/klient");
const { FormyStazu } = await import("../FormyStazu");

function forma(id: number, sortOrder: number, nazwa = `Forma ${id}`) {
  return { id, name: nazwa, description: "Opis.", is_active: true, sort_order: sortOrder, created_at: null, updated_at: null };
}

beforeEach(() => {
  pobierzFormyStazu.mockReset().mockResolvedValue([forma(1, 1), forma(2, 2), forma(3, 5)]);
  utworzFormeStazu.mockReset();
  zaktualizujFormeStazu.mockReset();
});

async function otworzNowa(lista = [forma(1, 1), forma(2, 2), forma(3, 5)]) {
  pobierzFormyStazu.mockResolvedValue(lista);
  const uzytkownik = userEvent.setup();
  const wynik = render(<FormyStazu />);
  await screen.findAllByRole("button", { name: "Dodaj formę" });
  await uzytkownik.click(screen.getAllByRole("button", { name: "Dodaj formę" })[0]);
  return { uzytkownik, ...wynik };
}

describe("FormyStazu — formularz na FormSection", () => {
  it("formularz to `FormSection`: formularz z nazwą „Nowa forma”, nagłówek h2, cztery pola w tej kolejności, „Anuluj” przed „Zapisz” w jednym rzędzie", async () => {
    const { container } = await otworzNowa();

    const formularz = screen.getByRole("form", { name: "Nowa forma" });
    expect(within(formularz).getByRole("heading", { level: 2, name: "Nowa forma" })).toBeInTheDocument();

    const etykiety = Array.from(formularz.querySelectorAll("label")).map((l) => l.textContent?.replace(/\s*\*$/, "").trim());
    expect(etykiety).toEqual(["Nazwa", "Opis", "Miejsce na liście", "Stan"]);

    const anuluj = within(formularz).getByRole("button", { name: "Anuluj" });
    const zapisz = within(formularz).getByRole("button", { name: "Zapisz" });
    expect(anuluj.parentElement).toBe(zapisz.parentElement);
    expect(anuluj.compareDocumentPosition(zapisz) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(anuluj).toHaveAttribute("type", "button");
    expect(zapisz).toHaveAttribute("type", "submit");

    // Lokalnego panelu i rzędu pól już nie ma — pola stoją w jednej kolumnie organizmu.
    expect(container.querySelector('[class*="panel"]')).toBeNull();
    expect(formularz.querySelector('[class*="wiersz"]')).toBeNull();
    // Fokus po otwarciu trafia w pierwsze pole.
    expect(screen.getByLabelText(/^Nazwa/)).toHaveFocus();
  });

  it("pole „Miejsce na liście” ma podpowiedź „1 = na górze listy form” powiązaną z polem przez aria-describedby", async () => {
    await otworzNowa();
    const pole = screen.getByLabelText("Miejsce na liście");
    const podpowiedz = screen.getByText("1 = na górze listy form");
    expect(podpowiedz.id).not.toBe("");
    expect(pole.getAttribute("aria-describedby")).toContain(podpowiedz.id);
  });

  it("domyślne miejsce nowej formy dla pustej listy to 1, nie 0", async () => {
    await otworzNowa([]);
    expect(screen.getByLabelText("Miejsce na liście")).toHaveValue(1);
  });

  it("domyślne miejsce nowej formy dla listy z miejscami 1, 2, 5 to 6, a zapis wysyła 6", async () => {
    utworzFormeStazu.mockResolvedValue(forma(9, 6, "Nowa"));
    const { uzytkownik } = await otworzNowa();
    expect(screen.getByLabelText("Miejsce na liście")).toHaveValue(6);

    await uzytkownik.type(screen.getByLabelText(/^Nazwa/), "Nowa");
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz" }));
    await waitFor(() => expect(utworzFormeStazu).toHaveBeenCalledTimes(1));
    expect(utworzFormeStazu.mock.calls[0][0]).toMatchObject({ name: "Nowa", sort_order: 6 });
  });

  it("edycja istniejącej formy pokazuje jej miejsce bez zmian, także gdy to nie jest największe", async () => {
    const uzytkownik = userEvent.setup();
    render(<FormyStazu />);
    await screen.findByText("Forma 2");
    const wiersze = screen.getAllByRole("button", { name: "Edytuj" });
    await uzytkownik.click(wiersze[1]);

    expect(screen.getByRole("form", { name: "Edytuj formę" })).toBeInTheDocument();
    expect(screen.getByLabelText("Miejsce na liście")).toHaveValue(2);
    expect(screen.getByLabelText(/^Nazwa/)).toHaveValue("Forma 2");
  });

  it("„Anuluj” zamyka panel bez zapisu", async () => {
    const { uzytkownik } = await otworzNowa();
    await uzytkownik.type(screen.getByLabelText(/^Nazwa/), "Cokolwiek");
    await uzytkownik.click(screen.getByRole("button", { name: "Anuluj" }));

    expect(screen.queryByRole("form", { name: "Nowa forma" })).toBeNull();
    expect(utworzFormeStazu).not.toHaveBeenCalled();
    expect(zaktualizujFormeStazu).not.toHaveBeenCalled();
  });

  it("w wyrenderowanym ekranie (lista i otwarty formularz) nie ma słów „Kolejność” ani „sort order”", async () => {
    const { container } = await otworzNowa();
    expect(container.textContent).not.toMatch(/Kolejność|sort order/i);
    expect(container.textContent).toContain("Miejsce na liście");
  });

  it("błąd 422 z polem: tekst pod polem i jedno podsumowanie FormSection, bez drugiego ogólnego komunikatu", async () => {
    utworzFormeStazu.mockRejectedValue(
      new ApiError({
        status: 422,
        code: "validation_failed",
        message: "Popraw zaznaczone pola.",
        errors: { name: ["Podaj nazwę formy stażu."] },
      }),
    );
    const { uzytkownik } = await otworzNowa();
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz" }));

    expect(await screen.findByText("Podaj nazwę formy stażu.")).toBeInTheDocument();
    expect(screen.getAllByText("Popraw zaznaczone pola")).toHaveLength(1);
    expect(screen.queryByText("Nie udało się zapisać")).toBeNull();
  });

  it("błąd bez pól (np. 500): ogólny komunikat serwera nad formularzem", async () => {
    utworzFormeStazu.mockRejectedValue(
      new ApiError({ status: 500, code: "server_error", message: "Coś poszło nie tak po stronie serwera." }),
    );
    const { uzytkownik } = await otworzNowa();
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz" }));

    expect(await screen.findByText("Nie udało się zapisać")).toBeInTheDocument();
    expect(screen.getByText("Coś poszło nie tak po stronie serwera.")).toBeInTheDocument();
  });
});
