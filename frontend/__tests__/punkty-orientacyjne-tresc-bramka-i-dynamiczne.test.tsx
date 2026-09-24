import { beforeEach, describe, expect, it, vi } from "vitest";
import { Suspense } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Uzupełnienie `punkty-orientacyjne-tresc.test.tsx`: te dwa ekrany są tam
 * ŚWIADOMIE wypisane z nazwy jako nieobjęte (nie po cichu pominięte) —
 * `/admin/ustawienia` bo jego łańcuch layoutów ma `RequireRole` i
 * `PanelShell` w TYM SAMYM pliku (`admin/layout.tsx`), a
 * `/panel/kursy/[slug]/test` bo ma segment dynamiczny (`[slug]`), którego
 * przyrząd tamtego pliku nie zgaduje. Ten plik mierzy `h1` bezpośrednio na
 * komponencie STRONY (bez łańcucha layoutów — tak samo jak pozostałe pliki
 * `__tests__` obok tych dwóch stron, np.
 * `admin-ustawienia-prog-limit.test.tsx` i `test-kursu.test.tsx`), dla
 * KAŻDEGO wysterowanego stanu z osobna: `getAllByRole("heading", { level: 1
 * })` ma długość DOKŁADNIE 1 — nie „co najmniej 1".
 *
 * DOPISANE: sześć ekranów, których wcześniej nie mierzył ani ten plik, ani
 * `punkty-orientacyjne-tresc.test.tsx` (jedne mają segment dynamiczny, inne
 * bramkę roli w łańcuchu layoutów): `/admin/ekran-startowy`,
 * `/admin/profile/[id]`, `/admin/uczestniczki/[id]`, `/prowadzacy/grupa`,
 * `/panel/kursy/[slug]` i `/panel/lekcje/[id]`. Metoda bez zmian: `h1` na
 * komponencie STRONY, osobno dla każdego wysterowanego stanu.
 *
 * ŚWIADEK ZAPISUJE STAN ZASTANY, NIE POSTULAT. Liczba `h1` w każdym
 * przypadku niżej jest ZMIERZONA (licznik
 * `document.querySelectorAll("h1").length` w tych samych stanach), a nie
 * założona. Wszystkie długi z poprzedniej wersji tego pliku zostały spłacone:
 * `/prowadzacy/grupa` w ładowaniu, `/panel/kursy/[slug]` w ładowaniu i w
 * błędzie ogólnym oraz `/admin/uczestniczki/[id]` w ładowaniu i w błędzie
 * ogólnym stoją od teraz na wspólnym szablonie i niosą dokładnie jeden `h1`.
 * Przypadki niżej mierzą nie tylko LICZBĘ `h1` (dokładnie 1), ale i jego
 * TREŚĆ — nazwa przypadku mówi, co jest zmierzone teraz, nie co było
 * zmierzone wcześniej.
 *
 * SEGMENT DYNAMICZNY BEZ `useParams`: cztery z tych stron biorą `params`
 * jako `Promise` i rozpakowują je Reactowym `use()` (konwencja Next 16), a
 * `/panel/lekcje/[id]` jest asynchroniczną funkcją serwerową. Pierwsze
 * renderujemy w `<Suspense>`, z `render()` wewnątrz `await act()` — inaczej
 * obietnica `params` nigdy nie rozstrzyga się w obrębie renderu i drzewo
 * zostaje na zawsze w `fallback`. Ostatnią wołamy jak zwykłą funkcję
 * asynchroniczną i renderujemy zwrócony element.
 */

const api = vi.fn();
const apiPaged = vi.fn();
const downloadFile = vi.fn();

