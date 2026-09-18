import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * Pozycja 15 — noga negatywna „osoba bez roli prowadzącego": ekran wątku
 * grupowego stoi pod layoutem panelu prowadzącego (`RequireRole
 * allowedRoles={["instructor"]}`), więc rola spoza tej listy dostaje wspólny
 * ekran „Brak dostępu" zamiast treści wątku, a treść w ogóle się nie renderuje
 * (żadnego wywołania `/threads`).
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

// PanelShell (montowany dla roli dopuszczonej) czyta ścieżkę i router —
// wzorzec z components/layout/__tests__/panelshell-aktywny.test.tsx.
vi.mock("next/navigation", () => ({
  usePathname: () => "/prowadzacy/watek-grupowy",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const { default: InstructorLayout } = await import("@/app/(prowadzacy)/prowadzacy/layout");
const { default: InstructorGroupThreadPage } = await import(
  "@/app/(prowadzacy)/prowadzacy/watek-grupowy/page"
);

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
});

describe("ekran /prowadzacy/watek-grupowy pod strażnikiem roli", () => {
  it('rola "volunteer" dostaje "Brak dostępu", ekran wątku się nie renderuje i nie woła /threads', async () => {
    api.mockResolvedValue({ role: "volunteer" });

    render(
      <InstructorLayout>
        <InstructorGroupThreadPage />
      </InstructorLayout>,
    );

    await waitFor(() => expect(screen.getByText("Brak dostępu")).toBeInTheDocument());
    // Menu wpis "Wątek grupowy" nieobecny: PanelShell (a z nim PanelNav)
    // w ogóle się nie montuje pod odmową — żadnego linku z tą etykietą.
    expect(screen.queryByRole("link", { name: "Wątek grupowy" })).not.toBeInTheDocument();
    expect(screen.queryByText("Wątek grupowy")).not.toBeInTheDocument();
    expect(apiPaged).not.toHaveBeenCalled();
  });

  it('rola "instructor" renderuje ekran wątku grupowego', async () => {
    api.mockResolvedValue({ role: "instructor" });
    apiPaged.mockResolvedValue({ data: [] });

    render(
      <InstructorLayout>
        <InstructorGroupThreadPage />
      </InstructorLayout>,
    );

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Wątek grupowy" })).toBeInTheDocument(),
    );
    // Menu wpis obecny dokładnie raz dla roli dopuszczonej.
    expect(screen.getByRole("link", { name: "Wątek grupowy" })).toBeInTheDocument();
    expect(screen.queryByText("Brak dostępu")).not.toBeInTheDocument();
  });
});
