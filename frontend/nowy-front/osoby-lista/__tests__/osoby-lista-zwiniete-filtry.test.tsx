import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Lista osób na telefonie: wyszukiwanie zostaje na wierzchu, a rola i „Filtruj”
 * stoją w panelu pod wierszem „Filtry: <wybrane> (N) · Zmień”. Układ (ukrycie
 * wiersza od 600 px) robi CSS; tu sprawdzamy budowę drzewa i zachowanie wiersza.
 */

const apiPaged = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
}));
vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return { ...oryginal, apiPaged: (...args: unknown[]) => apiPaged(...args) };
});
vi.mock("@/lib/api/pliki", () => ({ downloadFile: vi.fn() }));

const { OsobyLista } = await import("../OsobyLista");

function osoba(id: number) {
  return {
    id,
    first_name: "Marta",
    last_name: `Demo${id}`,
    email: `osoba${id}@demo.pl`,
    role: "volunteer",
    status: "active",
    product_group: "psychon",
    access_expires_at: "2027-02-01T00:00:00Z",
    program_completed_at: null,
    created_at: "2026-09-20T10:00:00Z",
  };
}

function odpowiedz(dane: unknown[], total = dane.length) {
  return { data: dane, meta: { current_page: 1, per_page: 25, total, last_page: 1 } };
}

function wiersz(nazwa: RegExp) {
  return screen.getByRole("button", { name: nazwa });
}

beforeEach(() => {
  apiPaged.mockReset();
});

describe("Osoby — zwinięte filtry", () => {
  it("wiersz „Filtry” jest zwinięty, niesie liczbę osób, a rola stoi w jego panelu bez wyszukiwania", async () => {
    apiPaged.mockResolvedValue(odpowiedz([osoba(17), osoba(18)], 2));
    render(<OsobyLista />);
    await screen.findByText("Marta Demo17");

    const przycisk = wiersz(/^Filtry:/);
    expect(przycisk).toHaveAccessibleName("Filtry: Wszystkie osoby (2) Zmień");
    expect(przycisk).toHaveAttribute("aria-expanded", "false");
    const panel = document.getElementById(przycisk.getAttribute("aria-controls") ?? "") as HTMLElement;
    expect(within(panel).getByRole("combobox", { name: /^Rola/ })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Filtruj" })).toBeInTheDocument();
    expect(within(panel).queryByRole("textbox", { name: /Szukaj/ })).toBeNull();
    expect(screen.getByRole("textbox", { name: /Szukaj/ })).toBeInTheDocument();
  });

  it("„Filtruj” wysyła zapytanie, zwija panel i oddaje fokus na wiersz z wybraną rolą", async () => {
    const uzytkownik = userEvent.setup();
    apiPaged.mockResolvedValue(odpowiedz([osoba(17)], 1));
    render(<OsobyLista />);
    await screen.findByText("Marta Demo17");

    await uzytkownik.click(wiersz(/^Filtry:/));
    expect(wiersz(/^Filtry:/)).toHaveAttribute("aria-expanded", "true");
    await uzytkownik.click(screen.getByRole("combobox", { name: /^Rola/ }));
    await uzytkownik.click(screen.getByRole("option", { name: "Student" }));
    await uzytkownik.click(screen.getByRole("button", { name: "Filtruj" }));

    await waitFor(() => expect(apiPaged).toHaveBeenLastCalledWith("/admin/users?role=student&page=1&per_page=25"));
    await screen.findByText("Marta Demo17");
    const po = wiersz(/^Filtry:/);
    expect(po).toHaveAccessibleName("Filtry: Student (1) Zmień");
    expect(po).toHaveAttribute("aria-expanded", "false");
    expect(po).toHaveFocus();
  });
});
