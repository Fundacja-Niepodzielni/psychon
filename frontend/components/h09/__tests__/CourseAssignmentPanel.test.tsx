import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Świadek panelu przypisań prowadzących na karcie kursu.
 *
 * Mierzone są obietnice złożone w karcie pakietu, nie kształt komponentu:
 *
 * 1. przypisanie pokazuje nazwisko na kursie BEZ przeładowania strony, a
 *    odłączenie zabiera je ze WSZYSTKICH miejsc, w których było widoczne;
 * 2. dziedziczenie jest POWIEDZIANE słowami — prowadzący całego kursu obsługuje
 *    każdą lekcję bez własnego przypisania, a ekran rozróżnia oba przypadki;
 * 3. rola bez uprawnień dostaje 403 z API — to granica serwera, ma własnego
 *    świadka po stronie backendu i nie jest tu dublowana.
 *
 * „Bez przeładowania" znaczy tu dokładnie tyle: po udanym żądaniu ekran NIE
 * pobiera listy jeszcze raz, tylko sam pokazuje nowy stan. Dlatego każdy test
 * liczy wywołania klienta API — test na samą obecność tekstu byłby zielony
 * także wtedy, gdyby panel po każdej akcji zaciągał wszystko od nowa albo, co
 * gorsza, nie pokazywał zmiany aż do odświeżenia strony.
 *
 * Klient API jest zaślepiony (`vi.mock`), bo przedmiotem pomiaru jest EKRAN.
 */

const api = vi.fn();
const apiPaged = vi.fn();

class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

vi.mock("@/lib/api", () => ({
  api: (...args: unknown[]) => api(...args),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
  ApiError,
}));

const { CourseAssignmentPanel } = await import(
  "@/components/h09/CourseAssignmentPanel"
);

const kurs = {
  id: 4,
  title: "Praca z emocjami",
  slug: "praca-z-emocjami",
  description: null,
  type: "course" as const,
  product_group: "podstawowy" as const,
  sequence_order: 1,
  edition_id: null,
  is_published: true,
  lessons_count: 2,
  materials_count: 0,
  created_at: null,
  updated_at: null,
};

function lekcja(id: number, title: string) {
  return {
    id,
    course_id: kurs.id,
    title,
    description: null,
    sequence_order: id,
    video_provider_id: null,
    duration_seconds: 600,
    materials_count: 0,
    created_at: null,
    updated_at: null,
  };
}

const lekcje = [lekcja(11, "Rozpoznawanie emocji"), lekcja(12, "Praca z gniewem")];

const joanna = { id: 31, first_name: "Joanna", last_name: "Wilk" };
const filip = { id: 32, first_name: "Filip", last_name: "Baran" };

function przypisanie(
  id: number,
  lessonId: number | null,
  instructor: typeof joanna,
) {
  return {
    id,
    course_id: kurs.id,
    lesson_id: lessonId,
    instructor,
    assigned_by: 1,
    assigned_at: "2026-09-01T10:00:00Z",
    unassigned_at: null,
  };
}

const SCIEZKA = `/admin/courses/${kurs.id}/assignments`;

/** Ile razy panel POBRAŁ listę przypisań (żądanie bez `method`). */
function pobraniaListy(): number {
  return api.mock.calls.filter(
    (call) =>
      call[0] === SCIEZKA && (call[1] === undefined || call[1]?.method === undefined),
  ).length;
}

/** Wiersz tabeli o podanym zakresie — tylko z tabeli, nie z listy wyboru. */
function wiersz(zakres: string): HTMLElement {
  const tabela = screen.getByRole("table");
  const znaleziony = within(tabela)
    .getAllByRole("row")
    .find((row) => within(row).queryAllByText(zakres).length > 0);

  if (!znaleziony) {
    throw new Error(`W tabeli przypisań nie ma wiersza o zakresie: ${zakres}`);
  }

  return znaleziony;
}

