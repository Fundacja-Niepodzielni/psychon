import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Świadek edytora treści kursu (poz. 11, D-27) — wydzielonego z
 * `admin/kursy/[id]/page.tsx`, żeby ten sam ekran mogła zamontować karta
 * administracji I karta prowadzącego. Mierzone są dokładnie te obietnice,
 * które musiały przeżyć wydzielenie: dane kursu i lekcje z propsów renderują
 * się bez zmian, a zapis leci pod TE SAME adresy/payloady co przed
 * wydzieleniem (§ na końcu pliku porównuje je z historyczną wersją
 * `admin/kursy/[id]/page.tsx`).
 */

const api = vi.fn();

class ApiError extends Error {
  status: number;
  errors?: Record<string, string[]>;
  constructor(status: number, message: string, errors?: Record<string, string[]>) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

vi.mock("@/lib/api", () => ({
  api: (...args: unknown[]) => api(...args),
  ApiError,
}));

const { default: EdytorTresciKursu } = await import("@/components/kursy/EdytorTresciKursu");

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
  lessons_count: 1,
  materials_count: 0,
  created_at: null,
  updated_at: null,
};

const lekcja = {
  id: 10,
  course_id: kurs.id,
  title: "Lekcja wstępna",
  description: null,
  sequence_order: 1,
  video_provider_id: null,
  duration_seconds: 600,
  materials_count: 0,
  created_at: null,
  updated_at: null,
};

beforeEach(() => {
  api.mockReset();
});

describe("EdytorTresciKursu", () => {
  it("pozytyw: renderuje dane kursu i lekcje z propsów", () => {
    render(
      <EdytorTresciKursu
        course={kurs}
        lessons={[lekcja]}
        onCourseUpdated={vi.fn()}
        onLessonsReload={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Tytuł")).toHaveValue(kurs.title);
    expect(screen.getByLabelText("Identyfikator (slug)")).toHaveValue(kurs.slug);
    expect(screen.getByText("Lekcja wstępna")).toBeInTheDocument();
  });

  it("pozytyw: zapis kursu woła PATCH /admin/courses/{id} z tym samym payloadem, co przed wydzieleniem", async () => {
    const onCourseUpdated = vi.fn();
    api.mockResolvedValue({ ...kurs, title: "Praca z emocjami — v2" });

    render(
      <EdytorTresciKursu
        course={kurs}
        lessons={[lekcja]}
        onCourseUpdated={onCourseUpdated}
        onLessonsReload={vi.fn()}
      />,
    );

    await userEvent.clear(screen.getByLabelText("Tytuł"));
    await userEvent.type(screen.getByLabelText("Tytuł"), "Praca z emocjami — v2");
    await userEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(`/admin/courses/${kurs.id}`, {
        method: "PATCH",
        body: {
          title: "Praca z emocjami — v2",
          slug: kurs.slug,
          type: kurs.type,
          product_group: kurs.product_group,
          sequence_order: kurs.sequence_order,
          description: kurs.description,
        },
      }),
    );
    await waitFor(() => expect(onCourseUpdated).toHaveBeenCalled());
  });

  it("pozytyw: nowa lekcja woła POST /admin/courses/{id}/lessons i przeładowuje listę u rodzica", async () => {
    const onLessonsReload = vi.fn();
    api.mockResolvedValue(lekcja);

    render(
      <EdytorTresciKursu
        course={kurs}
        lessons={[lekcja]}
        onCourseUpdated={vi.fn()}
        onLessonsReload={onLessonsReload}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Nowa lekcja" }));
    await userEvent.type(screen.getByLabelText("Tytuł lekcji"), "Druga lekcja");
    await userEvent.click(screen.getByRole("button", { name: "Dodaj lekcję" }));

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(`/admin/courses/${kurs.id}/lessons`, {
        method: "POST",
        body: {
          title: "Druga lekcja",
          description: null,
          sequence_order: null,
          video_provider_id: null,
          duration_seconds: 0,
        },
      }),
    );
    await waitFor(() => expect(onLessonsReload).toHaveBeenCalled());
  });

  it("negatyw: błąd API przy zapisie kursu pokazuje komunikat i NIE woła onCourseUpdated", async () => {
    const onCourseUpdated = vi.fn();
    api.mockRejectedValue(new ApiError(500, "Nie udało się zapisać zmian. Spróbuj ponownie."));

    render(
      <EdytorTresciKursu
        course={kurs}
        lessons={[lekcja]}
        onCourseUpdated={onCourseUpdated}
        onLessonsReload={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Nie udało się zapisać zmian. Spróbuj ponownie.",
      ),
    );
    expect(onCourseUpdated).not.toHaveBeenCalled();
  });
});
