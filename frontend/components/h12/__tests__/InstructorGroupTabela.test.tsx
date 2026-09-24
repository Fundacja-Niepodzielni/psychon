import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

/**
 * Świadek ekranu prowadzącego „Moja grupa" (`InstructorGroup`) — dziś bez
 * żadnej próby na poziomie ekranu. Ten plik świadczy o tabeli uczestników
 * (pięć wartości na osobę: imię i nazwisko, kursy done/total, staż w
 * godzinach, liczba superwizji, odznaka warsztatu) oraz o trzech stanach
 * ekranu (ładowanie / błąd wczytania / grupa pusta).
 *
 * Każda wartość jest sprawdzana WEWNĄTRZ wiersza tej osoby (`within(wiersz)`),
 * nie w całym dokumencie — inaczej próba pytałaby o obecność tekstu
 * gdziekolwiek na stronie, a nie o to, co widać PRZY TEJ OSOBIE.
 *
 * Klient API jest zaślepiony (`vi.mock`), bo mierzymy EKRAN, nie sieć.
 * `H07ReliabilitySlot` (sekcja „Rzetelność nauki") woła ten sam moduł
 * (`apiPaged`), więc dostaje domyślną pustą odpowiedź w `beforeEach`, żeby
 * jej własny fetch nie wisiał nierozstrzygnięty i nie zaśmiecał wyników.
 */

const api = vi.fn();
const apiPaged = vi.fn();
const createInstructorCase = vi.fn();

class ApiError extends Error {
  status: number;
  code: string;
  errors?: Record<string, string[]>;

  constructor(status: number, code: string, message: string, errors?: Record<string, string[]>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

vi.mock("@/lib/api", () => ({
  api: (...args: unknown[]) => api(...args),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
  createInstructorCase: (...args: unknown[]) => createInstructorCase(...args),
  ApiError,
}));

const { default: InstructorGroup } = await import("@/components/h12/InstructorGroup");

interface CzlonekOverrides {
  id?: number;
  first_name?: string;
  last_name?: string;
  progress?: Partial<{
    courses_done: number;
    courses_total: number;
    hours_accepted: string;
    supervision_present: number;
    workshop_done: boolean;
  }>;
}

function czlonek(overrides: CzlonekOverrides = {}) {
  return {
    id: overrides.id ?? 1,
    first_name: overrides.first_name ?? "Bazowa",
    last_name: overrides.last_name ?? "Osoba",
    progress: {
      courses_done: 1,
      courses_total: 4,
      hours_accepted: "10",
      supervision_present: 2,
      workshop_done: false,
      ...overrides.progress,
    },
  };
}

function grupa(members: ReturnType<typeof czlonek>[], slots: unknown[] = []) {
  return { members, slots };
}

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
  createInstructorCase.mockReset();
  // H07ReliabilitySlot woła apiPaged("/instructor/reliability") niezależnie
  // od tego, co testujemy — odpowiedź pusta, żeby nie zostawiać wiszącej
  // obietnicy i nie dorzucać treści niezwiązanej z tabelą uczestników.
  apiPaged.mockResolvedValue({ data: [] });
});

