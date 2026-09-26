import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Ekran raportu (H20, nowy kontrakt `GET /admin/reports`): etap każdej
 * osoby, zaliczone testy jako osobna liczba i zakres dat. Eksport CSV
 * zostaje na starej trasie H20 (`lib/api/h20.ts` przez barrel `@/lib/api`)
 * — patrz komentarz w `ReportView.tsx`. Zgodność kafelków z kopertą
 * zaplecza i brak odnośników udających filtr: `ReportView-zaplecze.test.tsx`.
 */

const fetchReports = vi.fn();
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
  downloadReportCsv: (...args: unknown[]) => downloadReportCsv(...args),
  ApiError,
}));

vi.mock("@/lib/api/raport", () => ({
  fetchReports: (...args: unknown[]) => fetchReports(...args),
}));

const { default: ReportView } = await import("@/components/h20/ReportView");

/** Wartość kafelka podsumowania o danym tytule (akapit tuż pod tytułem). */
async function wartoscKafelka(tytul: string): Promise<string> {
  const naglowek = await screen.findByText(tytul, { selector: "p" });
  return naglowek.nextElementSibling?.textContent ?? "";
}

const osoba = (over: Partial<Record<string, unknown>>) => ({
  id: 1,
  first_name: "Marta",
  last_name: "Demo",
  role: "volunteer",
  status: "active",
  stage: "kurs",
  stage_label: "Kursy i testy",
  tests_passed: 0,
  hours_accepted: "0",
  consultations: 0,
  certificate_issued: false,
  ...over,
});

const raport = {
  summary: {
    admitted: 5,
    active: 3,
    completed: 1,
    certificates_issued: 1,
    people_with_passed_test: 2,
    hours_accepted_total: "113.5",
    consultations_total: 101,
  },
  people: [],
};

beforeEach(() => {
  fetchReports.mockReset();
  downloadReportCsv.mockReset();
});

describe("ReportView — zakres dat", () => {
  it("domyślnie (bez wpisanego zakresu) fetchReports wywoływany bez from/to", async () => {
    fetchReports.mockResolvedValue(raport);
    render(<ReportView />);

    await waitFor(() => expect(fetchReports).toHaveBeenCalledTimes(1));
    expect(fetchReports).toHaveBeenLastCalledWith({});
  });

  it("filtr: wysłanie formularza z wypełnionymi polami przekazuje from/to do fetchReports i zmienia liczby", async () => {
    fetchReports.mockResolvedValueOnce(raport).mockResolvedValueOnce({
      ...raport,
      summary: { ...raport.summary, admitted: 9, active: 7 },
    });
    render(<ReportView />);

    await waitFor(() => expect(fetchReports).toHaveBeenCalledTimes(1));
    await waitFor(async () => expect(await wartoscKafelka("Osoby przyjęte")).toBe("5"));

    await userEvent.type(screen.getByLabelText("Od"), "2026-01-01");
    await userEvent.type(screen.getByLabelText("Do"), "2026-01-31");
    await userEvent.click(screen.getByRole("button", { name: "Filtruj" }));

    await waitFor(() => expect(fetchReports).toHaveBeenCalledTimes(2));
    expect(fetchReports).toHaveBeenLastCalledWith({ from: "2026-01-01", to: "2026-01-31" });
    await waitFor(async () => expect(await wartoscKafelka("Osoby przyjęte")).toBe("9"));
  });

  it("filtr: wysłanie pustego formularza po wcześniejszym zakresie znów nie przekazuje from/to", async () => {
    fetchReports.mockResolvedValue(raport);
    render(<ReportView />);

    await waitFor(() => expect(fetchReports).toHaveBeenCalledTimes(1));

    await userEvent.type(screen.getByLabelText("Od"), "2026-01-01");
    await userEvent.click(screen.getByRole("button", { name: "Filtruj" }));
    await waitFor(() => expect(fetchReports).toHaveBeenCalledTimes(2));

    await userEvent.clear(screen.getByLabelText("Od"));
    await userEvent.click(screen.getByRole("button", { name: "Filtruj" }));

    await waitFor(() => expect(fetchReports).toHaveBeenCalledTimes(3));
    expect(fetchReports).toHaveBeenLastCalledWith({ from: undefined, to: undefined });
  });

  it("eksport CSV przekazuje zastosowany zakres do downloadReportCsv", async () => {
    fetchReports.mockResolvedValue(raport);
    downloadReportCsv.mockResolvedValue(undefined);
    render(<ReportView />);

    await waitFor(() => expect(fetchReports).toHaveBeenCalledTimes(1));

    await userEvent.type(screen.getByLabelText("Od"), "2026-02-01");
    await userEvent.click(screen.getByRole("button", { name: "Filtruj" }));
    await waitFor(() => expect(fetchReports).toHaveBeenCalledTimes(2));

    await userEvent.click(screen.getByRole("button", { name: "Eksport CSV" }));

    await waitFor(() => expect(downloadReportCsv).toHaveBeenCalledTimes(1));
    expect(downloadReportCsv).toHaveBeenLastCalledWith({ from: "2026-02-01", to: undefined });
  });

  // Kontrola negatywna (ręczna, opisana w PR): zamiana `applied` na stały `{}`
  // w wywołaniu `fetchReports` w `ReportView.tsx` psuje test drugi ("zmienia
  // liczby") i test czwarty (CSV) — oba oczekują innego argumentu niż `{}`.
});

