import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { expectLabelledControlsAndImages } from "@/app/(uczestnik)/panel/__tests__/a11y-smoke";

/**
 * `/panel/start` — onboarding screen. `GET /onboarding` drives the screen,
 * `GET /me` only decides the admin edit button and the completion notice.
 */

const apiMock = vi.fn();

vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return { ...actual, api: (...args: unknown[]) => apiMock(...args) };
});

const { ApiError } = await import("@/lib/api");
const { default: ParticipantStartPage } = await import("@/app/(uczestnik)/panel/start/page");

const ONBOARDING = {
  video: { title: "Powitanie", url: null, caption: "Film pojawi się po starcie edycji." },
  program: { title: "Przebieg programu", body: "Dziesięć etapów nauki." },
  expectations: { title: "Czego oczekujemy", body: "Regularnej pracy." },
  updated_at: "2026-09-01T08:00:00Z",
};

function respond(me: unknown) {
  apiMock.mockImplementation((path: string) =>
    path === "/onboarding" ? Promise.resolve(ONBOARDING) : Promise.resolve(me),
  );
}

beforeEach(() => {
  apiMock.mockReset();
});

describe("ParticipantStartPage", () => {
  it("renders the page heading", () => {
    apiMock.mockReturnValue(new Promise(() => {}));
    render(<ParticipantStartPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Zacznij tutaj" })).toBeInTheDocument();
  });

  it("shows the loading state while the content is pending", () => {
    apiMock.mockReturnValue(new Promise(() => {}));
    render(<ParticipantStartPage />);

    expect(screen.getByRole("status", { name: "Wczytywanie ekranu startowego…" })).toBeInTheDocument();
  });

  it("shows the error state with a retry action when the content fails to load", async () => {
    apiMock.mockRejectedValue(new ApiError({ status: 500, code: "server_error", message: "Błąd." }));
    render(<ParticipantStartPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Nie udało się wczytać ekranu. Sprawdź połączenie i spróbuj ponownie.",
    );
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeInTheDocument();
  });

  it("renders the onboarding sections for a participant without admin controls", async () => {
    respond({ role: "volunteer", program_completed_at: null });
    render(<ParticipantStartPage />);

    expect(await screen.findByText("Dziesięć etapów nauki.")).toBeInTheDocument();
    expect(screen.getByText("Regularnej pracy.")).toBeInTheDocument();
    expect(screen.getByText("Film pojawi się po starcie edycji.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edytuj treść" })).not.toBeInTheDocument();
    expect(screen.queryByText("Przejdź do ekranu po programie")).not.toBeInTheDocument();
  });

  it("links to the post-programme screen once the programme is completed", async () => {
    respond({ role: "volunteer", program_completed_at: "2026-09-20T10:00:00Z" });
    render(<ParticipantStartPage />);

    expect(await screen.findByRole("link", { name: "Przejdź do ekranu po programie" })).toHaveAttribute(
      "href",
      "/panel/po-programie",
    );
  });

  it("passes the accessibility smoke check after loading", async () => {
    respond({ role: "volunteer", program_completed_at: null });
    const { container } = render(<ParticipantStartPage />);

    await screen.findByText("Dziesięć etapów nauki.");
    expectLabelledControlsAndImages(container);
  });
});
