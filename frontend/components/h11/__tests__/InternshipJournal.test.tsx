import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { InternshipEntry } from "@/lib/h11/types";

/**
 * Kontrola dziennika stażu: zachowanie interfejsu dla każdej wartości statusu
 * wpisu, ze szczególnym uwzględnieniem wartości odrzuconej. Etykieta i wybór
 * wariantu odznaki sprawdzane jako dana przekazana do odznaki (mock), nigdy
 * jako nazwa klasy wyglądu — kolor samej odznaki ma już własną kontrolę w
 * miejscu, gdzie żyje (test odznaki). Zamiana klas wyglądu w innym miejscu
 * nie ma prawa tego poczerwienić.
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

// Odznaka statusu jest atomem z własną kontrolą koloru (osobny plik testów).
// Tu interesuje nas wyłącznie, JAKI wariant i JAKĄ treść komponent dziennika
// jej przekazuje — stąd zaślepka ujawniająca wariant jako atrybut danych,
// bez sięgania po klasy wyglądu.
vi.mock("@/components/ui/Badge", () => ({
  default: ({ variant, children }: { variant?: string; children?: import("react").ReactNode }) => (
    <span data-wariant={variant}>{children}</span>
  ),
}));

const { default: InternshipJournal } = await import("@/components/h11/InternshipJournal");

function wpis(overrides: Partial<InternshipEntry> & { status: InternshipEntry["status"] }): InternshipEntry {
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
  };
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
 * pozycji w drzewie, nie po klasie wyglądu ani po powtarzalnym testid, bo
 * odznaka "Łącznie" w karcie postępu używa tego samego komponentu. */
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
  it("submitted: etykieta, wariant odznaki, przycisk edycji obecny i wypełnia formularz danymi wpisu", async () => {
    const entry = wpis({ id: 11, date: "2026-02-01", status: "submitted", hours: "1.5" });
    apiPaged.mockResolvedValue(page([entry]));
    render(<InternshipJournal />);

    await waitFor(() => expect(screen.getByText("2026-02-01")).toBeInTheDocument());
    const odznaka = odznakaStatusu("2026-02-01");
    expect(odznaka).toHaveTextContent("Oczekuje na akceptację");
    expect(odznaka).toHaveAttribute("data-wariant", "info");

    const przycisk = screen.getByRole("button", { name: "Edytuj wpis" });
    await userEvent.click(przycisk);

    expect(screen.getByRole("heading", { name: "Popraw wpis" })).toBeInTheDocument();
    expect(screen.getByLabelText("Data dyżuru")).toHaveValue("2026-02-01");
    expect(screen.getByLabelText("Liczba godzin")).toHaveValue(1.5);
  });

  it("accepted: etykieta, wariant odznaki, brak przycisku edycji, komunikat blokady zamiast niego", async () => {
    const entry = wpis({ id: 12, date: "2026-02-02", status: "accepted" });
    apiPaged.mockResolvedValue(page([entry]));
    render(<InternshipJournal />);

    await waitFor(() => expect(screen.getByText("2026-02-02")).toBeInTheDocument());
    const odznaka = odznakaStatusu("2026-02-02");
    expect(odznaka).toHaveTextContent("Zaakceptowany");
    expect(odznaka).toHaveAttribute("data-wariant", "success");

    expect(screen.queryByRole("button", { name: "Edytuj wpis" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Popraw i wyślij ponownie" })).not.toBeInTheDocument();
    expect(screen.getByText("Wpis zablokowany po akceptacji.")).toBeInTheDocument();
  });

  it("returned: etykieta, wariant odznaki, przycisk niesie inny napis i wypełnia formularz wraz z komentarzem opiekuna", async () => {
    const entry = wpis({
      id: 13,
      date: "2026-02-03",
      status: "returned",
      review_comment: "Uzupełnij opis konsultacji.",
    });
    apiPaged.mockResolvedValue(page([entry]));
    render(<InternshipJournal />);

    await waitFor(() => expect(screen.getByText("2026-02-03")).toBeInTheDocument());
    const odznaka = odznakaStatusu("2026-02-03");
    expect(odznaka).toHaveTextContent("Do poprawy");
    expect(odznaka).toHaveAttribute("data-wariant", "warning");
    expect(screen.getByText("Uzupełnij opis konsultacji.")).toBeInTheDocument();

    const przycisk = screen.getByRole("button", { name: "Popraw i wyślij ponownie" });
    expect(screen.queryByRole("button", { name: "Edytuj wpis" })).not.toBeInTheDocument();
    await userEvent.click(przycisk);

    expect(screen.getByRole("heading", { name: "Popraw wpis" })).toBeInTheDocument();
    expect(screen.getByLabelText("Data dyżuru")).toHaveValue("2026-02-03");
  });

  it("rejected: własna etykieta, własny wariant odznaki, komunikat zamknięcia zamiast przycisku edycji", async () => {
    const entry = wpis({
      id: 14,
      date: "2026-02-04",
      status: "rejected",
      review_comment: "Godziny nie mieszczą się w harmonogramie.",
    });
    apiPaged.mockResolvedValue(page([entry]));
    render(<InternshipJournal />);

    await waitFor(() => expect(screen.getByText("2026-02-04")).toBeInTheDocument());

    // Pozytywna noga: wartość odrzucona ma teraz własną etykietę i własny
    // wariant odznaki — obie wartości mierzone wprost, nie przez domysł
    // "cokolwiek innego niż znane trzy".
    const odznaka = odznakaStatusu("2026-02-04");
    expect(odznaka).toHaveTextContent("Odrzucony");
    expect(odznaka).toHaveAttribute("data-wariant", "danger");

    // Pozytywna noga: komentarz opiekuna nadal się wyświetla.
    expect(screen.getByText("Godziny nie mieszczą się w harmonogramie.")).toBeInTheDocument();

    // Pozytywna noga: zamiast przycisku pojawia się czytelny komunikat
    // zamknięcia wpisu z podpowiedzią założenia nowego wpisu.
    expect(
      screen.getByText(
        "Wpis odrzucony jest zamknięty i nie można go już poprawić ani wysłać ponownie. Jeśli dyżur nadal wymaga udokumentowania, dodaj nowy wpis w formularzu powyżej.",
      ),
    ).toBeInTheDocument();

    // Negatywna noga: przycisk edycji, w żadnym z dwóch możliwych napisów,
    // nie występuje przy wpisie odrzuconym.
    expect(screen.queryByRole("button", { name: "Edytuj wpis" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Popraw i wyślij ponownie" })).not.toBeInTheDocument();
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
