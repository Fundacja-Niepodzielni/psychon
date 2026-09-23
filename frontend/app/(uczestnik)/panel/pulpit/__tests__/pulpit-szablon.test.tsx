import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * Świadek pulpitu uczestnika (`/panel/pulpit`) po przepięciu na
 * `PageTemplate` — ten sam szablon co `/panel/start`. Mierzy nagłówek z
 * `PageHeader` (powitanie imieniem) i stan błędu/ładowania na jednym API
 * (`/me`, `/courses`), nie zadania sieciowe.
 */

const api = vi.fn();
const apiPaged = vi.fn();

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

vi.mock("@/lib/api", () => ({
  api: (...args: unknown[]) => api(...args),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
  ApiError,
}));

const { default: PulpitPage } = await import("@/app/(uczestnik)/panel/pulpit/page");

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
});

describe("PulpitPage", () => {
  it("nagłówek H1 pochodzi z PageHeader i wita imieniem po wczytaniu (rola student, bez superwizji)", async () => {
    api.mockImplementation((url: string) => {
      if (url === "/me") return Promise.resolve({ first_name: "Zosia", role: "student" });
      if (url === "/courses") return Promise.resolve([]);
      return Promise.reject(new Error(`nieoczekiwane wywołanie: ${url}`));
    });

    render(<PulpitPage />);

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 1, name: "Dzień dobry, Zosia" }),
      ).toBeInTheDocument(),
    );
    expect(apiPaged).not.toHaveBeenCalled();
  });

  it("noga negatywna: błąd wczytywania pokazuje Alert z przyciskiem ponowienia pod tym samym nagłówkiem", async () => {
    api.mockRejectedValue(new ApiError(500, "Pulpit niedostępny."));
    render(<PulpitPage />);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Pulpit niedostępny."));
    expect(screen.getByRole("heading", { level: 1, name: "Pulpit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeInTheDocument();
  });
});
