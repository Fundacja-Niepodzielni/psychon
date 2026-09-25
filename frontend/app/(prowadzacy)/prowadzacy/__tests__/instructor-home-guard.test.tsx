import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * Start screen of the instructor panel (`/prowadzacy`) mounted under the
 * panel layout (`RequireRole allowedRoles={["instructor"]}`), following the
 * pattern of `watek-grupowy-dostep.test.tsx`. A role outside the list gets
 * the shared "Brak dostępu" screen and the start tiles never fetch; the
 * allowed role gets the heading and the counters read from the API.
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
  usePathname: () => "/prowadzacy",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const { default: InstructorLayout } = await import("@/app/(prowadzacy)/prowadzacy/layout");
const { default: InstructorHomePage } = await import("@/app/(prowadzacy)/prowadzacy/page");

const group = {
  members: [
    { id: 1, first_name: "Ana", last_name: "Demo" },
    { id: 2, first_name: "Olek", last_name: "Demo" },
  ],
  slots: [],
};

function renderScreen() {
  return render(
    <InstructorLayout>
      <InstructorHomePage />
    </InstructorLayout>,
  );
}

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
});

describe("/prowadzacy under the instructor role guard", () => {
  it('role "volunteer" gets "Brak dostępu" and the screen fetches neither the group nor the questions', async () => {
    api.mockResolvedValue({ role: "volunteer" });

    renderScreen();

    await waitFor(() => expect(screen.getByText("Brak dostępu")).toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "Panel prowadzącego" })).not.toBeInTheDocument();
    expect(api.mock.calls.map(([url]) => url)).toEqual(["/me"]);
    expect(apiPaged).not.toHaveBeenCalled();
  });

  it('role "instructor" sees the heading and counters from the group and questions endpoints', async () => {
    api.mockImplementation((url: string) => {
      if (url === "/me") return Promise.resolve({ role: "instructor" });
      if (url === "/instructor/group") return Promise.resolve(group);
      return Promise.reject(new Error(`unexpected call: ${url}`));
    });
    apiPaged.mockResolvedValue({
      data: [],
      meta: { current_page: 1, per_page: 25, total: 0, last_page: 1, extra: { unanswered: 3 } },
    });

    renderScreen();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Panel prowadzącego" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("osób w grupie")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(await screen.findByText("pytań czeka")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.queryByText("Brak dostępu")).not.toBeInTheDocument();
  });
});
