import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Terminy superwizji: po zapisie zmian i po odwołaniu terminu ekran mówi, co się stało,
 * w powiadomieniu `Toast`; odmowa serwera paska nie otwiera.
 */

const fetchAdminSupervisionSlots = vi.fn();
const updateAdminSupervisionSlot = vi.fn();
const cancelAdminSupervisionSlot = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
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

beforeEach(() => {
  fetchAdminSupervisionSlots.mockReset().mockResolvedValue({ data: [TERMIN] });
  updateAdminSupervisionSlot.mockReset();
  cancelAdminSupervisionSlot.mockReset();
});

async function otworzEdycje() {
  render(<SuperwizjeTerminy />);
  await userEvent.click(await screen.findByRole("button", { name: "Edytuj" }));
}

describe("Terminy superwizji — potwierdzenie", () => {
  it("przed zapisem nie ma powiadomienia, po zapisie jest jedno zdanie w roli „status”", async () => {
    updateAdminSupervisionSlot.mockResolvedValue({ ...TERMIN, location_or_link: "Sala 3" });
    await otworzEdycje();
    expect(screen.queryByRole("status")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Zapisz" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Zapisano zmiany terminu superwizji.");
  });

  it("odwołanie terminu: powiadomienie ze zdaniem o odwołaniu", async () => {
    cancelAdminSupervisionSlot.mockResolvedValue({ id: TERMIN.id, signups_released: 3 });
    await otworzEdycje();
    await userEvent.click(screen.getByRole("button", { name: "Odwołaj termin" }));
    await userEvent.click(screen.getAllByRole("button", { name: "Odwołaj termin" })[0]);

    expect(await screen.findByRole("status")).toHaveTextContent("Termin superwizji został odwołany.");
  });

  it("odmowa serwera: błąd w dotychczasowym komunikacie, bez potwierdzenia", async () => {
    updateAdminSupervisionSlot.mockRejectedValue(
      new ApiError({ status: 422, code: "validation_failed", message: "Popraw zaznaczone pola.", errors: { seats_limit: ["Za mało."] } }),
    );
    await otworzEdycje();
    await userEvent.click(screen.getByRole("button", { name: "Zapisz" }));

    await screen.findByText("Nie udało się zapisać");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("zamknięcie przyciskiem zdejmuje powiadomienie, a otwarcie kolejnej edycji też", async () => {
    updateAdminSupervisionSlot.mockResolvedValue(TERMIN);
    await otworzEdycje();
    await userEvent.click(screen.getByRole("button", { name: "Zapisz" }));
    await screen.findByRole("status");

    await userEvent.click(screen.getByRole("button", { name: "Zamknij powiadomienie" }));
    expect(screen.queryByRole("status")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Edytuj" }));
    await userEvent.click(screen.getByRole("button", { name: "Zapisz" }));
    await screen.findByRole("status");
    await userEvent.click(screen.getByRole("button", { name: "Edytuj" }));
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });
});
