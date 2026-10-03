import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Zgłoszenia rekrutacyjne na telefonie: wyszukiwanie zostaje na wierzchu,
 * stan i „Filtruj” stoją w panelu pod wierszem „Filtry: <wybrane> (N) · Zmień”.
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

const { ZgloszeniaLista } = await import("../ZgloszeniaLista");

function zgloszenie(id: number) {
  return {
    id,
    edition_id: 1,
    first_name: "Anna",
    last_name: `Kandydat${id}`,
    email: `kandydat${id}@demo.pl`,
    phone: null,
    source: null,
    role: "volunteer",
    payload: null,
    university: null,
    graduation_year: null,
    consent_regulamin_at: null,
    consent_polityka_at: null,
    status: "new",
    rejection_reason: null,
    decided_by: null,
    decided_at: null,
    user_id: null,
    has_diploma_scan: false,
    diploma_scan_url: null,
    created_at: "2026-09-20T10:00:00Z",
    updated_at: "2026-09-20T10:00:00Z",
  };
}

function odpowiedz(dane: unknown[]) {
  return { data: dane, meta: { current_page: 1, per_page: 25, total: dane.length, last_page: 1, edition_id: 1 } };
}

beforeEach(() => {
  apiPaged.mockReset();
});

describe("Zgłoszenia rekrutacyjne — zwinięte filtry", () => {
  it("wiersz „Filtry” niesie liczbę zgłoszeń, a stan stoi w jego panelu bez wyszukiwania", async () => {
    apiPaged.mockResolvedValue(odpowiedz([zgloszenie(3), zgloszenie(4)]));
    render(<ZgloszeniaLista />);
    await screen.findByText(/Kandydat3/);

    const przycisk = screen.getByRole("button", { name: /^Filtry:/ });
    expect(przycisk).toHaveAccessibleName("Filtry: Wszystkie zgłoszenia (2) Zmień");
    expect(przycisk).toHaveAttribute("aria-expanded", "false");
    const panel = document.getElementById(przycisk.getAttribute("aria-controls") ?? "") as HTMLElement;
    expect(within(panel).getByRole("combobox", { name: /^Stan/ })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Filtruj" })).toBeInTheDocument();
    expect(within(panel).queryByRole("textbox", { name: /Szukaj/ })).toBeNull();
  });

  it("„Filtruj” zwija panel i oddaje fokus na wiersz z wybranym stanem", async () => {
    const uzytkownik = userEvent.setup();
    apiPaged.mockResolvedValue(odpowiedz([zgloszenie(3)]));
    render(<ZgloszeniaLista />);
    await screen.findByText(/Kandydat3/);

    await uzytkownik.click(screen.getByRole("button", { name: /^Filtry:/ }));
    await uzytkownik.click(screen.getByRole("combobox", { name: /^Stan/ }));
    await uzytkownik.click(screen.getByRole("option", { name: "Czeka na decyzję" }));
    await uzytkownik.click(screen.getByRole("button", { name: "Filtruj" }));

    await waitFor(() =>
      expect(apiPaged).toHaveBeenLastCalledWith("/admin/applications?page=1&per_page=25&status=new"),
    );
    await screen.findByText(/Kandydat3/);
    const po = screen.getByRole("button", { name: /^Filtry:/ });
    expect(po).toHaveAccessibleName("Filtry: Czeka na decyzję (1) Zmień");
    expect(po).toHaveAttribute("aria-expanded", "false");
    expect(po).toHaveFocus();
  });
});
