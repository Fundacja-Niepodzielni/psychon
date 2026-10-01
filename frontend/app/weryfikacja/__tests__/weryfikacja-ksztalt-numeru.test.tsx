import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Próby `/weryfikacja` — tekst z pola formularza wchodzi do ścieżki żądania
 * wyłącznie po sprawdzeniu kształtu numeru. Atrapa siedzi na `api()` z
 * `@/lib/api`: próba liczy WOŁANIA KLIENTA, nie `fetch`, więc strażnik segmentów
 * z samego klienta nie zasłania sprawdzenia kształtu na ekranie.
 */

const apiMock = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: (...args: unknown[]) => apiMock(...args) };
});

const VerificationSearchPage = (await import("@/app/weryfikacja/page")).default;

const NIE_ZNALEZIONO = "Nie znaleziono certyfikatu o podanym numerze.";

const wazny = {
  number: "NP/2026/017",
  status: "valid" as const,
  edition: "2026",
  issued_at: "2026-01-01",
};

beforeEach(() => {
  // Domyślnie żądanie wisi bez odpowiedzi: próba tekstu spoza kształtu ma zawieść
  // na asercji „klient niezawołany”, a nie na braku odpowiedzi atrapy.
  apiMock.mockReset();
  apiMock.mockImplementation(() => new Promise(() => {}));
});

async function wyszukaj(tekst: string) {
  const pole = screen.getByLabelText("Numer certyfikatu");
  await userEvent.clear(pole);
  await userEvent.type(pole, tekst);
  await userEvent.click(screen.getByRole("button", { name: "Sprawdź" }));
}

describe("/weryfikacja — tekst spoza kształtu numeru: zero żądań, stan „nie znaleziono”", () => {
  it.each([
    ["rodzic zamiast numeru", "../me"],
    ["numer z segmentem wstecznym na końcu", "NP/2026/017/.."],
    ["numer z segmentami wstecznymi w środku", "NP/2026/017/../../me"],
    ["numer z doklejonym zapytaniem", "NP/2026/017?x=1"],
    ["numer z doklejonym fragmentem", "NP/2026/017#x"],
    ["numer z ukośnikiem na końcu", "NP/2026/017/"],
    ["numer bez prefiksu", "2026/017"],
  ])("%s", async (_nazwa, tekst) => {
    render(<VerificationSearchPage />);

    await wyszukaj(tekst);

    expect(apiMock).not.toHaveBeenCalled();
    expect(await screen.findByText(NIE_ZNALEZIONO)).toBeInTheDocument();
  });

  it("wynik poprzedniego numeru nie zostaje obok komunikatu o numerze spoza kształtu", async () => {
    apiMock.mockResolvedValueOnce(wazny);
    render(<VerificationSearchPage />);

    await wyszukaj("NP/2026/017");
    expect(await screen.findByText("NP/2026/017")).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledTimes(1);

    await wyszukaj("../me");

    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(NIE_ZNALEZIONO)).toBeInTheDocument();
    expect(screen.queryByText("NP/2026/017")).not.toBeInTheDocument();
  });
});

// Próby zachowania: te przypadki obsługiwał już ekran przed zmianą, więc są
// zielone także na kodzie bez sprawdzenia kształtu.
describe("/weryfikacja — zachowanie bez zmian", () => {
  it("tekst z samych spacji (pusty po obcięciu) nie woła klienta", async () => {
    render(<VerificationSearchPage />);

    await wyszukaj("   ");

    expect(apiMock).not.toHaveBeenCalled();
  });

  it("numer wpisany z białymi znakami na brzegach idzie obcięty", async () => {
    apiMock.mockResolvedValue(wazny);
    render(<VerificationSearchPage />);

    await wyszukaj(" NP/2026/017 ");

    expect(await screen.findByText("NP/2026/017")).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(apiMock).toHaveBeenCalledWith("/verify/NP/2026/017");
  });

  it("numer powyżej tysiąca", async () => {
    apiMock.mockResolvedValue({ ...wazny, number: "NP/2026/1000" });
    render(<VerificationSearchPage />);

    await wyszukaj("NP/2026/1000");

    expect(await screen.findByText("NP/2026/1000")).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(apiMock).toHaveBeenCalledWith("/verify/NP/2026/1000");
  });
});
