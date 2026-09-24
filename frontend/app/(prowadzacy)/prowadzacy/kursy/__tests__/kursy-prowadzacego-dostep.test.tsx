import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * Course list of the instructor panel (`/prowadzacy/kursy`) under the panel
 * layout (`RequireRole allowedRoles={["instructor"]}`), following the pattern
 * of `watek-grupowy-dostep.test.tsx`. The list behaviour itself is measured
 * in `kursy-prowadzacego-lista.test.tsx`; this file covers only the guard.
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
  endSession: vi.fn(),
  ApiError,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/prowadzacy/kursy",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const { default: InstructorLayout } = await import("@/app/(prowadzacy)/prowadzacy/layout");
const { default: InstructorCoursesPage } = await import(
  "@/app/(prowadzacy)/prowadzacy/kursy/page"
);

function renderScreen() {
  return render(
    <InstructorLayout>
      <InstructorCoursesPage />
    </InstructorLayout>,
  );
}

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
  apiPaged.mockResolvedValue({ data: [], meta: undefined });
});

describe("ekran /prowadzacy/kursy pod strażnikiem roli", () => {
  it('rola "volunteer" dostaje "Brak dostępu" i ekran nie woła /instructor/courses', async () => {
    api.mockResolvedValue({ role: "volunteer" });

    renderScreen();

    await waitFor(() => expect(screen.getByText("Brak dostępu")).toBeInTheDocument());
    expect(screen.queryByRole("heading", { level: 1, name: "Kursy" })).not.toBeInTheDocument();
    expect(api.mock.calls.map(([url]) => url)).toEqual(["/me"]);
    expect(apiPaged).not.toHaveBeenCalled();
  });

  it('rola "instructor" widzi listę kursów z /instructor/courses', async () => {
    api.mockImplementation((url: string) => {
      if (url === "/me") return Promise.resolve({ role: "instructor" });
      if (url === "/instructor/courses") {
        return Promise.resolve([
          { id: 4, slug: "praca-z-emocjami", title: "Praca z emocjami", sequence_order: 1 },
        ]);
      }
      return Promise.reject(new Error(`unexpected call: ${url}`));
    });

    renderScreen();

    expect(await screen.findByRole("link", { name: "Praca z emocjami" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Kursy" })).toBeInTheDocument();
    expect(screen.queryByText("Brak dostępu")).not.toBeInTheDocument();
  });
});
