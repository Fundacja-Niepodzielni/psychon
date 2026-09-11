import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * Świadek listy osób (H18) po przepięciu na `ListTemplate` +
 * `useZasobStronicowany` (C2 wariant C, partia P1). Cztery nogi negatywne —
 * ładowanie, błąd, pusta lista, 403 — obok jednej nogi pozytywnej.
 */

const fetchAdminUsers = vi.fn();
const downloadAdminUsersCsv = vi.fn();

class ApiError extends Error {
  status: number;
  code: string;
  errors?: Record<string, string[]>;
  constructor(status: number, code: string, message: string, errors?: Record<string, string[]>) {
    super(message);
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

vi.mock("@/lib/api", () => ({
  fetchAdminUsers: (...args: unknown[]) => fetchAdminUsers(...args),
  downloadAdminUsersCsv: (...args: unknown[]) => downloadAdminUsersCsv(...args),
  ApiError,
}));

const { default: AdminUsersList } = await import("@/components/h18/AdminUsersList");

const osoba = {
  id: 3,
  first_name: "Marta",
  last_name: "Kowalska",
  email: "marta@example.com",
  role: "volunteer" as const,
  status: "active" as const,
};

beforeEach(() => {
  fetchAdminUsers.mockReset();
  downloadAdminUsersCsv.mockReset();
});

describe("AdminUsersList", () => {
  it("nagłówek pochodzi z PageHeader, tabela pokazuje osobę po wczytaniu", async () => {
    fetchAdminUsers.mockResolvedValue({
      data: [osoba],
      meta: { current_page: 1, per_page: 25, total: 1, last_page: 1 },
    });
    render(<AdminUsersList />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Uczestniczki i uczestnicy" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Marta Kowalska")).toBeInTheDocument());
  });

  it("noga negatywna: ładowanie pokazuje LoadingState", () => {
    fetchAdminUsers.mockReturnValue(new Promise(() => {}));
    render(<AdminUsersList />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("noga negatywna: pusta lista pokazuje EmptyState zamiast tabeli", async () => {
    fetchAdminUsers.mockResolvedValue({ data: [], meta: undefined });
    render(<AdminUsersList />);

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Brak osób spełniających kryteria." }),
      ).toBeInTheDocument(),
    );
  });

  it("noga negatywna: błąd serwera pokazuje ErrorState z przyciskiem ponowienia", async () => {
    fetchAdminUsers.mockRejectedValue(new ApiError(500, "server_error", "Lista osób niedostępna."));
    render(<AdminUsersList />);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Lista osób niedostępna."),
    );
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeInTheDocument();
  });

  it("noga negatywna: 403 pokazuje odmowę zamiast błędu serwera", async () => {
    fetchAdminUsers.mockRejectedValue(new ApiError(403, "forbidden", "Brak uprawnień."));
    render(<AdminUsersList />);

    await waitFor(() => expect(screen.getByText("Brak dostępu")).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
