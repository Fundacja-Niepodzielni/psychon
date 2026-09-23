import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * Swiadek startu prowadzacego (H12) po przepieciu naglowka ekranu na
 * `PageTemplate` (ten sam szablon co `/panel/start`). Mierzy, ze `h1` i
 * zdanie kontekstu pochodza z `PageHeader`, a kafelki liczb nadal czytaja
 * dane z `/instructor/group` i skrzynki pytan bez zadnej zmiany trasy.
 */

const api = vi.fn();
const fetchInstructorQuestions = vi.fn();

vi.mock("@/lib/api", () => ({
  api: (...args: unknown[]) => api(...args),
}));

vi.mock("@/lib/questions", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/questions")>();
  return {
    ...actual,
    fetchInstructorQuestions: (...args: unknown[]) => fetchInstructorQuestions(...args),
  };
});

const { default: InstructorStart } = await import("@/components/instructor/InstructorStart");

const grupa = {
  members: [{ id: 1, first_name: "Ana", last_name: "Kowal" }],
  slots: [
    {
      id: 9,
      starts_at: "2099-01-01T10:00:00Z",
      duration_minutes: 60,
      seats_limit: 10,
      location_or_link: null,
      active_signups_count: 3,
      available_seats: 7,
    },
  ],
};

beforeEach(() => {
  api.mockReset();
  fetchInstructorQuestions.mockReset();
});

describe("InstructorStart", () => {
  it("naglowek i opis pochodza z PageHeader, kafelki pokazuja liczby po wczytaniu", async () => {
    api.mockResolvedValue(grupa);
    fetchInstructorQuestions.mockResolvedValue({
      data: [],
      meta: { current_page: 1, per_page: 25, total: 0, last_page: 1, extra: { unanswered: 2 } },
    });

    render(<InstructorStart />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Panel prowadzącego" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Skrót do tego, co dziś wymaga Twojej uwagi."),
    ).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("osoba w grupie")).toBeInTheDocument());
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith("/instructor/group");
  });

  it("noga negatywna: awaria wczytania grupy pokazuje przycisk ponowienia w kafelku", async () => {
    api.mockRejectedValue(new Error("siec padla"));
    fetchInstructorQuestions.mockResolvedValue({
      data: [],
      meta: { current_page: 1, per_page: 25, total: 0, last_page: 1, extra: { unanswered: 0 } },
    });

    render(<InstructorStart />);

    // Kafelek "Moja grupa" i "Najbliższa superwizja" czytają to samo API
    // (`/instructor/group`), więc awaria pokazuje ten sam komunikat dwa razy.
    await waitFor(() =>
      expect(
        screen.getAllByText("Nie udało się wczytać tej liczby — spróbuj ponownie za chwilę."),
      ).toHaveLength(2),
    );
    // naglowek ekranu zostaje na miejscu, mimo awarii pojedynczego kafelka —
    // to potwierdza, ze PageTemplate nie znika przy bledzie czesciowym.
    expect(
      screen.getByRole("heading", { level: 1, name: "Panel prowadzącego" }),
    ).toBeInTheDocument();
  });
});
