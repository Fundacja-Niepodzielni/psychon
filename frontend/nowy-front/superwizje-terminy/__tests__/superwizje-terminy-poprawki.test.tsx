import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Świadek dwustronny poprawek zmierzonych na ekranie terminów superwizji:
 *  1. `ApiError.errors` z odpowiedzi 422 trafia do `blad` właściwego `Field`.
 *  2. Okruszek „Administracja" nie jest odnośnikiem do nieistniejącej trasy.
 *  3. Przycisk „Odśwież" (pusty stan) wykonuje DRUGIE wywołanie GET, nie jest
 *     no-opem.
 *  4. `starts_at`: wpis w czasie lokalnym przeglądarki trafia do żądania jako
 *     ISO 8601 UTC.
 *  5. Odwołanie terminu wymaga potwierdzenia (okno `Dialog`) przed
 *     wywołaniem trasy.
 *  6. Puste/nieliczbowe „Czas trwania"/„Limit miejsc" trafiają w żądaniu
 *     dosłownie, bez cichej zamiany na `undefined`.
 */

const fetchAdminSupervisionSlots = vi.fn();
const updateAdminSupervisionSlot = vi.fn();
const cancelAdminSupervisionSlot = vi.fn();
const back = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, refresh, push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/api/h12", () => ({
  fetchAdminSupervisionSlots: (...args: unknown[]) => fetchAdminSupervisionSlots(...args),
  updateAdminSupervisionSlot: (...args: unknown[]) => updateAdminSupervisionSlot(...args),
  cancelAdminSupervisionSlot: (...args: unknown[]) => cancelAdminSupervisionSlot(...args),
}));

const { ApiError } = await import("@/lib/api/klient");
const { SuperwizjeTerminy } = await import("../SuperwizjeTerminy");

const TERMIN = {
  id: 9,
  starts_at: "2026-10-03T12:00:00Z",
  duration_minutes: 60,
  seats_limit: 6,
  location_or_link: "Sala 2",
  supervisor: { id: 5, first_name: "Joanna", last_name: "Demo" },
  active_signups_count: 3,
  available_seats: 3,
  signups: [],
};

const ORYGINALNY_TZ = process.env.TZ;

beforeEach(() => {
  fetchAdminSupervisionSlots.mockReset().mockResolvedValue({ data: [TERMIN] });
  updateAdminSupervisionSlot.mockReset();
  cancelAdminSupervisionSlot.mockReset();
  back.mockReset();
  refresh.mockReset();
});

afterEach(() => {
  process.env.TZ = ORYGINALNY_TZ;
});

