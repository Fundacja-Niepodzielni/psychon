import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Karta osoby (stara, `AdminUserCard.tsx`) — odblokowanie konta: przycisk
 * „Odblokuj konto” wyłącznie przy `account.status === "blocked"`, zamiast
 * formularza blokady; odmowa serwera pokazuje jego zdanie.
 */

const fetchAdminUser = vi.fn();
const updateAdminUser = vi.fn();
const blockAdminUser = vi.fn();
const unblockAdminUser = vi.fn();
const fetchAdminUsers = vi.fn();
const assignSupervisor = vi.fn();
const resetTestAttempts = vi.fn();

class ApiError extends Error {
  status: number;
  code: string;
  errors?: Record<string, string[]>;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

vi.mock("@/lib/api", () => ({
  fetchAdminUser: (...args: unknown[]) => fetchAdminUser(...args),
  updateAdminUser: (...args: unknown[]) => updateAdminUser(...args),
  blockAdminUser: (...args: unknown[]) => blockAdminUser(...args),
  unblockAdminUser: (...args: unknown[]) => unblockAdminUser(...args),
  fetchAdminUsers: (...args: unknown[]) => fetchAdminUsers(...args),
  assignSupervisor: (...args: unknown[]) => assignSupervisor(...args),
  resetTestAttempts: (...args: unknown[]) => resetTestAttempts(...args),
  ApiError,
}));

const { default: AdminUserCard } = await import("@/components/h18/AdminUserCard");

function karta(status: "active" | "invited" | "blocked" | "deleted") {
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
    account: { status },
    progress: {
      courses_done: 1,
      courses_total: 3,
      hours_accepted: "10",
      supervision_present: 2,
      workshop_done: false,
    },
    documents: [],
    recent_notifications: [],
    audit_entries:
      status === "blocked"
        ? [
            {
              id: 2,
              action: "user.blocked",
              actor_id: 1,
              details: { reason: "Naruszenie regulaminu" },
              created_at: "2026-09-30T10:00:00Z",
            },
          ]
        : [],
  };
}

beforeEach(() => {
  fetchAdminUser.mockReset();
  updateAdminUser.mockReset();
  blockAdminUser.mockReset();
  unblockAdminUser.mockReset();
  fetchAdminUsers.mockReset().mockResolvedValue({ data: [], meta: undefined });
  assignSupervisor.mockReset();
  resetTestAttempts.mockReset();
});

afterEach(() => {
  // Odmontowanie przed zdjęciem zaślepek — ten sam wyścig co w `AdminUserCard.slots.test.tsx`.
  cleanup();
  vi.restoreAllMocks();
});

async function pokazKarte() {
  render(<AdminUserCard id={7} />);
  await screen.findByText("Anna Kowalska");
}

describe("karta osoby: odblokowanie konta", () => {
  it.each(["active", "invited", "deleted"] as const)(
    "konto %s: formularz blokady, bez przycisku „Odblokuj konto”",
    async (status) => {
      fetchAdminUser.mockResolvedValue(karta(status));
      await pokazKarte();

      expect(screen.getByRole("button", { name: "Zablokuj konto" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Odblokuj konto" })).toBeNull();
    },
  );

  it("konto zablokowane: zdanie z datą i powodem, przycisk zamiast formularza", async () => {
    fetchAdminUser.mockResolvedValue(karta("blocked"));
    await pokazKarte();

    expect(
      screen.getByText("Konto jest zablokowane od 30.09.2026. Powód: Naruszenie regulaminu."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Odblokuj konto" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Zablokuj konto" })).toBeNull();
    expect(screen.queryByLabelText("Powód blokady")).toBeNull();
  });

  it("klik „Odblokuj konto” woła trasę i wczytuje kartę ponownie", async () => {
    fetchAdminUser
      .mockResolvedValueOnce(karta("blocked"))
      .mockResolvedValue(karta("active"));
    unblockAdminUser.mockResolvedValue(karta("active"));
    await pokazKarte();

    fireEvent.click(screen.getByRole("button", { name: "Odblokuj konto" }));

    await waitFor(() => expect(unblockAdminUser).toHaveBeenCalledWith(7));
    await screen.findByRole("button", { name: "Zablokuj konto" });
    expect(fetchAdminUser).toHaveBeenCalledTimes(2);
  });

  it("odmowa 409 pokazuje zdanie serwera, przycisk zostaje", async () => {
    fetchAdminUser.mockResolvedValue(karta("blocked"));
    unblockAdminUser.mockRejectedValue(
      new ApiError(409, "account_not_blocked", "To konto nie jest zablokowane."),
    );
    await pokazKarte();

    fireEvent.click(screen.getByRole("button", { name: "Odblokuj konto" }));

    await screen.findByText("To konto nie jest zablokowane.");
    expect(screen.getByRole("button", { name: "Odblokuj konto" })).toBeTruthy();
  });
});
