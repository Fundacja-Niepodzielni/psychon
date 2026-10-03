import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Zgłoszenia dalszej współpracy na telefonie: filtr stanu stoi w panelu pod
 * wierszem „Stan: <wybrany> (N) · Zmień”; wybór stanu zwija panel i oddaje
 * fokus na wiersz.
 */

const apiPaged = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));
vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return { ...oryginal, api: vi.fn(), apiPaged: (...a: unknown[]) => apiPaged(...a) };
});

const { ZgloszeniaWspolpracy } = await import("../ZgloszeniaWspolpracy");

function zgloszenie(id: number) {
  return {
    id,
    body: `Chcę kontynuować dyżury (${id}).`,
    status: "new",
    response: null,
    responded_at: null,
    created_at: "2026-09-20T10:00:00Z",
    updated_at: "2026-09-20T10:00:00Z",
    responded_by: null,
    user: { id: 17, first_name: "Marta", last_name: "Demo", email: "marta@demo.pl" },
  };
}

function strona(dane: unknown[]) {
  return { data: dane, meta: { current_page: 1, per_page: 25, total: dane.length, last_page: 1 } };
}

beforeEach(() => {
  apiPaged.mockReset();
});

describe("Zgłoszenia współpracy — zwinięte filtry", () => {
  it("wiersz „Stan” niesie liczbę zgłoszeń, a lista stanów stoi w jego panelu", async () => {
    apiPaged.mockResolvedValue(strona([zgloszenie(11), zgloszenie(12), zgloszenie(13)]));
    render(<ZgloszeniaWspolpracy />);
    await screen.findByText(/dyżury \(11\)/);

    const przycisk = screen.getByRole("button", { name: /^Stan:/ });
    expect(przycisk).toHaveAccessibleName("Stan: Wszystkie (3) Zmień");
    expect(przycisk).toHaveAttribute("aria-expanded", "false");
    const panel = document.getElementById(przycisk.getAttribute("aria-controls") ?? "") as HTMLElement;
    expect(within(panel).getByRole("combobox", { name: /^Stan/ })).toBeInTheDocument();
  });

  it("wybór stanu zwija panel i oddaje fokus na wiersz z nowym stanem", async () => {
    const uzytkownik = userEvent.setup();
    apiPaged.mockResolvedValue(strona([zgloszenie(11)]));
    render(<ZgloszeniaWspolpracy />);
    await screen.findByText(/dyżury \(11\)/);

    await uzytkownik.click(screen.getByRole("button", { name: /^Stan:/ }));
    expect(screen.getByRole("button", { name: /^Stan:/ })).toHaveAttribute("aria-expanded", "true");
    await uzytkownik.click(screen.getByRole("combobox", { name: /^Stan/ }));
    await uzytkownik.click(screen.getByRole("option", { name: "Nowe" }));

    await waitFor(() => expect(apiPaged).toHaveBeenLastCalledWith("/admin/cooperation-requests?status=new&page=1"));
    await screen.findByText(/dyżury \(11\)/);
    const po = screen.getByRole("button", { name: /^Stan:/ });
    expect(po).toHaveAccessibleName("Stan: Nowe (1) Zmień");
    expect(po).toHaveAttribute("aria-expanded", "false");
    expect(po).toHaveFocus();
  });
});
