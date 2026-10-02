import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";

/**
 * Ekran na prawdziwym module danych; atrapą jest wyłącznie transport
 * (`apiPaged`). Zwykły błąd sieci odrzuca odczyty — scenariusz osiągalny
 * w produkcji (`pobierzKolejkeSpraw` łapie wyjątki per źródło).
 */

const apiPaged = vi.fn();

class ApiErrorAtrapa extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Ekran bierze odczyty i `ApiError` z beczki `@/lib/api`, a moduł danych z `@/lib/api/klient`,
// więc podmieniamy oba moduły na te same atrapy (także funkcję dziedzinową spraw prowadzących).
vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
  ApiError: ApiErrorAtrapa,
  fetchAdminSupervisionCases: () =>
    apiPaged("/admin/supervision/cases").then(({ data }: { data: unknown[] }) => ({ data })),
}));

vi.mock("@/lib/api/klient", () => ({
  apiPaged: (...args: unknown[]) => apiPaged(...args),
  ApiError: ApiErrorAtrapa,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

const { Sprawy } = await import("../Sprawy");

const STRONA_PUSTA = { data: [], meta: { current_page: 1, per_page: 100, total: 0, last_page: 1 } };

beforeEach(() => {
  apiPaged.mockReset();
});

describe("Sprawy na odrzuconych odczytach transportu", () => {
  it("trzy odczyty kolejki odrzucone błędem sieci: stan błędu, „Spróbuj ponownie”, bez „Brak spraw do decyzji”", async () => {
    // Sprawy zgłoszone przez prowadzących (czwarty odczyt, osobna sekcja) odpowiadają pusto.
    apiPaged.mockImplementation((sciezka: string) =>
      sciezka.startsWith("/admin/supervision/cases")
        ? Promise.resolve({ data: [] })
        : Promise.reject(new TypeError("Failed to fetch")),
    );
    const { container } = render(<Sprawy />);

    expect(await screen.findByText("Nie udało się wczytać spraw")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeInTheDocument();
    expect(await screen.findByText("Brak spraw zgłoszonych przez prowadzących.")).toBeInTheDocument();
    expect(screen.queryByText("Brak spraw do decyzji")).toBeNull();
    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector("main")?.getAttribute("data-style-id")).toBe("szablon-lista");
  });

  it("jeden odczyt odrzucony, dwa puste: Notice przy źródle, bez „Brak spraw do decyzji”", async () => {
    apiPaged.mockImplementation((sciezka: string) =>
      sciezka.startsWith("/admin/internship/pending")
        ? Promise.reject(new TypeError("Failed to fetch"))
        : Promise.resolve(STRONA_PUSTA),
    );
    render(<Sprawy />);

    expect(await screen.findByText(/Nie udało się wczytać: „Dyżur”/)).toBeInTheDocument();
    expect(screen.queryByText("Brak spraw do decyzji")).toBeNull();
  });

  it("trzy odczyty udane i puste: „Brak spraw do decyzji” (kontrola dodatnia)", async () => {
    apiPaged.mockResolvedValue(STRONA_PUSTA);
    render(<Sprawy />);

    expect(await screen.findByText("Brak spraw do decyzji")).toBeInTheDocument();
  });

  it("odmowa roli (403) na wszystkich odczytach: nazwa roli administracji w tekście, zero wierszy, zakazane nagłówki nieobecne", async () => {
    apiPaged.mockRejectedValue(new ApiErrorAtrapa(403, "forbidden", "Brak uprawnień."));
    const { container } = render(<Sprawy />);

    await screen.findByRole("heading", { name: "Nie masz dostępu do tego ekranu" });
    const opisy = Array.from(container.querySelectorAll("p")).map((akapit) => akapit.textContent ?? "");
    expect(opisy.some((tekst) => tekst.includes("administracji"))).toBe(true);
    expect(screen.queryAllByRole("link", { name: "Otwórz sprawę" })).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Otwórz najstarszą sprawę" })).toBeNull();
    expect(container.textContent).not.toMatch(/Brak dostępu|Nie masz uprawnień/);
    for (const wywolanie of apiPaged.mock.calls) expect(String(wywolanie[0])).not.toContain("/instructor/");
  });
});
