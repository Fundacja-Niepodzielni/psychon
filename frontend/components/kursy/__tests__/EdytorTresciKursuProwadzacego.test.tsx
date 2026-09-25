import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Świadek trybu edycji karty kursu w panelu prowadzącego
 * (`EdytorTresciKursuProwadzacego`) — jedno kryterium na test:
 * render trybu edycji, zapis odzwierciedlony w ekranie, błąd 403 z API
 * pokazany jako czytelne zdanie (nie surowy JSON).
 */

const updateInstructorCourse = vi.fn();

class ApiError extends Error {
  status: number;
  errors?: Record<string, string[]>;
  constructor(status: number, message: string, errors?: Record<string, string[]>) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

vi.mock("@/lib/api/klient", () => ({ ApiError }));

vi.mock("@/lib/api/prowadzacy-kursy", () => ({
  updateInstructorCourse: (...args: unknown[]) => updateInstructorCourse(...args),
  createInstructorLesson: vi.fn(),
  updateInstructorLesson: vi.fn(),
  deleteInstructorLesson: vi.fn(),
  uploadInstructorMaterialForCourse: vi.fn(),
  deleteInstructorMaterial: vi.fn(),
}));

const { default: EdytorTresciKursuProwadzacego } = await import(
  "@/components/kursy/EdytorTresciKursuProwadzacego"
);

const kurs = {
  id: 4,
  title: "Praca z emocjami",
  slug: "praca-z-emocjami",
  description: "Opis kursu",
  type: "course" as const,
  product_group: "psychon" as const,
  sequence_order: 1,
  edition_id: null,
  is_published: true,
  lessons_count: 0,
  materials_count: 0,
  created_at: null,
  updated_at: null,
};

beforeEach(() => {
  updateInstructorCourse.mockReset();
});

describe("EdytorTresciKursuProwadzacego", () => {
  it("pozytyw: tryb edycji renderuje formularz treści z danymi kursu, bez pól publikacji i kolejności", () => {
    render(
      <EdytorTresciKursuProwadzacego
        course={kurs}
        lessons={[]}
        onCourseUpdated={vi.fn()}
        onLessonsReload={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Tytuł")).toHaveValue(kurs.title);
    expect(screen.getByLabelText("Opis")).toHaveValue(kurs.description);
    expect(screen.queryByLabelText("Status publikacji")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Pozycja w ścieżce")).not.toBeInTheDocument();
  });

  /**
   * UWAGA: `@/lib/api/prowadzacy-kursy` jest tu zamockowany w całości (patrz
   * `vi.mock` na górze pliku) — ta próba mierzy przekazywanie danych
   * formularza do funkcji modułu i odzwierciedlenie odpowiedzi w ekranie,
   * NIE prawdziwy adres HTTP. Podmiana `/instructor/` -> `/admin/` w
   * `lib/api/prowadzacy-kursy.ts` tej próby nie poruszy — adres na
   * poziomie `fetch` pilnuje `lib/api/__tests__/prowadzacy-kursy-adres.test.ts`.
   */
  it("pozytyw: zapis treści przekazuje dane formularza do updateInstructorCourse i odzwierciedla odpowiedź (atrapa modułu, nie adres)", async () => {
    const user = userEvent.setup();
    const onCourseUpdated = vi.fn();
    updateInstructorCourse.mockResolvedValue({
      ...kurs,
      description: "Nowa treść etapu.",
    });

    render(
      <EdytorTresciKursuProwadzacego
        course={kurs}
        lessons={[]}
        onCourseUpdated={onCourseUpdated}
        onLessonsReload={vi.fn()}
      />,
    );

    await user.clear(screen.getByLabelText("Opis"));
    await user.type(screen.getByLabelText("Opis"), "Nowa treść etapu.");
    await user.click(screen.getByRole("button", { name: "Zapisz zmiany" }));

    await waitFor(() => expect(updateInstructorCourse).toHaveBeenCalledWith(4, {
      title: kurs.title,
      description: "Nowa treść etapu.",
    }));
    expect(onCourseUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ description: "Nowa treść etapu." }),
    );
    expect(await screen.findByText("Zapisano zmiany.")).toBeInTheDocument();
  });

  it("negatyw: błąd 403 z API pokazuje się jako zdanie, nie surowa koperta JSON", async () => {
    const user = userEvent.setup();
    updateInstructorCourse.mockRejectedValue(
      new ApiError(403, "Nie jesteś przypisany do tego kursu."),
    );

    render(
      <EdytorTresciKursuProwadzacego
        course={kurs}
        lessons={[]}
        onCourseUpdated={vi.fn()}
        onLessonsReload={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Zapisz zmiany" }));

    expect(
      await screen.findByText("Nie jesteś przypisany do tego kursu."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/"status":403/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^\{.*\}$/)).not.toBeInTheDocument();
  });
});
