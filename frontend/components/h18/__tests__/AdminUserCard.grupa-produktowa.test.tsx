import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * Stara karta osoby administracji: grupa produktowa nie jest pokazana w sekcji
 * „Profil” (dane z serwera nadal przychodzą, ekran ich nie wypisuje).
 */

const fetchAdminUser = vi.fn();

class ApiError extends Error {
  status = 0;
}

vi.mock("@/lib/api", () => ({
  fetchAdminUser: (...args: unknown[]) => fetchAdminUser(...args),
  updateAdminUser: vi.fn(),
  blockAdminUser: vi.fn(),
  fetchAdminUsers: vi.fn(async () => ({ data: [], meta: undefined })),
  assignSupervisor: vi.fn(),
  resetTestAttempts: vi.fn(),
  ApiError,
}));

const { default: AdminUserCard } = await import("@/components/h18/AdminUserCard");

const KARTA = {
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
    product_group: "dobrostan",
  },
  progress: { courses_done: 1, courses_total: 3, hours_accepted: "10", supervision_present: 2, workshop_done: false },
  documents: [],
  recent_notifications: [],
  audit_entries: [],
};

beforeEach(() => {
  fetchAdminUser.mockReset().mockResolvedValue(KARTA);
});

afterEach(() => {
  cleanup();
});

describe("stara karta osoby — grupa produktowa schowana", () => {
  it("sekcja Profil nie ma wiersza grupy produktowej ani jej wartości", async () => {
    render(<AdminUserCard id={7} />);
    await screen.findByText("Anna Kowalska");

    expect(screen.getAllByText("E-mail").length).toBeGreaterThan(0);
    expect(screen.getByText("Adres")).toBeInTheDocument();
    expect(screen.queryByText("Grupa produktowa")).not.toBeInTheDocument();
    expect(screen.queryByText("dobrostan")).not.toBeInTheDocument();
  });
});
