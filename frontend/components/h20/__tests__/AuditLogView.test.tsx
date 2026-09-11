import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * Świadek dziennika działań (H20) po przepięciu na `ListTemplate` +
 * `useZasobStronicowany` (C2 wariant C, partia P1). Cztery nogi negatywne —
 * ładowanie, błąd, pusta lista, 403 — obok jednej nogi pozytywnej.
 */

const fetchAuditLog = vi.fn();
const downloadAuditLogCsv = vi.fn();

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

const AUDIT_ACTIONS = ["application.accepted", "internship.accepted"] as const;

vi.mock("@/lib/api", () => ({
  fetchAuditLog: (...args: unknown[]) => fetchAuditLog(...args),
  downloadAuditLogCsv: (...args: unknown[]) => downloadAuditLogCsv(...args),
  AUDIT_ACTIONS,
  ApiError,
}));

const { default: AuditLogView } = await import("@/components/h20/AuditLogView");

const wpis = {
  id: 7,
  action: "internship.accepted",
  actor: { id: 1, first_name: "Ola", last_name: "Nowak" },
  subject_type: "internship_entry",
  subject_id: 12,
  details: null,
  created_at: "2026-01-05T10:00:00Z",
};

beforeEach(() => {
  fetchAuditLog.mockReset();
  downloadAuditLogCsv.mockReset();
});

describe("AuditLogView", () => {
  it("nagłówek pochodzi z PageHeader, tabela pokazuje zdarzenie po wczytaniu", async () => {
    fetchAuditLog.mockResolvedValue({
      data: [wpis],
      meta: { current_page: 1, per_page: 25, total: 1, last_page: 1 },
    });
    render(<AuditLogView />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Dziennik działań" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Ola Nowak")).toBeInTheDocument());
  });

  it("noga negatywna: ładowanie pokazuje LoadingState", () => {
    fetchAuditLog.mockReturnValue(new Promise(() => {}));
    render(<AuditLogView />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("noga negatywna: pusta lista pokazuje EmptyState zamiast tabeli", async () => {
    fetchAuditLog.mockResolvedValue({ data: [], meta: undefined });
    render(<AuditLogView />);

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Brak zdarzeń spełniających kryteria." }),
      ).toBeInTheDocument(),
    );
  });

  it("noga negatywna: błąd serwera pokazuje ErrorState z przyciskiem ponowienia", async () => {
    fetchAuditLog.mockRejectedValue(new ApiError(500, "server_error", "Dziennik niedostępny."));
    render(<AuditLogView />);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Dziennik niedostępny."),
    );
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeInTheDocument();
  });

  it("noga negatywna: 403 pokazuje odmowę zamiast błędu serwera", async () => {
    fetchAuditLog.mockRejectedValue(new ApiError(403, "forbidden", "Brak uprawnień."));
    render(<AuditLogView />);

    await waitFor(() => expect(screen.getByText("Brak dostępu")).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
