import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Świadek listy kursów administracji (H08) po przepięciu na `ListTemplate` +
 * `useZasobStronicowany` (C2 wariant C, partia P1). Formularz „Nowy kurs" i
 * zmiana kolejności zostają nietknięte — mierzymy tylko nagłówek, listę,
 * stronicowanie i stany.
 */

const api = vi.fn();
const apiPaged = vi.fn();

class ApiError extends Error {
  status: number;
  errors?: Record<string, string[]>;
  constructor(status: number, message: string, errors?: Record<string, string[]>) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  api: (...args: unknown[]) => api(...args),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
  ApiError,
}));

const { default: AdminCoursesPage } = await import(
  "@/app/(administracja)/admin/kursy/page"
);

const kurs = {
  id: 5,
  title: "Wywiad psychologiczny",
  slug: "wywiad-psychologiczny",
  type: "course" as const,
  product_group: "psychon" as const,
  sequence_order: 1,
  is_published: true,
  lessons_count: 3,
};

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
});

describe("AdminCoursesPage", () => {
  it("nagłówek pochodzi z PageHeader, tabela pokazuje kurs po wczytaniu", async () => {
    apiPaged.mockResolvedValue({
      data: [kurs],
      meta: { current_page: 1, per_page: 100, total: 1, last_page: 1 },
    });
    render(<AdminCoursesPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Kursy" })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("Wywiad psychologiczny")).toBeInTheDocument(),
    );
  });

  it("noga negatywna: pusta lista pokazuje EmptyState zamiast tabeli", async () => {
    apiPaged.mockResolvedValue({ data: [], meta: undefined });
    render(<AdminCoursesPage />);

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Nie ma jeszcze żadnego kursu" }),
      ).toBeInTheDocument(),
    );
  });

  it("noga negatywna: błąd serwera pokazuje ErrorState z przyciskiem ponowienia", async () => {
    apiPaged.mockRejectedValue(new ApiError(500, "Lista kursów niedostępna."));
    render(<AdminCoursesPage />);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Lista kursów niedostępna."),
    );
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeInTheDocument();
  });

  it("stronicowanie: klik Następna pobiera drugą stronę", async () => {
    apiPaged.mockResolvedValue({
      data: [kurs],
      meta: { current_page: 1, per_page: 100, total: 150, last_page: 2 },
    });
    render(<AdminCoursesPage />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Następna" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "Następna" }));

    await waitFor(() =>
      expect(apiPaged).toHaveBeenLastCalledWith(
        "/admin/courses?page=2&per_page=100&sort=sequence_order",
      ),
    );
  });
});