describe("InstructorGroup — pięć wartości w wierszu uczestnika (G1)", () => {
  it("pokazuje imię i nazwisko uczestnika we własnym wierszu", async () => {
    const decoy = czlonek({ id: 1, first_name: "Ola", last_name: "Wiśniewska" });
    const target = czlonek({ id: 2, first_name: "Marta", last_name: "Zielona" });
    api.mockResolvedValueOnce(grupa([decoy, target]));
    render(<InstructorGroup />);

    await screen.findByRole("table");
    const wierszTarget = screen.getAllByRole("row")[2];
    expect(within(wierszTarget).getByText("Marta Zielona")).toBeInTheDocument();
    expect(within(wierszTarget).queryByText("Ola Wiśniewska")).not.toBeInTheDocument();
  });

  it("pokazuje postęp kursów jako done/total we własnym wierszu", async () => {
    const decoy = czlonek({ id: 1, progress: { courses_done: 1, courses_total: 4 } });
    const target = czlonek({ id: 2, progress: { courses_done: 3, courses_total: 9 } });
    api.mockResolvedValueOnce(grupa([decoy, target]));
    render(<InstructorGroup />);

    await screen.findByRole("table");
    const wierszTarget = screen.getAllByRole("row")[2];
    expect(within(wierszTarget).getByText("3 / 9")).toBeInTheDocument();
    expect(within(wierszTarget).queryByText("1 / 4")).not.toBeInTheDocument();
  });

  it("pokazuje staż w godzinach we własnym wierszu", async () => {
    const decoy = czlonek({ id: 1, progress: { hours_accepted: "10" } });
    const target = czlonek({ id: 2, progress: { hours_accepted: "57" } });
    api.mockResolvedValueOnce(grupa([decoy, target]));
    render(<InstructorGroup />);

    await screen.findByRole("table");
    const wierszTarget = screen.getAllByRole("row")[2];
    expect(within(wierszTarget).getByText("57 h")).toBeInTheDocument();
    expect(within(wierszTarget).queryByText("10 h")).not.toBeInTheDocument();
  });

  it("pokazuje liczbę superwizji we własnym wierszu", async () => {
    const decoy = czlonek({ id: 1, progress: { supervision_present: 2 } });
    const target = czlonek({ id: 2, progress: { supervision_present: 6 } });
    api.mockResolvedValueOnce(grupa([decoy, target]));
    render(<InstructorGroup />);

    await screen.findByRole("table");
    const wierszTarget = screen.getAllByRole("row")[2];
    expect(within(wierszTarget).getByText("6", { exact: true })).toBeInTheDocument();
    expect(within(wierszTarget).queryByText("2", { exact: true })).not.toBeInTheDocument();
  });

  it("pokazuje odznakę warsztatu zależną od workshop_done we własnym wierszu", async () => {
    const decoy = czlonek({ id: 1, progress: { workshop_done: false } });
    const target = czlonek({ id: 2, progress: { workshop_done: true } });
    api.mockResolvedValueOnce(grupa([decoy, target]));
    render(<InstructorGroup />);

    await screen.findByRole("table");
    const wierszUkonczony = screen.getAllByRole("row")[2];
    expect(within(wierszUkonczony).getByText("Ukończony")).toBeInTheDocument();
    expect(within(wierszUkonczony).queryByText("Nieukończony")).not.toBeInTheDocument();
  });

  it("KONTROLA NEGATYWNA: odznaka pokazuje 'Nieukończony', gdy workshop_done: false", async () => {
    // Bez tej nogi test wyżej byłby zielony także wtedy, gdyby odznaka
    // pokazywała ZAWSZE „Ukończony", niezależnie od danych z API.
    api.mockResolvedValueOnce(
      grupa([czlonek({ progress: { workshop_done: false } })]),
    );
    render(<InstructorGroup />);

    await screen.findByRole("table");
    const wierszNieukonczony = screen.getAllByRole("row")[1];
    expect(within(wierszNieukonczony).getByText("Nieukończony")).toBeInTheDocument();
    expect(within(wierszNieukonczony).queryByText("Ukończony")).not.toBeInTheDocument();
  });
});

describe("InstructorGroup — pasek postępu wiąże wiersz z paskiem osoby (G2)", () => {
  it("pasek postępu w kolumnie Kursy ma rolę i nazwę dostępną zgodną z liczbami tej osoby, we własnym wierszu", async () => {
    const decoy = czlonek({ id: 1, progress: { courses_done: 1, courses_total: 4 } });
    const target = czlonek({ id: 2, progress: { courses_done: 3, courses_total: 9 } });
    api.mockResolvedValueOnce(grupa([decoy, target]));
    render(<InstructorGroup />);

    await screen.findByRole("table");
    const wiersze = screen.getAllByRole("row");
    const wierszDecoy = wiersze[1];
    const wierszTarget = wiersze[2];

    expect(
      within(wierszTarget).getByRole("progressbar", { name: "Postęp kursów: 3 z 9" }),
    ).toBeInTheDocument();
    expect(
      within(wierszTarget).queryByRole("progressbar", { name: "Postęp kursów: 1 z 4" }),
    ).not.toBeInTheDocument();

    expect(
      within(wierszDecoy).getByRole("progressbar", { name: "Postęp kursów: 1 z 4" }),
    ).toBeInTheDocument();
    expect(
      within(wierszDecoy).queryByRole("progressbar", { name: "Postęp kursów: 3 z 9" }),
    ).not.toBeInTheDocument();
  });

  it("pasek postępu w kolumnie Kursy ma aria-valuenow policzone z done/total tej osoby, we własnym wierszu", async () => {
    const decoy = czlonek({ id: 1, progress: { courses_done: 1, courses_total: 4 } });
    const target = czlonek({ id: 2, progress: { courses_done: 3, courses_total: 9 } });
    api.mockResolvedValueOnce(grupa([decoy, target]));
    render(<InstructorGroup />);

    await screen.findByRole("table");
    const wiersze = screen.getAllByRole("row");
    const wierszDecoy = wiersze[1];
    const wierszTarget = wiersze[2];

    const pasekTarget = within(wierszTarget).getByRole("progressbar");
    expect(pasekTarget).toHaveAttribute("aria-valuenow", "33");
    expect(pasekTarget).not.toHaveAttribute("aria-valuenow", "25");

    const pasekDecoy = within(wierszDecoy).getByRole("progressbar");
    expect(pasekDecoy).toHaveAttribute("aria-valuenow", "25");
    expect(pasekDecoy).not.toHaveAttribute("aria-valuenow", "33");
  });
});

