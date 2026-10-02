import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/** Komórka „Termin” pokazuje datę z godziną wg słownika; w DOM nie stoi znacznik ISO. */

const fetchAdminSupervisionSlots = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/api/h12", () => ({
  fetchAdminSupervisionSlots: (...args: unknown[]) => fetchAdminSupervisionSlots(...args),
  updateAdminSupervisionSlot: vi.fn(),
  cancelAdminSupervisionSlot: vi.fn(),
}));

const { SuperwizjeTerminy } = await import("../SuperwizjeTerminy");

const TERMIN = {
  id: 9,
  starts_at: "2026-09-25T15:05:00Z",
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
});

describe("SuperwizjeTerminy — daty wg słownika", () => {
  it("komórka terminu: data z godziną, bez znacznika ISO", async () => {
    const { container } = render(<SuperwizjeTerminy />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Edytuj" })).toBeInTheDocument());

    expect(screen.getByRole("cell", { name: "25 września 2026, 17:05" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Joanna Demo" })).toBeInTheDocument();
    expect(container.textContent ?? "").not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});
