import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Odmowa ekranu z powodu roli (403 na liście terminów): nazwa roli,
 * nagłówek ekranu, zero terminów w DOM, przycisk wyjścia. Kontrola dodatnia:
 * ta sama atrapa z odpowiedzią 200 pokazuje termin i nie pokazuje odmowy.
 */

const fetchAdminSupervisionSlots = vi.fn();
const back = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/api/h12", () => ({
  fetchAdminSupervisionSlots: (...args: unknown[]) => fetchAdminSupervisionSlots(...args),
  updateAdminSupervisionSlot: vi.fn(),
  cancelAdminSupervisionSlot: vi.fn(),
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
  back.mockReset();
  fetchAdminSupervisionSlots.mockReset();
});

describe("SuperwizjeTerminy — odmowa z powodu roli", () => {
  it("403: nazwa roli, nagłówek ekranu, zero terminów i przycisk wyjścia", async () => {
    fetchAdminSupervisionSlots.mockRejectedValue(
      new ApiError({ status: 403, code: "forbidden", message: "Nie masz dostępu do tego zasobu." }),
    );
    const uzytkownik = userEvent.setup();
    render(<SuperwizjeTerminy />);

    expect(await screen.findByText(/tylko dla administracji/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Terminy superwizji dla administracji" })).toBeInTheDocument();
    expect(screen.queryByText(/Joanna Demo/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Edytuj" })).toBeNull();

    await uzytkownik.click(screen.getByRole("button", { name: "Wróć" }));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("kontrola dodatnia: odpowiedź 200 pokazuje termin, bez stanu odmowy", async () => {
    fetchAdminSupervisionSlots.mockResolvedValue({ data: [TERMIN] });
    render(<SuperwizjeTerminy />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Edytuj" })).toBeInTheDocument());
    expect(screen.queryByText(/tylko dla administracji/)).toBeNull();
  });
});