async function pokazPanel(przypisania: ReturnType<typeof przypisanie>[]) {
  api.mockImplementation((path: string, options?: { method?: string }) => {
    if (path === SCIEZKA && !options?.method) return Promise.resolve(przypisania);
    throw new Error(`Nieoczekiwane żądanie: ${options?.method ?? "GET"} ${path}`);
  });

  render(<CourseAssignmentPanel course={kurs} lessons={lekcje} />);
  // Tabela rysuje się zanim dojdą dane; lista wyboru zapełnia się razem z
  // przypisaniami, więc dopiero jej opcja świadczy o kompletnym pierwszym stanie.
  await screen.findByRole("option", { name: "Joanna Wilk" });
}

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
  apiPaged.mockResolvedValue({
    data: [joanna, filip],
    meta: { current_page: 1, per_page: 100, total: 2, last_page: 1 },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("panel przypisań — przypisanie i odłączenie widać od razu", () => {
  it("po przypisaniu nazwisko jest na kursie bez ponownego pobrania listy", async () => {
    // Kryterium 1, pierwsza połowa. Liczy się nie to, że żądanie poszło, ale że
    // ekran POKAZAŁ wynik sam z siebie: gdyby panel zgubił dopisanie do stanu,
    // nazwisko pojawiłoby się dopiero po przeładowaniu strony — czyli nigdy w
    // trakcie tej sesji użytkowniczki.
    const user = userEvent.setup();
    await pokazPanel([]);

    expect(within(wiersz("Cały kurs")).getByText("—")).toBeInTheDocument();

    api.mockImplementation((path: string, options?: { method?: string }) => {
      if (path === SCIEZKA && options?.method === "POST") {
        return Promise.resolve(przypisanie(500, null, joanna));
      }
      throw new Error(`Nieoczekiwane żądanie: ${options?.method ?? "GET"} ${path}`);
    });

    await user.selectOptions(screen.getByLabelText("Zakres"), "course");
    await user.selectOptions(screen.getByLabelText("Prowadzący"), String(joanna.id));
    await user.click(screen.getByRole("button", { name: "Przypisz" }));

    expect(
      await within(wiersz("Cały kurs")).findByText("Joanna Wilk"),
    ).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith(SCIEZKA, {
      method: "POST",
      body: { instructor_id: joanna.id, lesson_id: null },
    });
    // Nazwisko ma się pojawić także tam, gdzie prowadzącego dotąd nie było.
    expect(
      within(wiersz("Rozpoznawanie emocji")).getByText("Joanna Wilk"),
    ).toBeInTheDocument();
    expect(pobraniaListy()).toBe(1);
  });

  it("po odłączeniu nazwiska nie ma w żadnym wierszu, w którym było pokazane", async () => {
    // Kryterium 1, druga połowa. Przypisanie kursu widać w trzech wierszach —
    // własnym i dwóch odziedziczonych. Odłączenie ma je zabrać ze wszystkich
    // trzech naraz, znowu bez pobierania listy od nowa.
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await pokazPanel([przypisanie(500, null, joanna)]);

    expect(
      within(wiersz("Praca z gniewem")).getByText("Joanna Wilk"),
    ).toBeInTheDocument();

    api.mockImplementation((path: string, options?: { method?: string }) => {
      if (path === SCIEZKA && options?.method === "DELETE") {
        return Promise.resolve({
          ...przypisanie(500, null, joanna),
          unassigned_at: "2026-09-06T12:00:00Z",
        });
      }
      throw new Error(`Nieoczekiwane żądanie: ${options?.method ?? "GET"} ${path}`);
    });

    await user.click(
      screen.getByRole("button", { name: "Odłącz prowadzącego: Cały kurs" }),
    );

    expect(api).toHaveBeenCalledWith(SCIEZKA, {
      method: "DELETE",
      body: { assignment_id: 500 },
    });
    await vi.waitFor(() => {
      expect(
        within(screen.getByRole("table")).queryAllByText("Joanna Wilk"),
      ).toHaveLength(0);
    });
    for (const zakres of ["Cały kurs", "Rozpoznawanie emocji", "Praca z gniewem"]) {
      expect(within(wiersz(zakres)).getByText("—")).toBeInTheDocument();
    }
    expect(pobraniaListy()).toBe(1);
  });
});

describe("panel przypisań — dziedziczenie powiedziane słowami", () => {
  it("rozróżnia własne przypisanie od odziedziczonego po kursie", async () => {
    // Kryterium 2. Dwa wiersze mają prowadzącego, ale z zupełnie innego powodu.
    // Ekran ma ten powód nazwać, a nie zostawić czytającego z domysłem, więc
    // sprawdzamy DOKŁADNE słowa i to, że wiersz odziedziczony nie udaje własnego.
    await pokazPanel([przypisanie(500, null, joanna), przypisanie(501, 12, filip)]);

    const kursowy = wiersz("Cały kurs");
    expect(within(kursowy).getByText("Joanna Wilk")).toBeInTheDocument();
    expect(within(kursowy).getByText("Własne przypisanie")).toBeInTheDocument();

    const pokryta = wiersz("Rozpoznawanie emocji");
    expect(within(pokryta).getByText("Joanna Wilk")).toBeInTheDocument();
    expect(within(pokryta).getByText("Odziedziczone po kursie")).toBeInTheDocument();
    expect(within(pokryta).queryByText("Własne przypisanie")).toBeNull();

    const wlasna = wiersz("Praca z gniewem");
    expect(within(wlasna).getByText("Filip Baran")).toBeInTheDocument();
    expect(within(wlasna).getByText("Własne przypisanie")).toBeInTheDocument();
    expect(within(wlasna).queryByText("Odziedziczone po kursie")).toBeNull();
  });

  it("bez przypisania kursu wiersz mówi wprost, że prowadzącego nie ma", async () => {
    // Trzeci przypadek tego samego rozróżnienia: puste nie może wyglądać jak
    // odziedziczone. Bez tego „—" w kolumnie prowadzącego dałoby się przeczytać
    // jako „ktoś jest, tylko się nie wyświetlił".
    await pokazPanel([przypisanie(501, 12, filip)]);

    const pusta = wiersz("Rozpoznawanie emocji");
    expect(within(pusta).getByText("Brak prowadzącego")).toBeInTheDocument();
    expect(within(pusta).queryByText("Odziedziczone po kursie")).toBeNull();
    expect(
      within(wiersz("Praca z gniewem")).getByText("Własne przypisanie"),
    ).toBeInTheDocument();
  });

  it("odłączenie kursu zostawia lekcję z własnym, a pokrytą spycha do braku", async () => {
    // Kryterium 2, zdanie o cofnięciu. Jedno odłączenie ma dwa różne skutki w
    // dwóch wierszach — i ta właśnie różnica jest obietnicą dziedziczenia.
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await pokazPanel([przypisanie(500, null, joanna), przypisanie(501, 12, filip)]);

    api.mockImplementation((path: string, options?: { method?: string }) => {
      if (path === SCIEZKA && options?.method === "DELETE") {
        return Promise.resolve(przypisanie(500, null, joanna));
      }
      throw new Error(`Nieoczekiwane żądanie: ${options?.method ?? "GET"} ${path}`);
    });

    await user.click(
      screen.getByRole("button", { name: "Odłącz prowadzącego: Cały kurs" }),
    );

    await vi.waitFor(() => {
      expect(
        within(wiersz("Rozpoznawanie emocji")).getByText("Brak prowadzącego"),
      ).toBeInTheDocument();
    });
    expect(within(wiersz("Cały kurs")).getByText("Brak prowadzącego")).toBeInTheDocument();

    const wlasna = wiersz("Praca z gniewem");
    expect(within(wlasna).getByText("Filip Baran")).toBeInTheDocument();
    expect(within(wlasna).getByText("Własne przypisanie")).toBeInTheDocument();
    expect(pobraniaListy()).toBe(1);
  });
});