describe("InstructorGroup — para osoba↔etap wiązana wierszem, nie kolejnością (G4)", () => {
  it("dwaj uczestnicy o identycznym imieniu i nazwisku zachowują WŁASNY postęp w swoim wierszu", async () => {
    const pierwsza = czlonek({
      id: 501,
      first_name: "Jan",
      last_name: "Kowalski",
      progress: {
        courses_done: 2,
        courses_total: 5,
        hours_accepted: "10",
        supervision_present: 1,
        workshop_done: false,
      },
    });
    const druga = czlonek({
      id: 502,
      first_name: "Jan",
      last_name: "Kowalski",
      progress: {
        courses_done: 8,
        courses_total: 10,
        hours_accepted: "50",
        supervision_present: 9,
        workshop_done: true,
      },
    });
    api.mockResolvedValueOnce(grupa([pierwsza, druga]));
    render(<InstructorGroup />);

    await screen.findByRole("table");
    const wiersze = screen.getAllByRole("row");
    const wierszPierwszej = wiersze[1];
    const wierszDrugiej = wiersze[2];

    expect(within(wierszPierwszej).getByText("2 / 5")).toBeInTheDocument();
    expect(within(wierszPierwszej).getByText("10 h")).toBeInTheDocument();
    expect(within(wierszPierwszej).getByText("1", { exact: true })).toBeInTheDocument();
    expect(within(wierszPierwszej).getByText("Nieukończony")).toBeInTheDocument();

    expect(within(wierszDrugiej).getByText("8 / 10")).toBeInTheDocument();
    expect(within(wierszDrugiej).getByText("50 h")).toBeInTheDocument();
    expect(within(wierszDrugiej).getByText("9", { exact: true })).toBeInTheDocument();
    expect(within(wierszDrugiej).getByText("Ukończony")).toBeInTheDocument();
  });
});

describe("InstructorGroup — trzy stany ekranu mają własnego świadka (G5)", () => {
  it("stan ładowania pokazuje wskaźnik status i nagłówek grupy „Moja grupa”", async () => {
    api.mockImplementation(() => new Promise(() => {})); // nigdy się nie rozstrzyga
    render(<InstructorGroup />);

    expect(
      await screen.findByRole("status", { name: "Wczytywanie grupy…" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1 }),
    ).toHaveTextContent(/^Moja grupa$/);
  });

  it("stan błędu wczytania pokazuje komunikat z API i nie pokazuje tabeli", async () => {
    api.mockRejectedValueOnce(
      new ApiError(500, "server_error", "Serwer padł, spróbuj później."),
    );
    render(<InstructorGroup />);

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Serwer padł, spróbuj później.");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("stan pustej grupy pokazuje komunikat pustej tabeli i zero wierszy z danymi", async () => {
    api.mockResolvedValueOnce(grupa([]));
    render(<InstructorGroup />);

    const tabela = await screen.findByRole("table");
    expect(
      screen.getByText("Nie masz jeszcze przypisanych uczestników."),
    ).toBeInTheDocument();
    // Wiersz nagłówka (5 kolumn) + wiersz komunikatu pustego stanu (1 komórka
    // na całą szerokość) — żadnego wiersza z danymi uczestnika.
    expect(within(tabela).getAllByRole("columnheader")).toHaveLength(5);
    expect(within(tabela).getAllByRole("cell")).toHaveLength(1);
  });
});
