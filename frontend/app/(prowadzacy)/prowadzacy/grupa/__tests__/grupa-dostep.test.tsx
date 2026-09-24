import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * Group screen of the instructor panel (`/prowadzacy/grupa`) under the panel
 * layout (`RequireRole allowedRoles={["instructor"]}`), following the pattern
 * of `watek-grupowy-dostep.test.tsx`. Measures the role guard, the loaded
 * state (members from `GET /instructor/group`) and the load-error state.
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
  createInstructorCase: vi.fn(),
  endSession: vi.fn(),
  ApiError,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/prowadzacy/grupa",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const { default: InstructorLayout } = await import("@/app/(prowadzacy)/prowadzacy/layout");
const { default: InstructorGroupPage } = await import(
  "@/app/(prowadzacy)/prowadzacy/grupa/page"
);

const group = {
  members: [
    {
      id: 17,
      first_name: "Marta",
      last_name: "Demo",
      progress: {
        courses_done: 2,
        courses_total: 5,
        hours_accepted: "12.5",
        supervision_present: 1,
        workshop_done: false,
      },
    },
  ],
  slots: [],
};

function renderScreen() {
  return render(
    <InstructorLayout>
      <InstructorGroupPage />
    </InstructorLayout>,
  );
}

function routeApi(groupResponse: () => Promise<unknown>) {
  api.mockImplementation((url: string) => {
    if (url === "/me") return Promise.resolve({ role: "instructor" });
    if (url === "/instructor/group") return groupResponse();
    return Promise.reject(new Error(`unexpected call: ${url}`));
  });
}

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
  apiPaged.mockResolvedValue({
    data: [],
    meta: { current_page: 1, per_page: 50, total: 0, last_page: 1 },
  });
});

describe("ekran /prowadzacy/grupa pod strażnikiem roli", () => {
  it('rola "volunteer" dostaje "Brak dostępu" i ekran nie woła /instructor/group', async () => {
    api.mockResolvedValue({ role: "volunteer" });

    renderScreen();

    await waitFor(() => expect(screen.getByText("Brak dostępu")).toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "Moja grupa" })).not.toBeInTheDocument();
    expect(api.mock.calls.map(([url]) => url)).toEqual(["/me"]);
    expect(apiPaged).not.toHaveBeenCalled();
  });

  it('rola "instructor" widzi uczestników grupy z /instructor/group', async () => {
    routeApi(() => Promise.resolve(group));

    renderScreen();

    expect(await screen.findByRole("cell", { name: "Marta Demo" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Moja grupa" })).toBeInTheDocument();
    expect(screen.getByText("12.5 h")).toBeInTheDocument();
    expect(screen.getByText("Nie utworzyłeś/aś jeszcze żadnego terminu.")).toBeInTheDocument();
    expect(apiPaged).toHaveBeenCalledWith("/instructor/reliability");
  });

  it("błąd wczytania grupy pokazuje komunikat serwera i przycisk ponowienia", async () => {
    routeApi(() => Promise.reject(new ApiError(500, "Serwer niedostępny.")));

    renderScreen();

    expect(await screen.findByText("Serwer niedostępny.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeInTheDocument();
    expect(screen.queryByText("Brak dostępu")).not.toBeInTheDocument();
  });
});
