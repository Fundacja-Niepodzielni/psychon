import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Swiadek pulpitu administracji (pierwszy ekran po zalogowaniu dla
 * project_manager/super_admin, `lib/home-by-role.ts`) po przepieciu na
 * `PageTemplate` — ten sam szablon co `/panel/start`. Mierzy naglowek z
 * `PageHeader` i trzy stany na jednym API (`/admin/dashboard`), nie zadania
 * sieciowe.
 */

const api = vi.fn();

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

vi.mock("@/lib/api", () => ({
  api: (...args: unknown[]) => api(...args),
  ApiError,
}));

const { default: AdminHomePage } = await import("@/app/(administracja)/admin/page");

const dashboard = {
  counters: { participants: 12, completed: 4, certificates: 3 },
  queues: [{ key: "applications", count: 5, link: "/admin/uczestniczki" }],
};

beforeEach(() => {
  api.mockReset();
});

describe("AdminHomePage", () => {
  it("naglowek H1 pochodzi z PageHeader i liczniki pokazuja dane po wczytaniu", async () => {
    api.mockResolvedValue(dashboard);
    render(<AdminHomePage />);

    expect(screen.getByRole("heading", { level: 1, name: "Pulpit" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("12")).toBeInTheDocument());
    expect(screen.getByText("Zgłoszenia rekrutacyjne")).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith("/admin/dashboard");
  });

  it("noga negatywna: blad serwera pokazuje ErrorState z przyciskiem ponowienia", async () => {
    api.mockRejectedValue(new ApiError(500, "Pulpit niedostepny."));
    render(<AdminHomePage />);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Pulpit niedostepny."));
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeInTheDocument();
  });

  it("ponowienie po bledzie wywoluje kolejne wywolanie /admin/dashboard", async () => {
    api.mockRejectedValueOnce(new ApiError(500, "Pulpit niedostepny."));
    api.mockResolvedValueOnce(dashboard);
    render(<AdminHomePage />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));

    await waitFor(() => expect(screen.getByText("12")).toBeInTheDocument());
    expect(api).toHaveBeenCalledTimes(2);
  });
});
