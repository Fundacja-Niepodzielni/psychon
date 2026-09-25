import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Ekran raportu (H20, nowy kontrakt `GET /admin/reports`): etap każdej
 * osoby, zaliczone testy jako osobna liczba, zakres dat i odnośnik od
 * każdej liczby-kafelka do listy osób z filtrem, który dokładnie tę
 * liczbę daje. Eksport CSV zostaje na starej trasie H20 (`lib/api/h20.ts`
 * przez barrel `@/lib/api`) — patrz komentarz w `ReportView.tsx`.
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
    tests_passed: 2,
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
    expect(await screen.findByTitle("Wszystkie osoby przyjęte — lista osób")).toHaveTextContent(
      "5",
    );

    await userEvent.type(screen.getByLabelText("Od"), "2026-01-01");
    await userEvent.type(screen.getByLabelText("Do"), "2026-01-31");
    await userEvent.click(screen.getByRole("button", { name: "Filtruj" }));

    await waitFor(() => expect(fetchReports).toHaveBeenCalledTimes(2));
    expect(fetchReports).toHaveBeenLastCalledWith({ from: "2026-01-01", to: "2026-01-31" });
    await waitFor(() =>
      expect(screen.getByTitle("Wszystkie osoby przyjęte — lista osób")).toHaveTextContent("9"),
    );
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
      summary: { ...raport.summary, completed: 1, tests_passed: 4 },
      people: [],
    });
    render(<ReportView />);

    expect(await screen.findByTitle("Programy ukończone — lista osób")).toHaveTextContent("1");
    expect(screen.getByTitle("Osoby z zaliczonym testem — lista osób")).toHaveTextContent("4");
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

/**
 * Odnośnik od każdej liczby-kafelka do listy osób z filtrem, który
 * dokładnie tę liczbę daje. Sprawdzany jest FILTR w adresie docelowym
 * (query zbudowane niezależnie od `ODNOSNIKI_LICZB`, na podstawie surowych
 * danych `people`), a nie samo istnienie odnośnika.
 */
describe("ReportView — odnośnik od liczby do źródła", () => {
  const people = [
    osoba({ id: 1, status: "active", stage: "kurs", certificate_issued: false, tests_passed: 0 }),
    osoba({ id: 2, status: "active", stage: "gotowa", certificate_issued: false, tests_passed: 3 }),
    osoba({ id: 3, status: "blocked", stage: "certyfikat", certificate_issued: true, tests_passed: 5 }),
    osoba({ id: 4, status: "active", stage: "warsztat", certificate_issued: false, tests_passed: 0 }),
  ];

  // Filtry przepisane NIEZALEŻNIE od `lib/h20/raportOdnosniki.ts` — test
  // sprawdza, że adres docelowy i wyświetlana liczba są ze sobą zgodne,
  // a nie że komponent zgadza się sam ze sobą.
  const filtryNiezalezne: Record<string, (o: (typeof people)[number]) => boolean> = {
    "": () => true,
    "status=active": (o) => o.status === "active",
    "etap=ukonczony": (o) => o.stage === "gotowa" || o.stage === "certyfikat",
    "certyfikat=1": (o) => o.certificate_issued,
    "testy=zaliczone": (o) => o.tests_passed > 0,
  };

  const kafelki: Array<{ tytul: string; query: string; oczekiwanaLiczba: number }> = [
    { tytul: "Wszystkie osoby przyjęte", query: "", oczekiwanaLiczba: 4 },
    { tytul: "Osoby aktywne", query: "status=active", oczekiwanaLiczba: 3 },
    { tytul: "Programy ukończone", query: "etap=ukonczony", oczekiwanaLiczba: 2 },
    { tytul: "Certyfikaty wydane", query: "certyfikat=1", oczekiwanaLiczba: 1 },
    { tytul: "Osoby z zaliczonym testem", query: "testy=zaliczone", oczekiwanaLiczba: 2 },
  ];

  it.each(kafelki)(
    "kafelek $tytul prowadzi do adresu z filtrem, który daje dokładnie tę liczbę",
    async ({ tytul, query, oczekiwanaLiczba }) => {
      fetchReports.mockResolvedValue({
        summary: {
          admitted: 4,
          active: 3,
          completed: 2,
          certificates_issued: 1,
          tests_passed: 2,
          hours_accepted_total: "0",
          consultations_total: 0,
        },
        people,
      });
      render(<ReportView />);

      const link = (await screen.findByTitle(`${tytul} — lista osób`)) as HTMLAnchorElement;
      const href = link.getAttribute("href") ?? "";
      expect(href.startsWith("/admin/uczestniczki")).toBe(true);

      const oczekiwanaSciezka = query ? `/admin/uczestniczki?${query}` : "/admin/uczestniczki";
      expect(href).toBe(oczekiwanaSciezka);

      // Filtr z adresu, zastosowany niezależnie do surowych danych, daje
      // dokładnie tyle, ile pokazuje kafelek.
      const zFiltra = people.filter(filtryNiezalezne[query]).length;
      expect(zFiltra).toBe(oczekiwanaLiczba);
      expect(link).toHaveTextContent(String(oczekiwanaLiczba));
    },
  );

  // Kontrola negatywna (ręczna, opisana w PR): zamiana query „status=active"
  // na „status=blocked" dla kafelka „Osoby aktywne" w
  // `lib/h20/raportOdnosniki.ts` psuje test dla tego wiersza tabeli
  // parametryzowanej (href przestaje zgadzać się z `oczekiwanaSciezka`,
  // a niezależnie policzony filtr przestaje dawać `oczekiwanaLiczba`).
});
