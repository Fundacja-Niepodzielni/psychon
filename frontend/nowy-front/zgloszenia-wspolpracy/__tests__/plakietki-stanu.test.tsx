import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Brzmienie stanu zgłoszenia na liście administracji: plakietka w wierszu
 * pisana małą literą, opcje filtra statusu wielką, bez słów zakazanych
 * słownika i bez surowych kodów stanu jako tekstu.
 */

const pobierzZgloszeniaAdministracji = vi.fn();
const odpowiedzNaZgloszenie = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/api/h01-wspolpraca", () => ({
  pobierzZgloszeniaAdministracji: (...args: unknown[]) => pobierzZgloszeniaAdministracji(...args),
  odpowiedzNaZgloszenie: (...args: unknown[]) => odpowiedzNaZgloszenie(...args),
}));

const { ZgloszeniaWspolpracy } = await import("../ZgloszeniaWspolpracy");

function zgloszenie(id: number, status: "new" | "answered" | "closed", imie: string) {
  return {
    id,
    body: `Treść zgłoszenia numer ${id}.`,
    status,
    response: status === "new" ? null : "Dziękujemy za zgłoszenie.",
    responded_at: status === "new" ? null : "2026-09-21T10:00:00Z",
    created_at: "2026-09-20T10:00:00Z",
    updated_at: "2026-09-20T10:00:00Z",
    responded_by: status === "new" ? null : 3,
    user: { id: 10 + id, first_name: imie, last_name: "Demo", email: `${imie.toLowerCase()}@demo.pl` },
  };
}

const ZAKAZANE_SLOWA = [/\bNew\b/, /\bOpen\b/, /\bAnswered\b/, /\bClosed\b/, /Otwarte/, /Rozwiązane/, /Obsłużone/];
const SUROWE_KODY = /\b(new|answered|closed)\b/;

beforeEach(() => {
  pobierzZgloszeniaAdministracji.mockReset();
  odpowiedzNaZgloszenie.mockReset();
});

describe("ZgloszeniaWspolpracy — plakietki stanu małą literą, filtr wielką", () => {
  it("lista: plakietki „nowe”, „z odpowiedzią”, „zamknięte”; opcje filtra z wielkiej litery; zero słów zakazanych i surowych kodów", async () => {
    const uzytkownik = userEvent.setup();
    pobierzZgloszeniaAdministracji.mockResolvedValue({
      data: [zgloszenie(1, "new", "Marta"), zgloszenie(2, "answered", "Filip"), zgloszenie(3, "closed", "Ewa")],
      meta: { current_page: 1, per_page: 25, total: 3, last_page: 1 },
    });

    render(<ZgloszeniaWspolpracy />);
    await waitFor(() => expect(screen.getByText("Marta Demo")).toBeInTheDocument());

    expect(screen.getAllByText("nowe")).toHaveLength(1);
    expect(screen.getAllByText("z odpowiedzią")).toHaveLength(1);
    expect(screen.getAllByText("zamknięte")).toHaveLength(1);

    await uzytkownik.click(screen.getByRole("combobox", { name: /^Status/ }));
    const opcje = screen.getAllByRole("option").map((opcja) => opcja.textContent);
    expect(opcje).toEqual(["Wszystkie", "Nowe", "Z odpowiedzią", "Zamknięte"]);
    expect(screen.getAllByText("nowe")).toHaveLength(1);

    const tekst = document.body.textContent ?? "";
    for (const zakazane of ZAKAZANE_SLOWA) expect(tekst).not.toMatch(zakazane);
    expect(tekst).not.toMatch(SUROWE_KODY);
  });
});
