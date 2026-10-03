import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Wnioski o profil psychologa na telefonie: filtr stanu stoi w panelu pod
 * wierszem „Stan wniosku: <wybrany> (N) · Zmień”; wybór stanu zwija panel
 * i oddaje fokus na wiersz.
 */

const apiPaged = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));
vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return { ...oryginal, apiPaged: (...a: unknown[]) => apiPaged(...a) };
});

const { ProfileKolejka } = await import("../ProfileKolejka");

function wniosek(id: number) {
  return {
    id,
    user: { id: 40 + id, first_name: "Anna", last_name: "Demo" },
    specializations: ["interwencja kryzysowa"],
    approach: "poznawczo-behawioralny",
    city: "Kraków",
    bio: "Krótki opis.",
    publication_consent_granted: true,
    status: "submitted",
    return_reason: null,
    decided_at: null,
    documents: [],
    created_at: "2026-09-01T10:00:00Z",
    updated_at: "2026-09-01T10:00:00Z",
  };
}

function strona(dane: unknown[]) {
  return { data: dane, meta: { current_page: 1, per_page: 25, total: dane.length, last_page: 1 } };
}

beforeEach(() => {
  apiPaged.mockReset();
});

describe("Wnioski o profil — zwinięte filtry", () => {
  it("wiersz „Stan wniosku” niesie liczbę wniosków, a lista stanów stoi w jego panelu", async () => {
    apiPaged.mockResolvedValue(strona([wniosek(7), wniosek(8)]));
    render(<ProfileKolejka />);
    await screen.findAllByRole("link", { name: "Otwórz wniosek" });

    const przycisk = screen.getByRole("button", { name: /^Stan wniosku:/ });
    expect(przycisk).toHaveAccessibleName("Stan wniosku: Czeka na decyzję (2) Zmień");
    expect(przycisk).toHaveAttribute("aria-expanded", "false");
    const panel = document.getElementById(przycisk.getAttribute("aria-controls") ?? "") as HTMLElement;
    expect(within(panel).getByRole("combobox", { name: /Stan wniosku/ })).toBeInTheDocument();
  });

  it("wybór stanu zwija panel i oddaje fokus na wiersz", async () => {
    const uzytkownik = userEvent.setup();
    apiPaged.mockResolvedValue(strona([wniosek(7)]));
    render(<ProfileKolejka />);
    await screen.findAllByRole("link", { name: "Otwórz wniosek" });

    await uzytkownik.click(screen.getByRole("button", { name: /^Stan wniosku:/ }));
    await uzytkownik.click(screen.getByRole("combobox", { name: /Stan wniosku/ }));
    await uzytkownik.click(screen.getByRole("option", { name: "Do poprawki" }));

    await waitFor(() => expect(apiPaged).toHaveBeenLastCalledWith("/admin/profiles?status=returned&page=1&per_page=25"));
    await screen.findAllByRole("link", { name: "Otwórz wniosek" });
    const po = screen.getByRole("button", { name: /^Stan wniosku:/ });
    expect(po).toHaveAccessibleName("Stan wniosku: Do poprawki (1) Zmień");
    expect(po).toHaveAttribute("aria-expanded", "false");
    expect(po).toHaveFocus();
  });
});
