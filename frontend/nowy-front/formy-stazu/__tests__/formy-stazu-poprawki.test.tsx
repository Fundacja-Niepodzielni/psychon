import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Świadek dwustronny trzech poprawek zmierzonych na ekranie słownika form
 * stażu:
 *  1. `ApiError.errors` z odpowiedzi 422 trafia do `blad` właściwego `Field`
 *     (nie tylko do ogólnego komunikatu).
 *  2. Okruszek „Administracja" nie jest odnośnikiem do nieistniejącej trasy —
 *     renderuje się jako sam tekst.
 *  3. Puste albo nieliczbowe pole „Kolejność" trafia w żądaniu dosłownie,
 *     bez cichej zamiany na `0`.
 */

const pobierzFormyStazu = vi.fn();
const utworzFormeStazu = vi.fn();
const zaktualizujFormeStazu = vi.fn();
const back = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, refresh, push: vi.fn(), replace: vi.fn() }),
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
  back.mockReset();
  refresh.mockReset();
});

describe("FormyStazu — poprawki", () => {
  it("422 z errors.name pokazuje tekst pod polem Nazwa, nie tylko w ogólnym komunikacie", async () => {
    const uzytkownik = userEvent.setup();
    zaktualizujFormeStazu.mockRejectedValue(
      new ApiError({
        status: 422,
        code: "validation_failed",
        message: "Popraw zaznaczone pola.",
        errors: { name: ["Forma o tej nazwie już istnieje."] },
      }),
    );

    render(<FormyStazu />);
    await waitFor(() => expect(screen.getByText("Dyżur telefoniczny")).toBeInTheDocument());

    await uzytkownik.click(screen.getByRole("button", { name: "Edytuj" }));
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz" }));

    const bladPola = await screen.findByText("Forma o tej nazwie już istnieje.");
    // Etykieta niesie gwiazdkę wymagalności ("Nazwa *") w osobnym `<span>` —
    // dopasowanie na początek tekstu, nie na całość.
    const polePodBledem = screen.getByLabelText(/^Nazwa/);
    expect(polePodBledem).toHaveAttribute("aria-invalid", "true");
    expect(polePodBledem.getAttribute("aria-describedby")).toContain(bladPola.id);
  });

  it("okruszek „Administracja” nie jest odnośnikiem (trasa nadrzędna nie istnieje)", async () => {
    render(<FormyStazu />);
    await waitFor(() => expect(screen.getByText("Dyżur telefoniczny")).toBeInTheDocument());

    const okruszek = screen.getByText("Administracja");
    expect(okruszek.closest("a")).toBeNull();
    expect(screen.queryByRole("link", { name: "Administracja" })).toBeNull();
  });

  it("puste pole Kolejność trafia w żądaniu jako pusty string, nie jako 0", async () => {
    const uzytkownik = userEvent.setup();
    zaktualizujFormeStazu.mockResolvedValue({ ...FORMA, sort_order: 1 });

    render(<FormyStazu />);
    await waitFor(() => expect(screen.getByText("Dyżur telefoniczny")).toBeInTheDocument());

    await uzytkownik.click(screen.getByRole("button", { name: "Edytuj" }));
    const poleKolejnosci = screen.getByLabelText("Kolejność");
    await uzytkownik.clear(poleKolejnosci);
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz" }));

    await waitFor(() => expect(zaktualizujFormeStazu).toHaveBeenCalledTimes(1));
    const [, payload] = zaktualizujFormeStazu.mock.calls[0] as [number, { sort_order: unknown }];
    expect(payload.sort_order).toBe("");
    expect(payload.sort_order).not.toBe(0);
  });

  it("nieliczbowe (niecałkowite) pole Kolejność (\"1.5\") trafia w żądaniu dosłownie, nie jako 0", async () => {
    const uzytkownik = userEvent.setup();
    zaktualizujFormeStazu.mockResolvedValue({ ...FORMA });

    render(<FormyStazu />);
    await waitFor(() => expect(screen.getByText("Dyżur telefoniczny")).toBeInTheDocument());

    await uzytkownik.click(screen.getByRole("button", { name: "Edytuj" }));
    const poleKolejnosci = screen.getByLabelText("Kolejność");
    await uzytkownik.clear(poleKolejnosci);
    await uzytkownik.type(poleKolejnosci, "1.5");
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz" }));

    await waitFor(() => expect(zaktualizujFormeStazu).toHaveBeenCalledTimes(1));
    const [, payload] = zaktualizujFormeStazu.mock.calls[0] as [number, { sort_order: unknown }];
    expect(payload.sort_order).toBe("1.5");
    expect(payload.sort_order).not.toBe(0);
  });
});
