import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Świadek kolejki akceptacji stażu (H11) po przepięciu na `ListTemplate` +
 * `useZasobStronicowany` (C2 wariant C, partia P1). Cztery nogi negatywne —
 * ładowanie, błąd, pusta lista, 403 — obok nogi pozytywnej i akceptacji wpisu.
 */

const api = vi.fn();
const apiPaged = vi.fn();

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
  api: (...args: unknown[]) => api(...args),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
  ApiError,
}));

const { default: AdminInternshipQueue } = await import("@/components/h11/AdminInternshipQueue");

const wpis = {
  id: 9,
  date: "2026-01-05",
  hours: "2.5",
  form: "phone_duty" as const,
  consultations_count: 3,
  description: "Dyżur telefoniczny w poniedziałek.",
  status: "submitted" as const,
  review_comment: null,
  decided_at: null,
  created_at: "2026-01-05T10:00:00Z",
  updated_at: "2026-01-05T10:00:00Z",
  user: { id: 4, first_name: "Kasia", last_name: "Wolna" },
};

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
});

describe("AdminInternshipQueue", () => {
  it("nagłówek pochodzi z PageHeader, karta pokazuje wpis po wczytaniu", async () => {
    apiPaged.mockResolvedValue({
      data: [wpis],
      meta: { current_page: 1, per_page: 25, total: 1, last_page: 1 },
    });
    render(<AdminInternshipQueue />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Akceptacja stażu" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Kasia Wolna")).toBeInTheDocument());
  });

  it("noga negatywna: ładowanie pokazuje LoadingState", () => {
    apiPaged.mockReturnValue(new Promise(() => {}));
    render(<AdminInternshipQueue />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("noga negatywna: pusta lista pokazuje EmptyState zamiast kart", async () => {
    apiPaged.mockResolvedValue({ data: [], meta: undefined });
    render(<AdminInternshipQueue />);

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Brak wpisów oczekujących na decyzję." }),
      ).toBeInTheDocument(),
    );
  });

  it("noga negatywna: błąd serwera pokazuje ErrorState z przyciskiem ponowienia", async () => {
    apiPaged.mockRejectedValue(new ApiError(500, "server_error", "Kolejka niedostępna."));
    render(<AdminInternshipQueue />);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Kolejka niedostępna."),
    );
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeInTheDocument();
  });

  it("noga negatywna: 403 pokazuje odmowę zamiast błędu serwera", async () => {
    apiPaged.mockRejectedValue(new ApiError(403, "forbidden", "Brak uprawnień."));
    render(<AdminInternshipQueue />);

    await waitFor(() => expect(screen.getByText("Brak dostępu")).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("akceptacja wpisu usuwa go z listy bez ponownego pobrania strony", async () => {
    apiPaged.mockResolvedValue({
      data: [wpis],
      meta: { current_page: 1, per_page: 25, total: 1, last_page: 1 },
    });
    api.mockResolvedValue(wpis);
    render(<AdminInternshipQueue />);

    await waitFor(() => expect(screen.getByText("Kasia Wolna")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Akceptuj wpis" }));

    await waitFor(() => expect(screen.getByText("Wpis został zaakceptowany.")).toBeInTheDocument());
    expect(screen.queryByText("Kasia Wolna")).not.toBeInTheDocument();
    expect(apiPaged).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith("/admin/internship/9/accept", { method: "POST" });
  });
});
