import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { expectLabelledControlsAndImages } from "@/app/(uczestnik)/panel/__tests__/a11y-smoke";

/**
 * `/panel/profil` — own profile from `GET /me`, consents list and the GDPR
 * export card, whose status is polled every 2 s while the export is queued.
 */

const apiMock = vi.fn();

vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return { ...actual, api: (...args: unknown[]) => apiMock(...args) };
});

const { default: ProfilePage } = await import("@/app/(uczestnik)/panel/profil/page");

const PROFILE = {
  id: 17,
  first_name: "Marta",
  last_name: "Demo",
  email: "marta@demo.pl",
  role: "volunteer",
  phone: "+48 600 100 200",
  pesel: "90010112345",
  address: { street: "Testowa 1", city: "Kraków", zip: "30-001" },
  access_expires_at: "2027-02-01T00:00:00Z",
  program_completed_at: null,
  product_group: "psychon",
  consents: [
    {
      type: "regulamin",
      document_version: "v1",
      granted_at: "2026-09-01T08:00:00Z",
      withdrawn_at: null,
      status: "granted" as const,
    },
  ],
};

async function renderPage() {
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(<ProfilePage />);
  });
  return result!;
}

beforeEach(() => {
  apiMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ProfilePage", () => {
  it("renders the heading and the loading text while /me is pending", async () => {
    apiMock.mockReturnValue(new Promise(() => {}));
    await renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Profil" })).toBeInTheDocument();
    expect(screen.getByText("Wczytywanie profilu…")).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith("/me");
  });

  it("shows the load error when /me fails", async () => {
    apiMock.mockRejectedValue(new Error("offline"));
    await renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent("Nie udało się wczytać profilu. Odśwież stronę.");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("prefills the form, keeps the e-mail read-only and lists consents", async () => {
    apiMock.mockResolvedValue(PROFILE);
    await renderPage();

    expect(screen.getByLabelText("Imię")).toHaveValue("Marta");
    expect(screen.getByLabelText("PESEL")).toHaveValue("90010112345");
    expect(screen.getByLabelText("Miejscowość")).toHaveValue("Kraków");
    expect(screen.getByLabelText("Adres e-mail")).toBeDisabled();
    expect(screen.getByText("Regulamin platformy")).toBeInTheDocument();
    expect(screen.getByText("Udzielona")).toBeInTheDocument();
  });

  it("polls a queued export on a 2 s timer until it is ready", async () => {
    vi.useFakeTimers();
    apiMock.mockImplementation((path: string, init?: { method?: string }) => {
      if (path === "/me") return Promise.resolve(PROFILE);
      if (path === "/me/exports" && init?.method === "POST") {
        return Promise.resolve({ id: "ex_1", status: "queued", requested_at: null, completed_at: null, download_url: null });
      }
      return Promise.resolve({ id: "ex_1", status: "ready", requested_at: null, completed_at: null, download_url: "/x" });
    });
    await renderPage();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Przygotuj eksport danych" }));
    });
    expect(screen.getByText("Przygotowywanie…")).toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalledWith("/me/exports/ex_1");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(apiMock).toHaveBeenCalledWith("/me/exports/ex_1");
    expect(screen.getByText("Gotowy")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pobierz plik" })).toBeInTheDocument();
  });

  it("passes the accessibility smoke check on the loaded form", async () => {
    apiMock.mockResolvedValue(PROFILE);
    const { container } = await renderPage();

    // First and last name, e-mail, phone, PESEL, street, city, postcode.
    expect(expectLabelledControlsAndImages(container)).toBe(8);
  });
});
