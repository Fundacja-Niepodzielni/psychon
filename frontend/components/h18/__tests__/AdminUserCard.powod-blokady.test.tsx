import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * Karta osoby (stara, `AdminUserCard.tsx`) — powód blokady czytany z konta
 * (`account.blocked_reason`), nie z ładunku wpisu dziennika `user.blocked`:
 * rejestr zdarzeń nie niesie tekstu wpisanego ręcznie.
 */

const fetchAdminUser = vi.fn();
const noop = vi.fn();

class ApiError extends Error {
  status = 0;
  code = "";
}

vi.mock("@/lib/api", () => ({
  fetchAdminUser: (...args: unknown[]) => fetchAdminUser(...args),
  updateAdminUser: (...args: unknown[]) => noop(...args),
  blockAdminUser: (...args: unknown[]) => noop(...args),
  unblockAdminUser: (...args: unknown[]) => noop(...args),
  fetchAdminUsers: (...args: unknown[]) => noop(...args),
  assignSupervisor: (...args: unknown[]) => noop(...args),
  resetTestAttempts: (...args: unknown[]) => noop(...args),
  ApiError,
}));

const { default: AdminUserCard } = await import("@/components/h18/AdminUserCard");

function kartaZablokowana(
  blockedReason: string | null | undefined,
  details: Record<string, unknown> | null,
) {
  return {
    profile: {
      id: 7,
      first_name: "Anna",
      last_name: "Kowalska",
      email: "anna@example.com",
      role: "volunteer" as const,
      phone: null,
      pesel: null,
      address: { street: null, city: null, zip: null },
      access_expires_at: null,
      program_completed_at: null,
      product_group: "psychon",
    },
    account:
      blockedReason === undefined
        ? { status: "blocked" as const }
        : { status: "blocked" as const, blocked_reason: blockedReason },
    progress: {
      courses_done: 1,
      courses_total: 3,
      hours_accepted: "10",
      supervision_present: 2,
      workshop_done: false,
    },
    documents: [],
    recent_notifications: [],
    audit_entries: [
      {
        id: 2,
        action: "user.blocked",
        actor_id: 1,
        details,
        created_at: "2026-09-30T10:00:00Z",
      },
    ],
  };
}

beforeEach(() => {
  fetchAdminUser.mockReset();
  noop.mockReset().mockResolvedValue({ data: [], meta: undefined });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function pokazKarte() {
  render(<AdminUserCard id={7} />);
  await screen.findByText("Anna Kowalska");
}

describe("karta osoby: powód blokady z konta", () => {
  it("pokazuje powód z account.blocked_reason, a nie z ładunku wpisu dziennika", async () => {
    fetchAdminUser.mockResolvedValue(
      kartaZablokowana("Powód z konta", { previous_status: "active", reason: "Powód ze starego wpisu" }),
    );
    await pokazKarte();

    expect(
      screen.getByText("Konto jest zablokowane od 30.09.2026. Powód: Powód z konta."),
    ).toBeTruthy();
    expect(screen.queryByText(/Powód ze starego wpisu/)).toBeNull();
  });

  it("konto bez zapisanego powodu: samo zdanie o blokadzie z datą, bez „Powód:”", async () => {
    fetchAdminUser.mockResolvedValue(kartaZablokowana(null, { previous_status: "active" }));
    await pokazKarte();

    expect(screen.getByText("Konto jest zablokowane od 30.09.2026.")).toBeTruthy();
    expect(screen.queryByText(/Powód:/)).toBeNull();
  });

  it("karta bez pola account.blocked_reason nie wywraca ekranu", async () => {
    fetchAdminUser.mockResolvedValue(kartaZablokowana(undefined, null));
    await pokazKarte();

    expect(screen.getByText("Konto jest zablokowane od 30.09.2026.")).toBeTruthy();
  });
});
