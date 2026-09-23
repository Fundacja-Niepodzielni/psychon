import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Bank pytań testu w panelu prowadzącego (poz. 11, D-27) pod strażnikiem
 * roli (`RequireRole allowedRoles={["instructor"]}` w `prowadzacy/layout.tsx`,
 * wzorzec z `kurs-prowadzacego-dostep.test.tsx`), montujący ten sam
 * `QuestionBank` (H10), co karta administracji.
 *
 * Mierzone jest, że ekran prowadzącego woła TE SAME punkty API H10, z tym
 * samym kształtem żądania, co bank pytań w panelu administracji — oraz że
 * pokazuje te same stany negatywne (błąd wczytania, odmowa roli).
 */

const api = vi.fn();
const apiPaged = vi.fn();

class ApiError extends Error {
  status: number;
  errors?: Record<string, string[]>;
  constructor(
    status: number,
    message: string,
    errors?: Record<string, string[]>,
  ) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

vi.mock("@/lib/api", () => ({
  api: (...args: unknown[]) => api(...args),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
  endSession: vi.fn(),
  ApiError,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/prowadzacy/testy/12/pytania",
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  notFound: () => {
    throw new Error("notFound() wywołane");
  },
}));

const { default: InstructorLayout } = await import(
  "@/app/(prowadzacy)/prowadzacy/layout"
);
const { default: InstructorQuestionBankPage } = await import(
  "@/app/(prowadzacy)/prowadzacy/testy/[id]/pytania/page"
);

function paramsFor(id: string) {
  return Promise.resolve({ id });
}

const pytanie = {
  id: 101,
  body: "Ile wynosi suma kątów w trójkącie?",
  sequence_order: 1,
  answers: [
    { id: 1, body: "180°", is_correct: true },
    { id: 2, body: "90°", is_correct: false },
  ],
};

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
  apiPaged.mockResolvedValue({ data: [], meta: undefined });
});

async function pokazStrone(id = "12") {
  const jsx = await InstructorQuestionBankPage({ params: paramsFor(id) });
  let wynik: ReturnType<typeof render>;
  await act(async () => {
    wynik = render(<InstructorLayout>{jsx}</InstructorLayout>);
  });
  return wynik!;
}

describe("bank pytań /prowadzacy/testy/[id]/pytania pod strażnikiem roli", () => {
  it('rola "volunteer" dostaje "Brak dostępu" i ekran nie woła /admin/tests', async () => {
    api.mockResolvedValue({ role: "volunteer" });

    await pokazStrone("12");

    await waitFor(() =>
      expect(screen.getByText("Brak dostępu")).toBeInTheDocument(),
    );
    expect(api).not.toHaveBeenCalledWith("/admin/tests/12/questions");
  });

  it('rola "instructor" renderuje bank pytań z danych API — ten sam punkt co admin', async () => {
    api.mockImplementation((url: string) => {
      if (url === "/me") return Promise.resolve({ role: "instructor" });
      if (url === "/admin/tests/12/questions")
        return Promise.resolve([pytanie]);
      return Promise.reject(new Error(`nieoczekiwane wywołanie: ${url}`));
    });

    await pokazStrone("12");

    expect(
      await screen.findByText("Ile wynosi suma kątów w trójkącie?", {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith("/admin/tests/12/questions");
  });

  it("dodanie pytania woła TEN SAM punkt i kształt żądania co admin (POST /admin/tests/{id}/questions)", async () => {
    api.mockImplementation(
      (url: string, init?: { method?: string; body?: unknown }) => {
        if (url === "/me") return Promise.resolve({ role: "instructor" });
        if (url === "/admin/tests/12/questions" && !init)
          return Promise.resolve([]);
        if (url === "/admin/tests/12/questions" && init?.method === "POST") {
          return Promise.resolve({
            id: 202,
            body: (init.body as { body: string }).body,
            sequence_order: 1,
            answers: [
              { id: 3, body: "A", is_correct: true },
              { id: 4, body: "B", is_correct: false },
            ],
          });
        }
        return Promise.reject(
          new Error(`nieoczekiwane wywołanie: ${url} ${init?.method ?? "GET"}`),
        );
      },
    );

    await pokazStrone("12");
    await waitFor(() =>
      expect(screen.getByText("Nowe pytanie")).toBeInTheDocument(),
    );

    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText("Treść pytania"),
      "Nowe pytanie testowe",
    );
    await user.type(screen.getByLabelText("Odpowiedź 1"), "A");
    await user.type(screen.getByLabelText("Odpowiedź 2"), "B");
    await user.click(screen.getByRole("button", { name: "Dodaj pytanie" }));

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        "/admin/tests/12/questions",
        expect.objectContaining({
          method: "POST",
          body: {
            body: "Nowe pytanie testowe",
            answers: [
              { body: "A", is_correct: true },
              { body: "B", is_correct: false },
            ],
          },
        }),
      ),
    );
  });

  it("edycja pytania woła TEN SAM punkt co admin (PATCH /admin/questions/{id})", async () => {
    api.mockImplementation(
      (url: string, init?: { method?: string; body?: unknown }) => {
        if (url === "/me") return Promise.resolve({ role: "instructor" });
        if (url === "/admin/tests/12/questions" && !init)
          return Promise.resolve([pytanie]);
        if (url === "/admin/questions/101" && init?.method === "PATCH") {
          return Promise.resolve({ ...pytanie, body: "Zmieniona treść" });
        }
        return Promise.reject(
          new Error(`nieoczekiwane wywołanie: ${url} ${init?.method ?? "GET"}`),
        );
      },
    );

    await pokazStrone("12");
    await waitFor(() =>
      expect(
        screen.getByText("Ile wynosi suma kątów w trójkącie?", {
          exact: false,
        }),
      ).toBeInTheDocument(),
    );

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Edytuj pytanie 1" }),
    );
    await user.click(screen.getByRole("button", { name: "Zapisz pytanie" }));

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        "/admin/questions/101",
        expect.objectContaining({ method: "PATCH" }),
      ),
    );
  });

  it("błąd wczytania pokazuje ten sam stan co admin (nie odmowę roli)", async () => {
    api.mockImplementation((url: string) => {
      if (url === "/me") return Promise.resolve({ role: "instructor" });
      if (url === "/admin/tests/12/questions")
        return Promise.reject(new ApiError(500, "Awaria serwera."));
      return Promise.reject(new Error(`nieoczekiwane wywołanie: ${url}`));
    });

    await pokazStrone("12");

    expect(
      await screen.findByText("Nie udało się otworzyć banku pytań"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Brak dostępu")).not.toBeInTheDocument();
  });
});