describe("SuperwizjeTerminy — poprawki", () => {
  it("422 z errors.starts_at pokazuje tekst pod polem daty, nie tylko w ogólnym komunikacie", async () => {
    const uzytkownik = userEvent.setup();
    updateAdminSupervisionSlot.mockRejectedValue(
      new ApiError({
        status: 422,
        code: "validation_failed",
        message: "Popraw zaznaczone pola.",
        errors: { starts_at: ["Podaj prawidłową datę i godzinę spotkania."] },
      }),
    );

    render(<SuperwizjeTerminy />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Edytuj" })).toBeInTheDocument());
    await uzytkownik.click(screen.getByRole("button", { name: "Edytuj" }));
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz" }));

    const bladPola = await screen.findByText("Podaj prawidłową datę i godzinę spotkania.");
    const poleDaty = screen.getByLabelText(/^Data i godzina spotkania/);
    expect(poleDaty).toHaveAttribute("aria-invalid", "true");
    expect(poleDaty.getAttribute("aria-describedby")).toContain(bladPola.id);
  });

  it("okruszek „Administracja” nie jest odnośnikiem (trasa nadrzędna nie istnieje)", async () => {
    render(<SuperwizjeTerminy />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Edytuj" })).toBeInTheDocument());

    const okruszek = screen.getByText("Administracja");
    expect(okruszek.closest("a")).toBeNull();
    expect(screen.queryByRole("link", { name: "Administracja" })).toBeNull();
  });

  it("przycisk „Odśwież” w pustym stanie wykonuje drugie wywołanie GET", async () => {
    const uzytkownik = userEvent.setup();
    fetchAdminSupervisionSlots.mockResolvedValue({ data: [] });

    render(<SuperwizjeTerminy />);
    await waitFor(() => expect(fetchAdminSupervisionSlots).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Odśwież" })).toBeInTheDocument());

    await uzytkownik.click(screen.getByRole("button", { name: "Odśwież" }));

    await waitFor(() => expect(fetchAdminSupervisionSlots).toHaveBeenCalledTimes(2));
  });

  it("starts_at: 10:00 lokalnie (Europe/Warsaw, wrzesień = UTC+2) trafia w żądaniu jako 2026-09-10T08:00:00.000Z", async () => {
    process.env.TZ = "Europe/Warsaw";
    const uzytkownik = userEvent.setup();
    updateAdminSupervisionSlot.mockResolvedValue({ ...TERMIN });

    render(<SuperwizjeTerminy />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Edytuj" })).toBeInTheDocument());
    await uzytkownik.click(screen.getByRole("button", { name: "Edytuj" }));

    const poleDaty = screen.getByLabelText(/^Data i godzina spotkania/) as HTMLInputElement;
    // Ustawienie `.value` przez natywny setter (nie przez właściwość
    // instancji, którą React nadpisuje śledzeniem ostatniej wartości) +
    // zdarzenie `input` — standardowy sposób symulacji wyboru w widżecie
    // `datetime-local`, którego `userEvent.type` nie wspiera segment-po-segmencie.
    const natywnySetterWartosci = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;
    act(() => {
      natywnySetterWartosci.call(poleDaty, "2026-09-10T10:00");
      poleDaty.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz" }));

    await waitFor(() => expect(updateAdminSupervisionSlot).toHaveBeenCalledTimes(1));
    const [, payload] = updateAdminSupervisionSlot.mock.calls[0] as [number, { starts_at: string }];
    expect(payload.starts_at).toBe(new Date("2026-09-10T10:00").toISOString());
    expect(payload.starts_at).toBe("2026-09-10T08:00:00.000Z");
  });

  it("odwołanie terminu wymaga potwierdzenia w oknie Dialog przed wywołaniem trasy", async () => {
    const uzytkownik = userEvent.setup();
    cancelAdminSupervisionSlot.mockResolvedValue({ id: TERMIN.id, signups_released: 3, cancelled_at: "2026-10-02T15:00:00Z" });

    render(<SuperwizjeTerminy />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Odwołaj termin" })).toBeInTheDocument());

    await uzytkownik.click(screen.getByRole("button", { name: "Odwołaj termin" }));
    expect(cancelAdminSupervisionSlot).not.toHaveBeenCalled();

    const okno = screen.getByRole("dialog");
    await uzytkownik.click(within(okno).getByRole("button", { name: "Odwołaj termin" }));

    await waitFor(() => expect(cancelAdminSupervisionSlot).toHaveBeenCalledTimes(1));
    expect(cancelAdminSupervisionSlot).toHaveBeenCalledWith(TERMIN.id);
  });

  it("puste pole Czas trwania trafia w żądaniu jako pusty string, nie jako undefined", async () => {
    const uzytkownik = userEvent.setup();
    updateAdminSupervisionSlot.mockResolvedValue({ ...TERMIN });

    render(<SuperwizjeTerminy />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Edytuj" })).toBeInTheDocument());
    await uzytkownik.click(screen.getByRole("button", { name: "Edytuj" }));

    await uzytkownik.clear(screen.getByLabelText("Czas trwania (minuty)"));
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz" }));

    await waitFor(() => expect(updateAdminSupervisionSlot).toHaveBeenCalledTimes(1));
    const [, payload] = updateAdminSupervisionSlot.mock.calls[0] as [number, { duration_minutes: unknown }];
    expect(payload.duration_minutes).toBe("");
    expect(payload.duration_minutes).not.toBeUndefined();
  });
});