/**
 * Raport pokazuje etap każdej osoby ORAZ osobno zaliczone testy — dwie
 * różne liczby dla tej samej osoby, nie zwinięte w jedną (★ kryterium).
 */
describe("ReportView — etap i zaliczone testy jako osobna liczba", () => {
  it("tabela pokazuje etap i osobno liczbę zaliczonych testów dla każdej osoby", async () => {
    fetchReports.mockResolvedValue({
      ...raport,
      people: [
        osoba({
          id: 1,
          first_name: "Marta",
          last_name: "Demo",
          hours_accepted: "41.5",
          consultations: 37,
          certificate_issued: false,
          stage: "kurs",
          stage_label: "Kursy i testy",
          tests_passed: 2,
        }),
        osoba({
          id: 2,
          first_name: "Ola",
          last_name: "Demo",
          hours_accepted: "72",
          consultations: 64,
          certificate_issued: true,
          stage: "certyfikat",
          stage_label: "Certyfikat",
          tests_passed: 6,
        }),
      ],
    });
    render(<ReportView />);

    const wierszMarty = (await screen.findByText("Marta Demo")).closest("tr");
    const wierszOli = (await screen.findByText("Ola Demo")).closest("tr");
    expect(wierszMarty).not.toBeNull();
    expect(wierszOli).not.toBeNull();

    // `Certyfikat` w wierszu Oli to etap (Badge), nie mylić z nagłówkiem
    // kolumny „Certyfikat" (stan wydania) — stąd zapytanie zawężone do wiersza.
    expect(within(wierszMarty as HTMLElement).getByText("Kursy i testy")).toBeInTheDocument();
    expect(within(wierszOli as HTMLElement).getByText("Certyfikat")).toBeInTheDocument();

    // Etap i liczba zaliczonych testów to DWIE różne komórki tego samego wiersza.
    expect(within(wierszMarty as HTMLElement).getByText("2")).toBeInTheDocument();
    expect(within(wierszOli as HTMLElement).getByText("6")).toBeInTheDocument();
  });

  it("kafelek Zaliczone testy pokazuje liczbę osób z backendu, niezależną od kafelka etapów", async () => {
    fetchReports.mockResolvedValue({
      ...raport,
      summary: { ...raport.summary, completed: 1, people_with_passed_test: 4 },
      people: [],
    });
    render(<ReportView />);

    expect(await wartoscKafelka("Programy ukończone")).toBe("1");
    expect(await wartoscKafelka("Zaliczone testy")).toBe("4");
  });

  it("pusta lista osób pokazuje istniejący stan pusty tabeli (bez etapu i testów do wyświetlenia)", async () => {
    fetchReports.mockResolvedValue(raport); // people: []
    render(<ReportView />);

    expect(
      await screen.findByText(
        "Wiersze pojawią się tutaj, gdy w systemie będą konta wolontariuszy lub studentów.",
      ),
    ).toBeInTheDocument();
  });

  // Kontrola negatywna (ręczna, opisana w PR): scalenie kolumny „Zaliczone
  // testy" z kolumną „Etap" (usunięcie osobnej kolumny w `ReportView.tsx`)
  // psuje pierwszy test tego bloku — „2" i „6" przestają być odnajdywalne
  // jako osobne komórki wiersza.
});
