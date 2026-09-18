import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * Świadek listy kursów w panelu prowadzącego (poz. 11, D-27): ekran woła
 * `GET /instructor/courses` — punkt, który zwraca WYŁĄCZNIE kursy z
 * przypisaniem (`CourseAssignment`), więc ekran nie filtruje nic sam.
 */

const api = vi.fn();

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

vi.mock("@/lib/api", () => ({
  api: (...args: unknown[]) => api(...args),
  ApiError,
}));

const { default: InstructorCoursesPage } = await import(
  "@/app/(prowadzacy)/prowadzacy/kursy/page"
);

beforeEach(() => {
  api.mockReset();
});

describe("ListaKursowProwadzacego", () => {
  it("pozytyw: renderuje kursy przypisane prowadzącemu z /instructor/courses", async () => {
    api.mockResolvedValue([
      { id: 4, slug: "praca-z-emocjami", title: "Praca z emocjami", sequence_order: 1 },
    ]);

    render(<InstructorCoursesPage />);

    await waitFor(() => expect(screen.getByText("Praca z emocjami")).toBeInTheDocument());
    expect(api).toHaveBeenCalledWith("/instructor/courses");
    expect(
      screen.getByRole("link", { name: "Praca z emocjami" }),
    ).toHaveAttribute("href", "/prowadzacy/kursy/4");
  });

  it("negatyw: lista pusta pokazuje pusty stan zamiast tabeli", async () => {
    api.mockResolvedValue([]);

    render(<InstructorCoursesPage />);

    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: "Nie masz jeszcze żadnego przypisanego kursu.",
        }),
      ).toBeInTheDocument(),
    );
  });
});