class ApiError extends Error {
  status: number;
  code: string;
  errors?: Record<string, string[]>;
  /** Kopertę `reason` czyta ekran kursu (`screenFor`), żeby odróżnić blokadę
   * etapu od zwykłego 403 — bez niej stanu „zablokowany" nie da się
   * wysterować. */
  reason?: Record<string, unknown> & { missing?: string[] };
  constructor(
    status: number,
    code: string,
    message: string,
    errors?: Record<string, string[]>,
    reason?: Record<string, unknown> & { missing?: string[] },
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.errors = errors;
    this.reason = reason;
  }
}

// Atrapa wylicza też funkcje domenowe barrelu `@/lib/api` (konwencja z
// `components/h18/__tests__/AdminUserCard.slots.test.tsx`): karta osoby i
// ekran grupy importują je po nazwie, więc bez nich moduł strony dostałby
// `undefined`. Każda deleguje do tej samej atrapy `api()`, żeby stan
// sterować jednym `mockResolvedValue`/`mockRejectedValue`.
vi.mock("@/lib/api", () => ({
  api: (...args: unknown[]) => api(...args),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
  downloadFile: (...args: unknown[]) => downloadFile(...args),
  fetchAdminUser: (id: number) => api("/admin/users/" + id),
  updateAdminUser: (...args: unknown[]) => api(...args),
  blockAdminUser: (...args: unknown[]) => api(...args),
  fetchAdminUsers: (...args: unknown[]) => apiPaged(...args),
  assignSupervisor: (...args: unknown[]) => api(...args),
  resetTestAttempts: (...args: unknown[]) => api(...args),
  createInstructorCase: (...args: unknown[]) => api(...args),
  ApiError,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ slug: "test-kurs" }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

function jedenH1(kontekst: string) {
  const naglowki = screen.getAllByRole("heading", { level: 1 });
  expect(
    naglowki,
    `${kontekst}: oczekiwano dokładnie jednego <h1>, znaleziono ${naglowki.length}.`,
  ).toHaveLength(1);
}

/** Strona z segmentem dynamicznym rozpakowującym `params` przez `use()`. */
async function renderujZParametrem(element: React.ReactElement) {
  await act(async () => {
    render(<Suspense fallback={<span>czekam na params</span>}>{element}</Suspense>);
  });
}

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset().mockResolvedValue({ data: [], meta: undefined });
  downloadFile.mockReset();
});

describe("/admin/ustawienia — h1 dla każdego wysterowanego stanu", () => {
  const importPage = () => import("@/app/(administracja)/admin/ustawienia/page");

  it("stan ładowania (przed rozstrzygnięciem GET /admin/edition)", async () => {
    api.mockImplementation(() => new Promise(() => {})); // zawieszone na stałe
    const { default: EditionSettingsPage } = await importPage();
    render(<EditionSettingsPage />);

    await screen.findByText("Wczytywanie ustawień…");
    jedenH1("/admin/ustawienia (ładowanie)");
  });

  it("stan błędu 403 (brak uprawnień)", async () => {
    api.mockRejectedValue(new ApiError(403, "forbidden", "Brak dostępu."));
    const { default: EditionSettingsPage } = await importPage();
    render(<EditionSettingsPage />);

    await screen.findByText("Nie masz uprawnień do wyświetlenia tych ustawień.");
    jedenH1("/admin/ustawienia (błąd 403)");
  });

  it("stan błędu ogólnego (500, z przyciskiem ponowienia)", async () => {
    api.mockRejectedValue(new ApiError(500, "server_error", "Błąd serwera."));
    const { default: EditionSettingsPage } = await importPage();
    render(<EditionSettingsPage />);

    await screen.findByText("Błąd serwera.");
    jedenH1("/admin/ustawienia (błąd 500)");
  });

  it("stan sukcesu (formularz wczytany)", async () => {
    api.mockResolvedValue({
      id: 1,
      name: "Edycja 2026",
      starts_at: null,
      ends_at: null,
      seats_limit: null,
      test_pass_threshold: 70,
      test_attempts_limit: 3,
      internship_hours_required: 40,
      supervision_required_count: 5,
      reliability_threshold: 80,
      lesson_completion_percent: 90,
    });
    const { default: EditionSettingsPage } = await importPage();
    render(<EditionSettingsPage />);

    await screen.findByLabelText("Nazwa edycji");
    jedenH1("/admin/ustawienia (sukces)");
  });
});

