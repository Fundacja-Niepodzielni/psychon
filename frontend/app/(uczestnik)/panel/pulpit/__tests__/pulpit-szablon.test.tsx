import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * Świadek pulpitu uczestnika (`/panel/pulpit`) po przepięciu na
 * `PageTemplate` — ten sam szablon co `/panel/start`. Mierzy nagłówek z
 * `PageHeader` (powitanie imieniem) i stan błędu/ładowania na jednym API
 * (`/me`, `/courses`), nie zadania sieciowe.
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

// Nazwa tego przypadku obiecuje, że nagłówek POCHODZI z `PageHeader`, nie
// tylko że jakiś `<h1>` z tą treścią istnieje — asercja samej roli/nazwy nie
// odróżnia tego od `<h1>` napisanego ręcznie zamiast przez szablon (zielono
// 2/2 nawet po podmianie `PageTemplate` na zwykły `<div>` z ręcznym `<h1>`).
// Szpieg na module `PageHeader` mierzy WYWOŁANIE komponentu, nie strukturę ani
// klasy DOM (zakaz sprzęgania z układem) — ręcznie napisany `<h1>` nigdy go
// nie wywoła.
vi.mock("@/components/molecules/PageHeader", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/molecules/PageHeader")>();
  return { ...actual, default: vi.fn(actual.default) };
});

const { default: PageHeader } = await import("@/components/molecules/PageHeader");
const { default: PulpitPage } = await import("@/app/(uczestnik)/panel/pulpit/page");

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
  vi.mocked(PageHeader).mockClear();
});

describe("PulpitPage", () => {
  it("nagłówek H1 pochodzi z PageHeader i wita imieniem po wczytaniu (rola student, bez superwizji)", async () => {
    api.mockImplementation((url: string) => {
      if (url === "/me") return Promise.resolve({ first_name: "Zosia", role: "student" });
      if (url === "/courses") return Promise.resolve([]);
      return Promise.reject(new Error(`nieoczekiwane wywołanie: ${url}`));
    });

    render(<PulpitPage />);

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 1, name: "Dzień dobry, Zosia" }),
      ).toBeInTheDocument(),
    );
    // Pozytywna noga: nie samo "nagłówek jest w drzewie" — "TEN
    // KOMPONENT go wyrenderował z tym tytułem". Ręcznie wpisany `<h1>` (bez
    // przejścia przez `PageHeader`) zostawia ten spy niewywołanym i ta linia
    // czerwienieje, mimo że `getByRole` wyżej nadal by przeszło.
    expect(vi.mocked(PageHeader).mock.calls.at(-1)?.[0]).toMatchObject({
      title: "Dzień dobry, Zosia",
    });
    expect(apiPaged).not.toHaveBeenCalled();
  });

  it("noga negatywna: błąd wczytywania pokazuje Alert z przyciskiem ponowienia pod tym samym nagłówkiem", async () => {
    api.mockRejectedValue(new ApiError(500, "Pulpit niedostępny."));
    render(<PulpitPage />);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Pulpit niedostępny."));
    expect(screen.getByRole("heading", { level: 1, name: "Pulpit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeInTheDocument();
  });
});
