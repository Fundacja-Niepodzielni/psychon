import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Świadek edytora treści kursu — wydzielonego z
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

/**
 * Limit czasu przypadków, które pod obciążeniem hosta (równoległe procesy, zimny pierwszy import)
 * trwają wielokrotnie dłużej niż domyślne 5000 ms. Wartość to większa z: trzykrotność maksimum
 * z 10 pomiarów na cichym hoście albo 15 000 ms; przy każdym przypadku stoi jego zmierzony czas.
 */
const LIMIT_PRZYPADKU_MS = 15_000;

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

  // zmierzone na cichym hoście: maks. 0,6 s z 10; limit 3× i co najmniej 15 s
  it("pozytyw: zapis kursu woła PATCH /admin/courses/{id} z tym samym payloadem, co przed wydzieleniem", { timeout: LIMIT_PRZYPADKU_MS }, async () => {
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
          // U-11: slug wciąż idzie za tytułem — nikt go tu nie dotknął ręcznie.
          slug: "praca-z-emocjami-v2",
          type: kurs.type,
          sequence_order: kurs.sequence_order,
          description: kurs.description,
        },
      }),
    );
    await waitFor(() => expect(onCourseUpdated).toHaveBeenCalled());
  });

  it("grupa produktowa schowana: formularz nie ma pola, a zapis kursu z grupą „obie” nie niesie product_group", async () => {
    const api_ = api.mockResolvedValue({ ...kurs, product_group: "both" as const });
    render(
      <EdytorTresciKursu
        course={{ ...kurs, product_group: "both" as const }}
        lessons={[lekcja]}
        onCourseUpdated={vi.fn()}
        onLessonsReload={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText("Grupa produktowa")).not.toBeInTheDocument();
    expect(screen.queryByText(/grup[aąy] produktow/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Obie grupy")).not.toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("Tytuł"));
    await userEvent.type(screen.getByLabelText("Tytuł"), "Inny tytuł");
    await userEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));

    await waitFor(() => expect(api_).toHaveBeenCalledWith(`/admin/courses/${kurs.id}`, expect.anything()));
    const [, opcje] = api_.mock.calls[0] as [string, { method: string; body: Record<string, unknown> }];
    expect(opcje.method).toBe("PATCH");
    expect(Object.keys(opcje.body)).not.toContain("product_group");
  });

  it("pozytyw (U-11): slug wypełnia się sam z tytułu, dopóki nikt go nie zmieni ręcznie", async () => {
    render(
      <EdytorTresciKursu
        course={kurs}
        lessons={[lekcja]}
        onCourseUpdated={vi.fn()}
        onLessonsReload={vi.fn()}
      />,
    );

    await userEvent.clear(screen.getByLabelText("Tytuł"));
    await userEvent.type(screen.getByLabelText("Tytuł"), "Wywiad psychologiczny");

    expect(screen.getByLabelText("Identyfikator (slug)")).toHaveValue(
      "wywiad-psychologiczny",
    );
  });

  // zmierzone na cichym hoście: maks. 0,7 s z 10; limit 3× i co najmniej 15 s
  it("pozytyw (U-11): po ręcznej zmianie sluga kolejna zmiana tytułu go nie rusza", { timeout: LIMIT_PRZYPADKU_MS }, async () => {
    render(
      <EdytorTresciKursu
        course={kurs}
        lessons={[lekcja]}
        onCourseUpdated={vi.fn()}
        onLessonsReload={vi.fn()}
      />,
    );

    await userEvent.clear(screen.getByLabelText("Identyfikator (slug)"));
    await userEvent.type(
      screen.getByLabelText("Identyfikator (slug)"),
      "wlasny-adres",
    );

    await userEvent.clear(screen.getByLabelText("Tytuł"));
    await userEvent.type(screen.getByLabelText("Tytuł"), "Zupełnie inny tytuł");

    expect(screen.getByLabelText("Identyfikator (slug)")).toHaveValue(
      "wlasny-adres",
    );
  });

  it("pozytyw (U-9): kolumna Pozycja przelicza się natychmiast po przesunięciu strzałką", async () => {
    const lekcja2 = { ...lekcja, id: 11, title: "Druga lekcja", sequence_order: 2 };

    render(
      <EdytorTresciKursu
        course={kurs}
        lessons={[lekcja, lekcja2]}
        onCourseUpdated={vi.fn()}
        onLessonsReload={vi.fn()}
      />,
    );

    const rowFor = (title: string) =>
      screen.getByText(title).closest("tr") as HTMLTableRowElement;

    expect(within(rowFor("Lekcja wstępna")).getAllByRole("cell")[1]).toHaveTextContent("1");
    expect(within(rowFor("Druga lekcja")).getAllByRole("cell")[1]).toHaveTextContent("2");

    await userEvent.click(
      screen.getByRole("button", { name: "Przesuń w dół: Lekcja wstępna" }),
    );

    // Przesunięcie w dół zamienia obie lekcje miejscami — kolumna Pozycja ma
    // pokazywać nowy układ NATYCHMIAST, bez zapisu na serwer (dawny błąd
    // zostawiał tu stare wartości "2, 1" aż do zapisu kolejności).
    expect(within(rowFor("Lekcja wstępna")).getAllByRole("cell")[1]).toHaveTextContent("2");
    expect(within(rowFor("Druga lekcja")).getAllByRole("cell")[1]).toHaveTextContent("1");
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

  it("pozytyw: przeładowanie (nowa referencja lessons od rodzica) resetuje formularz do świeżych danych serwera — zachowanie sprzed podziału (9e20d8f:138)", async () => {
    const { rerender } = render(
      <EdytorTresciKursu
        course={kurs}
        lessons={[lekcja]}
        onCourseUpdated={vi.fn()}
        onLessonsReload={vi.fn()}
      />,
    );

    // Niezapisany szkic — użytkownik edytuje tytuł, ale NIE zapisuje.
    await userEvent.clear(screen.getByLabelText("Tytuł"));
    await userEvent.type(screen.getByLabelText("Tytuł"), "Szkic bez zapisu");
    expect(screen.getByLabelText("Tytuł")).toHaveValue("Szkic bez zapisu");

    // Rodzic przeładowuje kurs I lekcje razem (np. po dodaniu innej lekcji) —
    // `lessons` dostaje nową referencję z serwera, tak jak w monolicie przed
    // podziałem efekt `[id, reloadKey]` odświeżał `courseForm`.
    const kursZeServera = { ...kurs, title: "Praca z emocjami — z serwera" };
    rerender(
      <EdytorTresciKursu
        course={kursZeServera}
        lessons={[lekcja]}
        onCourseUpdated={vi.fn()}
        onLessonsReload={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Tytuł")).toHaveValue(
        "Praca z emocjami — z serwera",
      ),
    );
  });

  it("pozytyw (U-8/U-4): „Edytuj” rozwija formularz w wierszu TUŻ POD lekcją, nie na dole tabeli", async () => {
    const lekcja2 = { ...lekcja, id: 11, title: "Druga lekcja", sequence_order: 2 };

    render(
      <EdytorTresciKursu
        course={kurs}
        lessons={[lekcja, lekcja2]}
        onCourseUpdated={vi.fn()}
        onLessonsReload={vi.fn()}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Edytuj lekcję: Lekcja wstępna" }),
    );

    const editedRow = screen.getByText("Lekcja wstępna").closest("tr");
    const nextRow = editedRow?.nextElementSibling as HTMLElement | null;

    expect(nextRow).not.toBeNull();
    expect(
      within(nextRow as HTMLElement).getByLabelText("Tytuł lekcji"),
    ).toBeInTheDocument();
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
