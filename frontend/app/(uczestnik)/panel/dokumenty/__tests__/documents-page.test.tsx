import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { expectLabelledControlsAndImages } from "@/app/(uczestnik)/panel/__tests__/a11y-smoke";

/**
 * `/panel/dokumenty` — generated documents list plus one generation card per
 * document type, both fed by a single `fetchDocuments()` call.
 */

const fetchDocuments = vi.fn();

vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return {
    ...actual,
    fetchDocuments: (...args: unknown[]) => fetchDocuments(...args),
    generateDocument: vi.fn(),
    downloadFile: vi.fn(),
  };
});

const { ApiError } = await import("@/lib/api");
const { default: DocumentsPage } = await import("@/app/(uczestnik)/panel/dokumenty/page");

const LOADED = {
  documents: [
    {
      id: 3,
      type: "volunteer_agreement" as const,
      number: "NP/PW/2026/003",
      generated_at: "2026-09-10T08:00:00Z",
      signature_status: "none" as const,
      download_url: "/documents/3/download",
    },
  ],
  availableTypes: {
    volunteer_agreement: { available: false, reason: "already_generated" as const, document_id: 3 },
    internship_certificate: {
      available: false,
      reason: "conditions_not_met" as const,
      hours_accepted: "41.5",
      hours_required: "72",
    },
  },
};

async function renderPage() {
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(<DocumentsPage />);
  });
  return result!;
}

beforeEach(() => {
  fetchDocuments.mockReset();
});

describe("DocumentsPage", () => {
  it("renders the heading and the loading state while documents are pending", async () => {
    fetchDocuments.mockReturnValue(new Promise(() => {}));
    await renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Dokumenty" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Wczytywanie dokumentów…" })).toBeInTheDocument();
  });

  it("shows the error state with a retry action when loading fails", async () => {
    fetchDocuments.mockRejectedValue(
      new ApiError({ status: 500, code: "server_error", message: "Serwer nie odpowiada." }),
    );
    await renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent("Nie udało się wczytać dokumentów");
    expect(screen.getByRole("alert")).toHaveTextContent("Serwer nie odpowiada.");
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeInTheDocument();
  });

  it("shows the forbidden state instead of an error on 403", async () => {
    fetchDocuments.mockRejectedValue(new ApiError({ status: 403, code: "forbidden", message: "Brak." }));
    await renderPage();

    expect(screen.getByText("Nie masz uprawnień do wyświetlenia dokumentów.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Spróbuj ponownie" })).not.toBeInTheDocument();
  });

  it("lists issued documents and explains why a type is not yet available", async () => {
    fetchDocuments.mockResolvedValue(LOADED);
    await renderPage();

    expect(screen.getByRole("cell", { name: "NP/PW/2026/003" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pobierz dokument NP/PW/2026/003" })).toBeInTheDocument();
    expect(screen.getByText("Wygenerowano")).toBeInTheDocument();
    expect(screen.getByText(/Godziny stażu zaakceptowane: 41.5 z 72 wymaganych/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Wygeneruj: Zaświadczenie o stażu" })).toBeDisabled();
  });

  it("passes the accessibility smoke check after loading", async () => {
    fetchDocuments.mockResolvedValue(LOADED);
    const { container } = await renderPage();

    expectLabelledControlsAndImages(container);
  });
});
