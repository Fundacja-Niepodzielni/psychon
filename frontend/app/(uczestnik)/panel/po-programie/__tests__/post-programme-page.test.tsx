import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { expectLabelledControlsAndImages } from "@/app/(uczestnik)/panel/__tests__/a11y-smoke";

/**
 * `/panel/po-programie` — reads `GET /me`; `program_completed_at` decides
 * between the completed card (with links) and the pending card.
 */

const apiMock = vi.fn();

vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return { ...actual, api: (...args: unknown[]) => apiMock(...args) };
});

const { ApiError } = await import("@/lib/api");
const { default: PoProgramiePage } = await import("@/app/(uczestnik)/panel/po-programie/page");

async function renderPage() {
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(<PoProgramiePage />);
  });
  return result!;
}

beforeEach(() => {
  apiMock.mockReset();
});

describe("PoProgramiePage", () => {
  it("renders the heading and the loading state while /me is pending", async () => {
    apiMock.mockReturnValue(new Promise(() => {}));
    await renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Po programie" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Wczytywanie stanu programu…" })).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith("/me");
  });

  it("shows the error state with a retry action on a server error", async () => {
    apiMock.mockRejectedValue(new ApiError({ status: 500, code: "server_error", message: "Serwer nie odpowiada." }));
    await renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent("Serwer nie odpowiada.");
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeInTheDocument();
  });

  it("shows the forbidden state on 403", async () => {
    apiMock.mockRejectedValue(new ApiError({ status: 403, code: "forbidden", message: "Brak." }));
    await renderPage();

    expect(screen.getByText("Nie masz uprawnień do wyświetlenia tego ekranu.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Spróbuj ponownie" })).not.toBeInTheDocument();
  });

  it("shows the pending card while the programme is not completed", async () => {
    apiMock.mockResolvedValue({ role: "volunteer", program_completed_at: null });
    await renderPage();

    expect(screen.getByText("Ekran będzie dostępny po ukończeniu programu.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Certyfikat" })).not.toBeInTheDocument();
  });

  it("shows the completed card with links, including the certificate for a volunteer", async () => {
    apiMock.mockResolvedValue({ role: "volunteer", program_completed_at: "2026-09-20T10:00:00Z" });
    await renderPage();

    expect(screen.getByText("Program ukończony")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Twoje dokumenty" })).toHaveAttribute("href", "/panel/dokumenty");
    expect(screen.getByRole("link", { name: "Certyfikat" })).toHaveAttribute("href", "/panel/certyfikat");
  });

  it("passes the accessibility smoke check after loading", async () => {
    apiMock.mockResolvedValue({ role: "student", program_completed_at: "2026-09-20T10:00:00Z" });
    const { container } = await renderPage();

    expect(screen.queryByRole("link", { name: "Certyfikat" })).not.toBeInTheDocument();
    expectLabelledControlsAndImages(container);
  });
});