describe("/panel/kursy/[slug]/test — h1 dla każdego wysterowanego stanu", () => {
  const importPage = () => import("@/app/(uczestnik)/panel/kursy/[slug]/test/page");

  const testPayload = {
    test_id: 10,
    pass_threshold: 70,
    attempts_used: 0,
    attempts_limit: 3,
    questions: [
      {
        id: 1,
        body: "Pytanie pierwsze",
        sequence_order: 1,
        answers: [
          { id: 11, body: "Odpowiedź A" },
          { id: 12, body: "Odpowiedź B" },
        ],
      },
    ],
  };

  it("stan ładowania (przed rozstrzygnięciem GET /courses/:slug/test)", async () => {
    api.mockImplementation(() => new Promise(() => {}));
    const { default: CourseTestPage } = await importPage();
    render(<CourseTestPage />);

    await screen.findByText("Wczytywanie testu…");
    jedenH1("/panel/kursy/[slug]/test (ładowanie)");
  });

  it("stan zablokowany (course_locked)", async () => {
    api.mockRejectedValue(new ApiError(409, "course_locked", "Ukończ najpierw poprzedni etap."));
    const { default: CourseTestPage } = await importPage();
    render(<CourseTestPage />);

    await screen.findByText("Ten etap jest jeszcze zamknięty");
    jedenH1("/panel/kursy/[slug]/test (zablokowany)");
  });

  it("stan błędu 403 (bez ponowienia)", async () => {
    api.mockRejectedValue(new ApiError(403, "forbidden", "Brak dostępu."));
    const { default: CourseTestPage } = await importPage();
    render(<CourseTestPage />);

    await screen.findByText("Brak dostępu.");
    jedenH1("/panel/kursy/[slug]/test (błąd 403)");
  });

  it("stan błędu z możliwością ponowienia (500)", async () => {
    api.mockRejectedValue(new ApiError(500, "server_error", "Błąd serwera."));
    const { default: CourseTestPage } = await importPage();
    render(<CourseTestPage />);

    await screen.findByText("Błąd serwera.");
    jedenH1("/panel/kursy/[slug]/test (błąd 500, z ponowieniem)");
  });

  it("stan wprowadzenia (intro, test wczytany)", async () => {
    api.mockResolvedValue(testPayload);
    const { default: CourseTestPage } = await importPage();
    render(<CourseTestPage />);

    await screen.findByRole("button", { name: "Rozpocznij test" });
    jedenH1("/panel/kursy/[slug]/test (intro)");
  });

  it("stan trwającego testu (running, po kliknięciu „Rozpocznij test”)", async () => {
    api.mockResolvedValue(testPayload);
    const user = userEvent.setup();
    const { default: CourseTestPage } = await importPage();
    render(<CourseTestPage />);

    await user.click(await screen.findByRole("button", { name: "Rozpocznij test" }));
    await screen.findByRole("group");
    jedenH1("/panel/kursy/[slug]/test (running)");
  });

  it("stan wyniku (result, po wysłaniu odpowiedzi)", async () => {
    api.mockImplementation((path: string, opts?: { method?: string }) => {
      if (opts?.method === "POST") {
        return Promise.resolve({
          attempt_number: 1,
          score_percent: 100,
          passed: true,
          wrong_question_ids: [],
        });
      }
      if (path === "/courses/test-kurs/test") return Promise.resolve(testPayload);
      return Promise.reject(new ApiError(500, "server_error", "Błąd serwera."));
    });
    const user = userEvent.setup();
    const { default: CourseTestPage } = await importPage();
    render(<CourseTestPage />);

    await user.click(await screen.findByRole("button", { name: "Rozpocznij test" }));
    await user.click(await screen.findByRole("radio", { name: "Odpowiedź A" }));
    await user.click(screen.getByRole("button", { name: "Zakończ i sprawdź" }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Wynik testu"),
    );
    jedenH1("/panel/kursy/[slug]/test (result)");
  });
});

// ————— sześć ekranów dopisanych 2026-09-24 —————

const ONBOARDING = {
  video: { title: "Wideo powitalne", url: null, caption: null },
  program: { title: "Program", body: "Treść programu." },
  expectations: { title: "Czego oczekujemy", body: "Treść oczekiwań." },
  updated_at: null,
};

const WNIOSEK_PROFILU = {
  id: 3,
  user: { id: 9, first_name: "Anna", last_name: "Kowalska" },
  specializations: ["dzieci"],
  approach: "poznawczo-behawioralny",
  city: "Warszawa",
  bio: "Bio wniosku.",
  publication_consent_granted: true,
  status: "submitted",
  return_reason: null,
  decided_at: null,
  documents: [],
  created_at: "2026-01-01T10:00:00Z",
  updated_at: "2026-01-01T10:00:00Z",
};

const KARTA_OSOBY = {
  profile: {
    id: 7,
    first_name: "Maria",
    last_name: "Nowak",
    email: "maria@example.com",
    role: "volunteer",
    phone: null,
    pesel: null,
    address: { street: null, city: null, zip: null },
    access_expires_at: null,
    program_completed_at: null,
    product_group: "psychon",
  },
  progress: {
    courses_done: 1,
    courses_total: 3,
    hours_accepted: "10",
    supervision_present: 2,
    workshop_done: false,
  },
  documents: [],
  recent_notifications: [],
  audit_entries: [],
};

const GRUPA_PROWADZACEGO = { members: [], slots: [] };

const KURS = {
  id: 4,
  slug: "test-kurs",
  title: "Kurs testowy",
  sequence_order: 1,
  product_group: "psychon",
  status: "in_progress",
  progress_percent: 20,
  instructor: null,
  lessons: [],
  materials: [],
};

const LEKCJA = {
  id: 5,
  title: "Lekcja o oddechu",
  description: "Opis lekcji.",
  duration_seconds: 600,
  position_seconds: 0,
  watched_seconds: 0,
  active_seconds: 0,
  is_completed: false,
  completable: false,
  completable_at_percent: 60,
};

describe("/admin/ekran-startowy — h1 dla każdego wysterowanego stanu", () => {
  const importPage = () =>
    import("@/app/(administracja)/admin/ekran-startowy/page");

  it("stan ładowania (przed rozstrzygnięciem GET /onboarding)", async () => {
    api.mockImplementation(() => new Promise(() => {}));
    const { default: AdminOnboardingPage } = await importPage();
    render(<AdminOnboardingPage />);

    await screen.findByText("Wczytywanie ekranu startowego…");
    jedenH1("/admin/ekran-startowy (ładowanie)");
  });

  it("stan błędu 403 (brak uprawnień)", async () => {
    api.mockRejectedValue(new ApiError(403, "forbidden", "Brak dostępu."));
    const { default: AdminOnboardingPage } = await importPage();
    render(<AdminOnboardingPage />);

    await screen.findByText("Nie masz uprawnień do wyświetlenia tego ekranu.");
    jedenH1("/admin/ekran-startowy (błąd 403)");
  });

  it("stan błędu ogólnego (500, z przyciskiem ponowienia)", async () => {
    api.mockRejectedValue(new ApiError(500, "server_error", "Błąd serwera."));
    const { default: AdminOnboardingPage } = await importPage();
    render(<AdminOnboardingPage />);

    await screen.findByText("Błąd serwera.");
    jedenH1("/admin/ekran-startowy (błąd 500)");
  });

  it("stan sukcesu (edytor i podgląd wczytane)", async () => {
    api.mockResolvedValue(ONBOARDING);
    const { default: AdminOnboardingPage } = await importPage();
    render(<AdminOnboardingPage />);

    await screen.findByText("Podgląd");
    jedenH1("/admin/ekran-startowy (sukces)");
  });
});

describe("/admin/profile/[id] — h1 dla każdego wysterowanego stanu", () => {
  const importPage = () =>
    import("@/app/(administracja)/admin/profile/[id]/page");

  it("stan ładowania (przed rozstrzygnięciem GET /admin/profiles/:id)", async () => {
    api.mockImplementation(() => new Promise(() => {}));
    const { default: AdminProfileDetailPage } = await importPage();
    await renderujZParametrem(
      <AdminProfileDetailPage params={Promise.resolve({ id: "3" })} />,
    );

    await screen.findByText("Wczytywanie wniosku…");
    jedenH1("/admin/profile/[id] (ładowanie)");
  });

  it("stan błędu 403 (brak uprawnień)", async () => {
    api.mockRejectedValue(new ApiError(403, "forbidden", "Brak dostępu."));
    const { default: AdminProfileDetailPage } = await importPage();
    await renderujZParametrem(
      <AdminProfileDetailPage params={Promise.resolve({ id: "3" })} />,
    );

    await screen.findByText("Nie masz uprawnień do wyświetlenia tego wniosku.");
    jedenH1("/admin/profile/[id] (błąd 403)");
  });

  it("stan błędu ogólnego (500, z przyciskiem ponowienia)", async () => {
    api.mockRejectedValue(new ApiError(500, "server_error", "Błąd serwera."));
    const { default: AdminProfileDetailPage } = await importPage();
    await renderujZParametrem(
      <AdminProfileDetailPage params={Promise.resolve({ id: "3" })} />,
    );

    await screen.findByText("Błąd serwera.");
    jedenH1("/admin/profile/[id] (błąd 500)");
  });

  it("stan sukcesu (wniosek wczytany)", async () => {
    api.mockResolvedValue(WNIOSEK_PROFILU);
    const { default: AdminProfileDetailPage } = await importPage();
    await renderujZParametrem(
      <AdminProfileDetailPage params={Promise.resolve({ id: "3" })} />,
    );

    await screen.findByText("Dane wniosku");
    jedenH1("/admin/profile/[id] (sukces)");
  });
});

describe("/admin/uczestniczki/[id] — h1 dla każdego wysterowanego stanu", () => {
  const importPage = () =>
    import("@/app/(administracja)/admin/uczestniczki/[id]/page");

  it("stan ładowania ma jeden h1 „Karta osoby”", async () => {
    api.mockImplementation(() => new Promise(() => {}));
    const { default: AdminUserPage } = await importPage();
    await renderujZParametrem(
      <AdminUserPage params={Promise.resolve({ id: "7" })} />,
    );

    await screen.findByText("Wczytywanie karty…");
    jedenH1("/admin/uczestniczki/[id] (ładowanie)");
    expect(
      screen.getByRole("heading", { level: 1 }),
      "/admin/uczestniczki/[id] (ładowanie): h1 ma nieść tytuł ekranu",
    ).toHaveTextContent("Karta osoby");
  });

  it("stan „nie znaleziono osoby” (404)", async () => {
    api.mockRejectedValue(new ApiError(404, "not_found", "Nie ma takiej osoby."));
    const { default: AdminUserPage } = await importPage();
    await renderujZParametrem(
      <AdminUserPage params={Promise.resolve({ id: "7" })} />,
    );

    await screen.findByText("Wróć do listy");
    jedenH1("/admin/uczestniczki/[id] (404)");
  });

  it("stan błędu ogólnego (500) ma jeden h1 „Karta osoby”", async () => {
    api.mockRejectedValue(new ApiError(500, "server_error", "Błąd serwera."));
    const { default: AdminUserPage } = await importPage();
    await renderujZParametrem(
      <AdminUserPage params={Promise.resolve({ id: "7" })} />,
    );

    await screen.findByText("Błąd serwera.");
    jedenH1("/admin/uczestniczki/[id] (błąd 500)");
    expect(
      screen.getByRole("heading", { level: 1 }),
      "/admin/uczestniczki/[id] (błąd 500): h1 ma nieść tytuł ekranu",
    ).toHaveTextContent("Karta osoby");
  });

  it("stan sukcesu (karta osoby wczytana)", async () => {
    api.mockResolvedValue(KARTA_OSOBY);
    const { default: AdminUserPage } = await importPage();
    await renderujZParametrem(
      <AdminUserPage params={Promise.resolve({ id: "7" })} />,
    );

    await screen.findByText("← Lista osób");
    jedenH1("/admin/uczestniczki/[id] (sukces)");
  });
});

describe("/prowadzacy/grupa — h1 dla każdego wysterowanego stanu", () => {
  const importPage = () => import("@/app/(prowadzacy)/prowadzacy/grupa/page");

  it("h1 „Moja grupa” w stanie ładowania — stan zastany", async () => {
    api.mockImplementation(() => new Promise(() => {}));
    const { default: InstructorGroupPage } = await importPage();
    render(<InstructorGroupPage />);

    await screen.findByRole("status", { name: "Wczytywanie grupy…" });
    jedenH1("/prowadzacy/grupa (ładowanie)");
    expect(
      screen.getByRole("heading", { level: 1 }),
    ).toHaveTextContent(/^Moja grupa$/);
  });

  it("stan błędu wczytania (z przyciskiem ponowienia)", async () => {
    api.mockRejectedValue(new ApiError(500, "server_error", "Błąd serwera."));
    const { default: InstructorGroupPage } = await importPage();
    render(<InstructorGroupPage />);

    await screen.findByText("Błąd serwera.");
    jedenH1("/prowadzacy/grupa (błąd wczytania)");
  });

  it("stan sukcesu (grupa wczytana, bez uczestników)", async () => {
    api.mockResolvedValue(GRUPA_PROWADZACEGO);
    const { default: InstructorGroupPage } = await importPage();
    render(<InstructorGroupPage />);

    await screen.findByText(
      "Sprawdzaj postępy uczestników i zarządzaj terminami superwizji.",
    );
    jedenH1("/prowadzacy/grupa (sukces)");
  });
});

describe("/panel/kursy/[slug] — h1 dla każdego wysterowanego stanu", () => {
  const importPage = () => import("@/app/(uczestnik)/panel/kursy/[slug]/page");

  /** Katalog (`GET /courses`) leci równolegle ze szczegółami kursu; ekran
   * blokady potrzebuje go, żeby zamienić `required_course_id` na slug. */
  const zKatalogiem = (szczegoly: () => Promise<unknown>) => (path: string) =>
    path === "/courses" ? Promise.resolve([]) : szczegoly();

  it("h1 „Kurs” w stanie ładowania — stan zastany", async () => {
    api.mockImplementation(() => new Promise(() => {}));
    const { default: CoursePage } = await importPage();
    await renderujZParametrem(
      <CoursePage params={Promise.resolve({ slug: "test-kurs" })} />,
    );

    await screen.findByText("Ładowanie kursu…");
    jedenH1("/panel/kursy/[slug] (ładowanie)");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^Kurs$/);
  });

  it("stan sukcesu (kurs wczytany)", async () => {
    api.mockImplementation(zKatalogiem(() => Promise.resolve(KURS)));
    const { default: CoursePage } = await importPage();
    await renderujZParametrem(
      <CoursePage params={Promise.resolve({ slug: "test-kurs" })} />,
    );

    await screen.findByText("Kurs testowy");
    jedenH1("/panel/kursy/[slug] (sukces)");
  });

  it("stan zablokowany (403 course_locked)", async () => {
    api.mockImplementation(
      zKatalogiem(() =>
        Promise.reject(
          new ApiError(
            403,
            "course_locked",
            "Ukończ najpierw poprzedni etap.",
            undefined,
            { missing: ["etap 1"], required_course_id: 1 },
          ),
        ),
      ),
    );
    const { default: CoursePage } = await importPage();
    await renderujZParametrem(
      <CoursePage params={Promise.resolve({ slug: "test-kurs" })} />,
    );

    await screen.findByText("Ukończ najpierw poprzedni etap.");
    jedenH1("/panel/kursy/[slug] (zablokowany)");
  });

  it("stan „nie znaleziono kursu” (404)", async () => {
    api.mockImplementation(
      zKatalogiem(() =>
        Promise.reject(new ApiError(404, "not_found", "Nie ma kursu.")),
      ),
    );
    const { default: CoursePage } = await importPage();
    await renderujZParametrem(
      <CoursePage params={Promise.resolve({ slug: "test-kurs" })} />,
    );

    await screen.findByText("Nie znaleziono kursu");
    jedenH1("/panel/kursy/[slug] (404)");
  });

  it("h1 „Kurs” w stanie błędu ogólnego (500) — stan zastany", async () => {
    api.mockImplementation(
      zKatalogiem(() =>
        Promise.reject(new ApiError(500, "server_error", "Błąd serwera.")),
      ),
    );
    const { default: CoursePage } = await importPage();
    await renderujZParametrem(
      <CoursePage params={Promise.resolve({ slug: "test-kurs" })} />,
    );

    await screen.findByText("Nie udało się wczytać kursu");
    jedenH1("/panel/kursy/[slug] (błąd 500)");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^Kurs$/);
  });

  it("h1 „Kurs zablokowany” w stanie zablokowanym (403 course_locked) niesie tresc blokady", async () => {
    api.mockImplementation(
      zKatalogiem(() =>
        Promise.reject(
          new ApiError(
            403,
            "course_locked",
            "Ukończ najpierw poprzedni etap.",
            undefined,
            { missing: ["etap 1"], required_course_id: 1 },
          ),
        ),
      ),
    );
    const { default: CoursePage } = await importPage();
    await renderujZParametrem(
      <CoursePage params={Promise.resolve({ slug: "test-kurs" })} />,
    );

    await screen.findByText("Ukończ najpierw poprzedni etap.");
    jedenH1("/panel/kursy/[slug] (zablokowany, tresc h1)");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /^Kurs zablokowany$/,
    );
  });
});

