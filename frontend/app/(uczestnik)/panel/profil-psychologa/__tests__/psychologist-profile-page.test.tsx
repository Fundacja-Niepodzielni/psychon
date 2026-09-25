import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { expectLabelledControlsAndImages } from "@/app/(uczestnik)/panel/__tests__/a11y-smoke";

/**
 * `/panel/profil-psychologa` — the page renders `PsychologistProfileForm`,
 * which loads `GET /psychologist-profile`. The volunteer-only role gate lives
 * in the layout and is covered by the shared denial-screen suite.
 */

const apiMock = vi.fn();

vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return { ...actual, api: (...args: unknown[]) => apiMock(...args) };
});

const { ApiError } = await import("@/lib/api");
const { default: PsychologistProfilePage } = await import(
  "@/app/(uczestnik)/panel/profil-psychologa/page"
);

const PROFILE = {
  eligible: true,
  specializations: ["wsparcie w kryzysie"],
  approach: "poznawczo-behawioralny",
  city: "Kraków",
  bio: null,
  publication_consent_granted: false,
  status: "draft" as const,
  return_reason: null,
  documents: [],
  created_at: "2026-09-01T08:00:00Z",
  updated_at: "2026-09-01T08:00:00Z",
};

async function renderPage() {
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(<PsychologistProfilePage />);
  });
  return result!;
}

beforeEach(() => {
  apiMock.mockReset();
});

describe("PsychologistProfilePage", () => {
  it("renders the heading and the loading status while the profile is pending", async () => {
    apiMock.mockReturnValue(new Promise(() => {}));
    await renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Profil psychologa" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Wczytywanie…");
    expect(apiMock).toHaveBeenCalledWith("/psychologist-profile");
  });

  it("shows the API error message when the profile fails to load", async () => {
    apiMock.mockRejectedValue(new ApiError({ status: 500, code: "server_error", message: "Serwer nie odpowiada." }));
    await renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent("Serwer nie odpowiada.");
    expect(screen.getByRole("heading", { level: 1, name: "Profil psychologa" })).toBeInTheDocument();
  });

  it("explains that the application opens after the programme when not eligible", async () => {
    apiMock.mockResolvedValue({ ...PROFILE, eligible: false });
    await renderPage();

    expect(screen.getByText(/będzie dostępny po\s+ukończeniu całego programu/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("renders the editable draft with its saved values and a blocked submit", async () => {
    apiMock.mockResolvedValue(PROFILE);
    await renderPage();

    expect(screen.getByText("Wersja robocza")).toBeInTheDocument();
    expect(screen.getByLabelText("Specjalizacje")).toHaveValue("wsparcie w kryzysie");
    expect(screen.getByLabelText("Nurt terapeutyczny")).toHaveValue("poznawczo-behawioralny");
    expect(screen.getByLabelText("Miasto")).toHaveValue("Kraków");
    expect(screen.getByText("Nie dodano jeszcze żadnych załączników.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Złóż wniosek" })).toBeDisabled();
  });

  it("passes the accessibility smoke check on the editable form", async () => {
    apiMock.mockResolvedValue(PROFILE);
    const { container } = await renderPage();

    // Three text fields, bio, attachment type, file input and consent checkbox.
    expect(expectLabelledControlsAndImages(container)).toBe(7);
  });
});
