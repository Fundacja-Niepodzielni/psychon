import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Poz. 27 — pola „Od"/„Do" na ekranie raportu (H20). Kryterium: zestawienie
 * za wskazany okres, bez zmiany domyślnego zachowania (brak zakresu).
 */

const fetchReport = vi.fn();
const downloadReportCsv = vi.fn();

class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

vi.mock("@/lib/api", () => ({
  fetchReport: (...args: unknown[]) => fetchReport(...args),
  downloadReportCsv: (...args: unknown[]) => downloadReportCsv(...args),
  ApiError,
}));

const { default: ReportView } = await import("@/components/h20/ReportView");

const raport = {
  summary: {
    admitted: 5,
    active: 3,
    completed: 1,
    hours_accepted_total: "113.5",
    hours_accepted_average: "37.8",
    consultations_total: 101,
    certificates_issued: 1,
  },
  people: [],
};

beforeEach(() => {
  fetchReport.mockReset();
  downloadReportCsv.mockReset();
});

describe("ReportView — poz. 27 zakres dat", () => {
  it("domyślnie (bez wpisanego zakresu) fetchReport wywoływany bez from/to", async () => {
    fetchReport.mockResolvedValue(raport);
    render(<ReportView />);

    await waitFor(() => expect(fetchReport).toHaveBeenCalledTimes(1));
    expect(fetchReport).toHaveBeenLastCalledWith({});
  });

  it("filtr: wysłanie formularza z wypełnionymi polami przekazuje from/to do fetchReport", async () => {
    fetchReport.mockResolvedValue(raport);
    render(<ReportView />);

    await waitFor(() => expect(fetchReport).toHaveBeenCalledTimes(1));

    await userEvent.type(screen.getByLabelText("Od"), "2026-01-01");
    await userEvent.type(screen.getByLabelText("Do"), "2026-01-31");
    await userEvent.click(screen.getByRole("button", { name: "Filtruj" }));

    await waitFor(() => expect(fetchReport).toHaveBeenCalledTimes(2));
    expect(fetchReport).toHaveBeenLastCalledWith({ from: "2026-01-01", to: "2026-01-31" });
  });

  it("filtr: wysłanie pustego formularza po wcześniejszym zakresie znów nie przekazuje from/to", async () => {
    fetchReport.mockResolvedValue(raport);
    render(<ReportView />);

    await waitFor(() => expect(fetchReport).toHaveBeenCalledTimes(1));

    await userEvent.type(screen.getByLabelText("Od"), "2026-01-01");
    await userEvent.click(screen.getByRole("button", { name: "Filtruj" }));
    await waitFor(() => expect(fetchReport).toHaveBeenCalledTimes(2));

    await userEvent.clear(screen.getByLabelText("Od"));
    await userEvent.click(screen.getByRole("button", { name: "Filtruj" }));

    await waitFor(() => expect(fetchReport).toHaveBeenCalledTimes(3));
    expect(fetchReport).toHaveBeenLastCalledWith({ from: undefined, to: undefined });
  });

  it("eksport CSV przekazuje zastosowany zakres do downloadReportCsv", async () => {
    fetchReport.mockResolvedValue(raport);
    downloadReportCsv.mockResolvedValue(undefined);
    render(<ReportView />);

    await waitFor(() => expect(fetchReport).toHaveBeenCalledTimes(1));

    await userEvent.type(screen.getByLabelText("Od"), "2026-02-01");
    await userEvent.click(screen.getByRole("button", { name: "Filtruj" }));
    await waitFor(() => expect(fetchReport).toHaveBeenCalledTimes(2));

    await userEvent.click(screen.getByRole("button", { name: "Eksport CSV" }));

    await waitFor(() => expect(downloadReportCsv).toHaveBeenCalledTimes(1));
    expect(downloadReportCsv).toHaveBeenLastCalledWith({ from: "2026-02-01", to: undefined });
  });
});
