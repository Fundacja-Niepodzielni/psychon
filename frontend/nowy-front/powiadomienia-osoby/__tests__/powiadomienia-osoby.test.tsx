import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Karta „Powiadomienia e-mail” osoby (`GET`/`PUT /notifications/preferences`).
 *
 *  a) pokazuje wyłącznie e-maile, które osoba może wyłączyć, z polskimi nazwami;
 *     e-maili „wychodzi zawsze” i „wyłącza tylko administracja” nie ma na liście.
 *  b) przełączenie e-maila zapisuje od razu WYŁĄCZNIE ten wpis i to potwierdza.
 *  c) ponowne przełączenie włącza e-mail z powrotem (drugi PUT z `email: true`).
 *  d) 422 → komunikat serwera, przełącznik wraca do poprzedniego stanu.
 *  e) błąd odczytu → komunikat i ponowna próba.
 *  f) nieznany rodzaj → nazwa ogólna zamiast kodu.
 */

const api = vi.fn();

vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return { ...oryginal, api: (...args: unknown[]) => api(...args) };
});

const { PowiadomieniaEmailOsoby } = await import("../PowiadomieniaEmailOsoby");
const { ApiError } = await import("@/lib/api/klient");

function preferencje() {
  return [
    { type: "access.expired", email: true, switchable: false },
    { type: "application.accepted", email: true, switchable: false },
    { type: "internship.accepted", email: true, switchable: true },
    { type: "internship.returned", email: false, switchable: true },
    { type: "message.received", email: true, switchable: false },
    { type: "supervision.reminder", email: true, switchable: true },
  ];
}

beforeEach(() => {
  api.mockReset().mockImplementation((sciezka: string, opcje?: { method?: string }) => {
    if (sciezka === "/notifications/preferences" && (opcje?.method ?? "GET") === "GET") {
      return Promise.resolve(preferencje());
    }
    return Promise.reject(new Error(`nieoczekiwane żądanie ${sciezka}`));
  });
});

async function lista() {
  return await screen.findByRole("group", { name: "E-maile, które możesz wyłączyć" });
}

describe("PowiadomieniaEmailOsoby", () => {
  it("a) pokazuje tylko e-maile, które osoba może wyłączyć", async () => {
    render(<PowiadomieniaEmailOsoby />);

    const grupa = await lista();
    const pola = within(grupa).getAllByRole("checkbox");
    expect(pola).toHaveLength(3);
    expect(within(grupa).getByRole("checkbox", { name: "Wpis stażu zatwierdzony" })).toBeChecked();
    expect(within(grupa).getByRole("checkbox", { name: "Prośba o poprawkę wpisu stażu" })).not.toBeChecked();
    expect(within(grupa).getByRole("checkbox", { name: "Przypomnienie: jutro superwizja" })).toBeChecked();

    expect(screen.getByRole("heading", { name: "Powiadomienia e-mail" })).toBeInTheDocument();
    expect(screen.getByText(/Powiadomienie w panelu pojawi się zawsze/)).toBeInTheDocument();
    expect(screen.getByText(/Niektórych e-maili nie można wyłączyć/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("access.expired");
    expect(document.body.textContent).not.toContain("Dostęp do materiałów się zakończył");
  });

  it("b) przełączenie zapisuje od razu wyłącznie ten wpis i to potwierdza", async () => {
    const uzytkownik = userEvent.setup();
    render(<PowiadomieniaEmailOsoby />);
    const grupa = await lista();

    api.mockImplementation((_sciezka: string, opcje?: { method?: string }) => {
      if (opcje?.method === "PUT") {
        return Promise.resolve(
          preferencje().map((wpis) => (wpis.type === "internship.accepted" ? { ...wpis, email: false } : wpis)),
        );
      }
      return Promise.resolve(preferencje());
    });

    await uzytkownik.click(within(grupa).getByRole("checkbox", { name: "Wpis stażu zatwierdzony" }));

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/notifications/preferences", {
        method: "PUT",
        body: { preferences: [{ type: "internship.accepted", email: false }] },
      }),
    );
    expect(await screen.findByText("Wpis stażu zatwierdzony: e-mail wyłączony.")).toBeInTheDocument();
    expect(within(grupa).getByRole("checkbox", { name: "Wpis stażu zatwierdzony" })).not.toBeChecked();
    expect(screen.queryByRole("button", { name: /Zapisz/ })).toBeNull();
  });

  it("c) ponowne przełączenie włącza e-mail z powrotem", async () => {
    const uzytkownik = userEvent.setup();
    render(<PowiadomieniaEmailOsoby />);
    const grupa = await lista();

    api.mockImplementation((_sciezka: string, opcje?: { method?: string; body?: { preferences: { type: string; email: boolean }[] } }) => {
      if (opcje?.method === "PUT") {
        const zmiana = opcje.body?.preferences[0];
        return Promise.resolve(
          preferencje().map((wpis) => (wpis.type === zmiana?.type ? { ...wpis, email: zmiana.email } : wpis)),
        );
      }
      return Promise.resolve(preferencje());
    });

    await uzytkownik.click(within(grupa).getByRole("checkbox", { name: "Prośba o poprawkę wpisu stażu" }));

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/notifications/preferences", {
        method: "PUT",
        body: { preferences: [{ type: "internship.returned", email: true }] },
      }),
    );
    expect(await screen.findByText("Prośba o poprawkę wpisu stażu: e-mail włączony.")).toBeInTheDocument();
    expect(within(grupa).getByRole("checkbox", { name: "Prośba o poprawkę wpisu stażu" })).toBeChecked();
  });

  it("d) 422 pokazuje komunikat serwera i przywraca przełącznik", async () => {
    const uzytkownik = userEvent.setup();
    render(<PowiadomieniaEmailOsoby />);
    const grupa = await lista();

    api.mockImplementation((_sciezka: string, opcje?: { method?: string }) => {
      if (opcje?.method === "PUT") {
        return Promise.reject(
          new ApiError({
            status: 422,
            code: "validation_failed",
            message: "Popraw zaznaczone pola.",
            errors: { "preferences.0.email": ["Tego e-maila nie można wyłączyć."] },
          }),
        );
      }
      return Promise.resolve(preferencje());
    });

    await uzytkownik.click(within(grupa).getByRole("checkbox", { name: "Przypomnienie: jutro superwizja" }));

    expect(await screen.findByText("Tego e-maila nie można wyłączyć.")).toBeInTheDocument();
    expect(within(grupa).getByRole("checkbox", { name: "Przypomnienie: jutro superwizja" })).toBeChecked();
  });

  it("e) błąd odczytu pokazuje komunikat i pozwala spróbować ponownie", async () => {
    api.mockRejectedValueOnce(new Error("sieć"));
    const uzytkownik = userEvent.setup();
    render(<PowiadomieniaEmailOsoby />);

    expect(await screen.findByText("Nie udało się wczytać ustawień e-maili.")).toBeInTheDocument();
    await uzytkownik.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));

    expect(await lista()).toBeInTheDocument();
  });

  it("f) nieznany rodzaj e-maila ma nazwę ogólną zamiast kodu", async () => {
    api.mockResolvedValue([{ type: "future.unmapped_type", email: true, switchable: true }]);
    render(<PowiadomieniaEmailOsoby />);

    const grupa = await lista();
    expect(within(grupa).getByRole("checkbox", { name: "Inne powiadomienie" })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("future.unmapped_type");
  });
});
