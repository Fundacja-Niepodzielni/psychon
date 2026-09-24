import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Próby `/weryfikacja` — wyszukiwarka certyfikatu po numerze.
 * Nieudane ponowienie wyszukiwania nie ma prawa zabrać już wczytanego
 * wyniku — komunikat awarii idzie obok karty certyfikatu, nie zamiast niej.
 */

const apiMock = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: (...args: unknown[]) => apiMock(...args) };
});

const { ApiError } = await import("@/lib/api");
const VerificationSearchPage = (await import("@/app/weryfikacja/page")).default;

beforeEach(() => {
  apiMock.mockReset();
});

async function wyszukaj(numer: string) {
  const pole = screen.getByLabelText("Numer certyfikatu");
  await userEvent.clear(pole);
  await userEvent.type(pole, numer);
  await userEvent.click(screen.getByRole("button", { name: "Sprawdź" }));
}

const wazny = {
  number: "NP/2026/001",
  status: "valid" as const,
  edition: "2026",
  issued_at: "2026-01-01",
};

describe("/weryfikacja — wynik i błąd łączenia", () => {
  it("pokazuje kartę certyfikatu po udanym wyszukaniu", async () => {
    apiMock.mockResolvedValue(wazny);
    render(<VerificationSearchPage />);

    await wyszukaj("NP/2026/001");

    expect(await screen.findByText("NP/2026/001")).toBeInTheDocument();
  });

  it("nie znaleziono: komunikat błędu, bez karty wyniku", async () => {
    apiMock.mockRejectedValue(new ApiError({ status: 404, code: "not_found", message: "Nie znaleziono" }));
    render(<VerificationSearchPage />);

    await wyszukaj("NP/2026/999");

    expect(
      await screen.findByText("Nie znaleziono certyfikatu o podanym numerze."),
    ).toBeInTheDocument();
  });

  it("nieudane ponowne wyszukanie NIE kasuje już wczytanej karty certyfikatu", async () => {
    apiMock.mockResolvedValueOnce(wazny);
    render(<VerificationSearchPage />);

    await wyszukaj("NP/2026/001");
    expect(await screen.findByText("NP/2026/001")).toBeInTheDocument();

    apiMock.mockRejectedValueOnce(
      new ApiError({ status: 500, code: "server_error", message: "Awaria" }),
    );
    await wyszukaj("NP/2026/002");

    // Karta poprzedniego, poprawnego wyniku zostaje widoczna…
    expect(screen.getByText("NP/2026/001")).toBeInTheDocument();
    // …a komunikat awarii pojawia się obok niej.
    expect(
      await screen.findByText("Nie udało się połączyć z serwerem. Spróbuj ponownie za chwilę."),
    ).toBeInTheDocument();
  });

  it("wyszukanie nieznanego numeru po udanym wyniku chowa poprzednią kartę i pokazuje komunikat nie znaleziono", async () => {
    apiMock.mockResolvedValueOnce(wazny);
    render(<VerificationSearchPage />);

    await wyszukaj("NP/2026/001");
    expect(await screen.findByText("NP/2026/001")).toBeInTheDocument();

    apiMock.mockRejectedValueOnce(
      new ApiError({ status: 404, code: "not_found", message: "Nie znaleziono" }),
    );
    await wyszukaj("NP/2026/999");

    expect(
      await screen.findByText("Nie znaleziono certyfikatu o podanym numerze."),
    ).toBeInTheDocument();
    // Poprzedni wynik dotyczył innego numeru — nowa, ostateczna odpowiedź
    // (nie znaleziono) go zastępuje, nie zostaje obok.
    expect(screen.queryByText("NP/2026/001")).not.toBeInTheDocument();
  });

  it("ponowienie po awarii wywołuje kolejne zapytanie o ten sam numer", async () => {
    apiMock.mockRejectedValueOnce(
      new ApiError({ status: 500, code: "server_error", message: "Awaria" }),
    );
    render(<VerificationSearchPage />);

    await wyszukaj("NP/2026/003");
    await screen.findByText("Nie udało się połączyć z serwerem. Spróbuj ponownie za chwilę.");
    expect(apiMock).toHaveBeenCalledTimes(1);

    apiMock.mockResolvedValueOnce({ ...wazny, number: "NP/2026/003" });
    await userEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));

    expect(await screen.findByText("NP/2026/003")).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledTimes(2);
    expect(apiMock).toHaveBeenLastCalledWith("/verify/NP/2026/003");
  });
});
