import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * Noga negatywna „osoba bez roli prowadzącego": ekran skrzynki pytań stoi
 * pod layoutem panelu prowadzącego (`RequireRole allowedRoles={["instructor"]}`),
 * więc rola spoza tej listy dostaje wspólny ekran „Brak dostępu" zamiast
 * treści skrzynki, a treść w ogóle się nie renderuje (żadnego wywołania
 * `/instructor/questions`). Druga próba: rola dopuszczona dostaje nagłówek
 * `ListTemplate`/`PageHeader` i listę pytań po wczytaniu.
 */

const api = vi.fn();
const apiPaged = vi.fn();

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

vi.mock("@/lib/api", () => ({
  api: (...args: unknown[]) => api(...args),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
  ApiError,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/prowadzacy/pytania",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const { default: InstructorLayout } = await import("@/app/(prowadzacy)/prowadzacy/layout");
const { default: InstructorQuestionsPage } = await import(
  "@/app/(prowadzacy)/prowadzacy/pytania/page"
);

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
});

describe("ekran /prowadzacy/pytania pod strażnikiem roli", () => {
  it('rola "volunteer" dostaje "Brak dostępu", ekran skrzynki się nie renderuje i nie woła /instructor/questions', async () => {
    api.mockResolvedValue({ role: "volunteer" });

    render(
      <InstructorLayout>
        <InstructorQuestionsPage />
      </InstructorLayout>,
    );

    await waitFor(() => expect(screen.getByText("Brak dostępu")).toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "Pytania" })).not.toBeInTheDocument();
    expect(apiPaged).not.toHaveBeenCalled();
  });

  it('rola "instructor" renderuje nagłówek i listę pytań po wczytaniu', async () => {
    api.mockResolvedValue({ role: "instructor" });
    apiPaged.mockResolvedValue({
      data: [],
      meta: { current_page: 1, last_page: 1, per_page: 20, total: 0, extra: { unanswered: 0 } },
    });

    render(
      <InstructorLayout>
        <InstructorQuestionsPage />
      </InstructorLayout>,
    );

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Pytania" })).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByText("Nie masz pytań oczekujących na odpowiedź.")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Brak dostępu")).not.toBeInTheDocument();
  });
});
