import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { InternshipEntry } from "@/lib/h11/types";

/**
 * Świadek dziennika stażu: zachowanie interfejsu dla każdej wartości statusu
 * wpisu, ze szczególnym uwzględnieniem wartości, której backend nie ma w
 * słowniku etykiet frontu ani w typie statusu. Każda kontrola mierzy treść
 * i zachowanie (dostępność przycisku edycji, wypełnienie formularza), nigdy
 * kolor ani nazwę klasy — zamiana klas wyglądu nie ma prawa tego poczerwienić.
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

const { default: InternshipJournal } = await import("@/components/h11/InternshipJournal");

function wpis(
  overrides: Omit<Partial<InternshipEntry>, "status"> & { status: string },
): InternshipEntry {
  return {
    id: 1,
    date: "2026-02-10",
    hours: "2",
    form: "phone_duty",
    consultations_count: 1,
    description: "Opis dyżuru.",
    review_comment: null,
    decided_at: null,
    created_at: "2026-02-10T09:00:00Z",
    updated_at: "2026-02-10T09:00:00Z",
    ...overrides,
  } as unknown as InternshipEntry;
}

function page(entries: InternshipEntry[]) {
  return {
    data: entries,
    meta: {
      current_page: 1,
      per_page: 25,
      total: entries.length,
      last_page: 1,
      extra: { accepted_hours: "3", required_hours: "40" },
    },
  };
}

/** Odznaka statusu jest kolejnym rodzeństwem akapitu z datą wpisu — wybór po
 * pozycji w drzewie, nie po klasie wyglądu, więc zamiana klas koloru go nie rusza. */
function odznakaStatusu(entryDate: string): HTMLElement {
  const dataAkapit = screen.getByText(entryDate);
  const wiersz = dataAkapit.parentElement?.parentElement as HTMLElement;
  const odznaka = wiersz.children[1] as HTMLElement;
  return odznaka;
}

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
});

