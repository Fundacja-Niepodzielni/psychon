import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * Świadek ekranu katalogu kursów (H05) po przepięciu na `ListTemplate` +
 * `useZasob` (C2 wariant C, partia P1). Mierzy nagłówek z `PageHeader` i
 * trzy stany na jednym API (`fetchCourses`), nie żądania sieciowe.
 */

const fetchCourses = vi.fn();

vi.mock("@/lib/courses", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/courses")>();
  return { ...actual, fetchCourses: (...args: unknown[]) => fetchCourses(...args) };
});

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return { ...actual, ApiError };
});

const { default: CoursesCataloguePage } = await import("@/app/(uczestnik)/panel/kursy/page");

const kurs = {
  id: 1,
  slug: "wprowadzenie",
  title: "Wprowadzenie",
  sequence_order: 1,
  product_group: "psychon" as const,
  status: "in_progress" as const,
  progress_percent: 40,
};

beforeEach(() => {
  fetchCourses.mockReset();
});

describe("CoursesCataloguePage", () => {
  it("nagłówek H1 pochodzi z PageHeader i lista pokazuje kursy po wczytaniu", async () => {
    fetchCourses.mockResolvedValue([kurs]);
    render(<CoursesCataloguePage />);

    expect(screen.getByRole("heading", { level: 1, name: "Kursy" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Wprowadzenie")).toBeInTheDocument());
  });

  it("noga negatywna: pusta lista pokazuje EmptyState, nie tabelę", async () => {
    fetchCourses.mockResolvedValue([]);
    render(<CoursesCataloguePage />);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Nie masz jeszcze kursów" })).toBeInTheDocument(),
    );
  });

  it("noga negatywna: błąd serwera pokazuje ErrorState z przyciskiem ponowienia", async () => {
    fetchCourses.mockRejectedValue(new ApiError(500, "Serwer nie odpowiada."));
    render(<CoursesCataloguePage />);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Serwer nie odpowiada."));
    expect(screen.getByRole("alert")).toHaveTextContent("Nie udało się wczytać kursów");
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeInTheDocument();
  });

  it("403: pokazuje odmowę dostępu, nie ErrorState", async () => {
    fetchCourses.mockRejectedValue(new ApiError(403, "Brak uprawnień."));
    render(<CoursesCataloguePage />);

    await waitFor(() => expect(screen.getByText("Brak dostępu")).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("500: pokazuje ErrorState, nie odmowę dostępu", async () => {
    fetchCourses.mockRejectedValue(new ApiError(500, "Serwer nie odpowiada."));
    render(<CoursesCataloguePage />);

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.queryByText("Brak dostępu")).not.toBeInTheDocument();
  });
});
