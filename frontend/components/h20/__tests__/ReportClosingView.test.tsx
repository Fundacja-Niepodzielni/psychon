import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Zakładka „raport zamknięcia edycji" (H20, nowy kontrakt
 * `GET /admin/reports/closing?edition=<id>`): renderuje się z danymi
 * konkretnej edycji, domyślnie edycji aktywnej (`GET /admin/edition`,
 * trasa H19 już istniejąca — patrz komentarz w `ReportClosingView.tsx`).
 */

const api = vi.fn();
const fetchClosingReport = vi.fn();

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
  api: (...args: unknown[]) => api(...args),
  ApiError,
}));

vi.mock("@/lib/api/raport", () => ({
  fetchClosingReport: (...args: unknown[]) => fetchClosingReport(...args),
}));

const { default: ReportClosingView } = await import("@/components/h20/ReportClosingView");

const zamkniecie = {
  edition: { id: 3, name: "Edycja jesień 2026", ends_at: "2026-12-31" },
  summary: { total: 4, certified: 1, not_certified: 3 },
  people: [
    {
      id: 1,
      first_name: "Marta",
      last_name: "Demo",
      role: "volunteer",
      stage: "certyfikat",
      stage_label: "Certyfikat",
      certificate_issued: true,
    },
    {
      id: 2,
      first_name: "Ola",
      last_name: "Demo",
      role: "student",
      stage: "warsztat",
      stage_label: "Warsztat stacjonarny",
      certificate_issued: false,
    },
  ],
};

beforeEach(() => {
  api.mockReset();
  fetchClosingReport.mockReset();
});

describe("ReportClosingView — renderuje się z danymi", () => {
  it("pobiera aktywną edycję, a potem raport jej zamknięcia, i pokazuje liczby oraz osoby", async () => {
    api.mockResolvedValue({ id: 3 });
    fetchClosingReport.mockResolvedValue(zamkniecie);

    render(<ReportClosingView />);

    await waitFor(() => expect(api).toHaveBeenCalledWith("/admin/edition"));
    await waitFor(() => expect(fetchClosingReport).toHaveBeenCalledWith(3));

    expect(await screen.findByText("Edycja jesień 2026")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument(); // total
    expect(screen.getByText("Marta Demo")).toBeInTheDocument();
    expect(screen.getByText("Ola Demo")).toBeInTheDocument();
  });

  // Kolumna „Etap" jest wspólna z ReportView (patrz `components/h20/kolumny-osoby.tsx`);
  // sprawdzana tu wprost, żeby zmiana w tym wspólnym miejscu nie mogła przejść
  // niezauważona tylko dlatego, że drugi ekran akurat by ją złapał.
  it("etap każdej osoby pokazuje etykietę stage_label z backendu, nie tylko sam Badge", async () => {
    api.mockResolvedValue({ id: 3 });
    fetchClosingReport.mockResolvedValue(zamkniecie);

    render(<ReportClosingView />);

    const wierszMarty = (await screen.findByText("Marta Demo")).closest("tr");
    const wierszOli = (await screen.findByText("Ola Demo")).closest("tr");
    expect(wierszMarty).not.toBeNull();
    expect(wierszOli).not.toBeNull();

    expect(within(wierszMarty as HTMLElement).getByText("Certyfikat")).toBeInTheDocument();
    expect(
      within(wierszOli as HTMLElement).getByText("Warsztat stacjonarny"),
    ).toBeInTheDocument();
  });

  it("zmiana numeru edycji i zatwierdzenie formularza pobiera raport zamknięcia dla wskazanej edycji", async () => {
    api.mockResolvedValue({ id: 3 });
    fetchClosingReport.mockResolvedValue(zamkniecie);

    render(<ReportClosingView />);

    await waitFor(() => expect(fetchClosingReport).toHaveBeenCalledWith(3));

    fetchClosingReport.mockResolvedValueOnce({
      ...zamkniecie,
      edition: { id: 2, name: "Edycja wiosna 2026", ends_at: "2026-06-30" },
    });

    const pole = screen.getByLabelText("Numer edycji");
    await userEvent.clear(pole);
    await userEvent.type(pole, "2");
    await userEvent.click(screen.getByRole("button", { name: "Pokaż" }));

    await waitFor(() => expect(fetchClosingReport).toHaveBeenLastCalledWith(2));
    expect(await screen.findByText("Edycja wiosna 2026")).toBeInTheDocument();
  });

  it("pusta lista osób pokazuje stan pusty tabeli", async () => {
    api.mockResolvedValue({ id: 3 });
    fetchClosingReport.mockResolvedValue({ ...zamkniecie, summary: { total: 0, certified: 0, not_certified: 0 }, people: [] });

    render(<ReportClosingView />);

    expect(
      await screen.findByText(
        "Wiersze pojawią się tutaj, gdy edycja będzie miała osoby do zestawienia.",
      ),
    ).toBeInTheDocument();
  });

  // Kontrola negatywna (ręczna, opisana w PR): usunięcie drugiego `useEffect`
  // (ten, który woła `fetchClosingReport`) w `ReportClosingView.tsx` psuje
  // wszystkie trzy testy tego bloku — żaden nie doczeka się danych raportu.
});
