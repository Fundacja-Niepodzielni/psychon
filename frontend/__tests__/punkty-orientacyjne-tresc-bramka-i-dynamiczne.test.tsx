import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

vi.mock("next/navigation", () => ({
  useParams: () => ({ slug: "test-kurs" }),
}));

function jedenH1(kontekst: string) {
  const naglowki = screen.getAllByRole("heading", { level: 1 });
  expect(
    naglowki,
    `${kontekst}: oczekiwano dokładnie jednego <h1>, znaleziono ${naglowki.length}.`,
  ).toHaveLength(1);
}

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset().mockResolvedValue({ data: [], meta: undefined });
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