describe("/panel/lekcje/[id] — h1 dla każdego wysterowanego stanu", () => {
  const importPage = () => import("@/app/(uczestnik)/panel/lekcje/[id]/page");

  it("stan ładowania odtwarzacza (przed rozstrzygnięciem GET /lessons/:id)", async () => {
    api.mockImplementation(() => new Promise(() => {}));
    const { default: LessonPage } = await importPage();
    render(await LessonPage({ params: Promise.resolve({ id: "5" }) }));

    await screen.findByText("Ładowanie lekcji…");
    jedenH1("/panel/lekcje/[id] (ładowanie)");
  });

  it("stan błędu odtwarzacza (500)", async () => {
    api.mockRejectedValue(new ApiError(500, "server_error", "Błąd serwera."));
    const { default: LessonPage } = await importPage();
    render(await LessonPage({ params: Promise.resolve({ id: "5" }) }));

    await screen.findByText("Nie udało się otworzyć lekcji");
    jedenH1("/panel/lekcje/[id] (błąd 500)");
  });

  it("stan sukcesu (lekcja wczytana)", async () => {
    api.mockResolvedValue(LEKCJA);
    const { default: LessonPage } = await importPage();
    render(await LessonPage({ params: Promise.resolve({ id: "5" }) }));

    await screen.findByText("Lekcja o oddechu");
    jedenH1("/panel/lekcje/[id] (sukces)");
  });
});