describe("InternshipJournal — status wpisu", () => {
  it("submitted: etykieta, przycisk edycji obecny i wypełnia formularz danymi wpisu", async () => {
    const entry = wpis({ id: 11, date: "2026-02-01", status: "submitted", hours: "1.5" });
    apiPaged.mockResolvedValue(page([entry]));
    render(<InternshipJournal />);

    await waitFor(() => expect(screen.getByText("2026-02-01")).toBeInTheDocument());
    expect(odznakaStatusu("2026-02-01")).toHaveTextContent("Oczekuje na akceptację");

    const przycisk = screen.getByRole("button", { name: "Edytuj wpis" });
    await userEvent.click(przycisk);

    expect(screen.getByRole("heading", { name: "Popraw wpis" })).toBeInTheDocument();
    expect(screen.getByLabelText("Data dyżuru")).toHaveValue("2026-02-01");
    expect(screen.getByLabelText("Liczba godzin")).toHaveValue(1.5);
  });

  it("accepted: etykieta, brak przycisku edycji, komunikat blokady zamiast niego", async () => {
    const entry = wpis({ id: 12, date: "2026-02-02", status: "accepted" });
    apiPaged.mockResolvedValue(page([entry]));
    render(<InternshipJournal />);

    await waitFor(() => expect(screen.getByText("2026-02-02")).toBeInTheDocument());
    expect(odznakaStatusu("2026-02-02")).toHaveTextContent("Zaakceptowany");

    expect(screen.queryByRole("button", { name: "Edytuj wpis" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Popraw i wyślij ponownie" })).not.toBeInTheDocument();
    expect(screen.getByText("Wpis zablokowany po akceptacji.")).toBeInTheDocument();
  });

  it("returned: etykieta, przycisk niesie inny napis i wypełnia formularz wraz z komentarzem opiekuna", async () => {
    const entry = wpis({
      id: 13,
      date: "2026-02-03",
      status: "returned",
      review_comment: "Uzupełnij opis konsultacji.",
    });
    apiPaged.mockResolvedValue(page([entry]));
    render(<InternshipJournal />);

    await waitFor(() => expect(screen.getByText("2026-02-03")).toBeInTheDocument());
    expect(odznakaStatusu("2026-02-03")).toHaveTextContent("Do poprawy");
    expect(screen.getByText("Uzupełnij opis konsultacji.")).toBeInTheDocument();

    const przycisk = screen.getByRole("button", { name: "Popraw i wyślij ponownie" });
    expect(screen.queryByRole("button", { name: "Edytuj wpis" })).not.toBeInTheDocument();
    await userEvent.click(przycisk);

    expect(screen.getByRole("heading", { name: "Popraw wpis" })).toBeInTheDocument();
    expect(screen.getByLabelText("Data dyżuru")).toHaveValue("2026-02-03");
  });

  it("rejected: odznaka bez tekstu — status spoza słownika etykiet frontu — a przycisk edycji mimo to nadal wypełnia formularz", async () => {
    const entry = wpis({
      id: 14,
      date: "2026-02-04",
      status: "rejected",
      review_comment: "Godziny nie mieszczą się w harmonogramie.",
    });
    apiPaged.mockResolvedValue(page([entry]));
    render(<InternshipJournal />);

    await waitFor(() => expect(screen.getByText("2026-02-04")).toBeInTheDocument());

    // Pozytywna noga treści: komentarz opiekuna nadal się wyświetla (ta ścieżka
    // nie zależy od słownika etykiet statusu).
    expect(screen.getByText("Godziny nie mieszczą się w harmonogramie.")).toBeInTheDocument();

    // Negatywna noga: żadna ze znanych etykiet statusu nie pasuje do "rejected" —
    // odznaka jest obecna w drzewie, ale bez treści.
    const odznaka = odznakaStatusu("2026-02-04");
    expect(odznaka).toBeEmptyDOMElement();
    expect(screen.queryByText("Oczekuje na akceptację")).not.toBeInTheDocument();
    expect(screen.queryByText("Zaakceptowany")).not.toBeInTheDocument();
    expect(screen.queryByText("Do poprawy")).not.toBeInTheDocument();

    // Zachowanie przycisku: kod blokuje tylko "accepted", więc dla "rejected"
    // nadal renderuje się przycisk z napisem właściwym dla wartości domyślnej
    // i klik nadal otwiera formularz edycji z danymi wpisu.
    const przycisk = screen.getByRole("button", { name: "Edytuj wpis" });
    await userEvent.click(przycisk);
    expect(screen.getByRole("heading", { name: "Popraw wpis" })).toBeInTheDocument();
    expect(screen.getByLabelText("Data dyżuru")).toHaveValue("2026-02-04");
  });

  it("brak komentarza opiekuna: alert z komentarzem się nie renderuje (kontrast do wpisu z komentarzem)", async () => {
    const entry = wpis({ id: 15, date: "2026-02-05", status: "submitted", review_comment: null });
    apiPaged.mockResolvedValue(page([entry]));
    render(<InternshipJournal />);

    await waitFor(() => expect(screen.getByText("2026-02-05")).toBeInTheDocument());
    expect(screen.queryByText(/Komentarz opiekuna/)).not.toBeInTheDocument();
  });
});

describe("InternshipJournal — czerwień nieuwarunkowana czasem", () => {
  it("noga negatywna: błąd wczytania pokazuje komunikat i przycisk ponowienia, nie ekran ładowania", async () => {
    apiPaged.mockRejectedValue(new ApiError(500, "server_error", "Dziennik niedostępny."));
    render(<InternshipJournal />);

    await waitFor(() => expect(screen.getByText("Dziennik niedostępny.")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeInTheDocument();
    expect(screen.queryByText("Wczytywanie dziennika…")).not.toBeInTheDocument();
  });
});
