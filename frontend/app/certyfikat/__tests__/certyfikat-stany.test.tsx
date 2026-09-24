import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Próby `/certyfikat?number=…|token=…` — lądowanie z linku/QR.
 * Nieudane przeładowanie (druga odpowiedź serwera to błąd) po już wczytanym
 * wyniku nie ma prawa go zabrać.
 */

let query = "";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(query),
}));

const apiMock = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: (...args: unknown[]) => apiMock(...args) };
});

const { ApiError } = await import("@/lib/api");
const CertificateLandingPage = (await import("@/app/certyfikat/page")).default;

beforeEach(() => {
  apiMock.mockReset();
  query = "";
});

const wazny = {
  number: "NP/2026/001",
  status: "valid" as const,
  edition: "2026",
  issued_at: "2026-01-01",
};

describe("/certyfikat — stany", () => {
  it("stan pusty: brak numeru/tokenu w adresie pokazuje komunikat z linkiem do wyszukiwarki, bez wołania API", async () => {
    query = "";
    render(<CertificateLandingPage />);

    expect(
      await screen.findByText("Brak numeru certyfikatu w adresie. Przejdź do", { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "wyszukiwarki weryfikacji" })).toHaveAttribute(
      "href",
      "/weryfikacja",
    );
    expect(apiMock).not.toHaveBeenCalled();
  });

  it("pokazuje kartę certyfikatu po udanym wczytaniu z numeru w adresie", async () => {
    query = "number=NP/2026/001";
    apiMock.mockResolvedValue(wazny);
    render(<CertificateLandingPage />);

    expect(await screen.findByText("NP/2026/001")).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith("/verify/NP/2026/001");
  });

  it("nie znaleziono: komunikat błędu, bez karty wyniku, bez utkniętego szkieletu ładowania", async () => {
    query = "number=NP/2026/999";
    apiMock.mockRejectedValue(new ApiError({ status: 404, code: "not_found", message: "Nie znaleziono" }));
    render(<CertificateLandingPage />);

    expect(
      await screen.findByText("Nie znaleziono certyfikatu o podanym numerze."),
    ).toBeInTheDocument();
    // Po rozstrzygnięciu żądania stan ładowania musi zejść — inaczej szkielet
    // zostaje na ekranie obok komunikatu na zawsze.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("udane wczytanie numeru po wcześniejszym numerze nieznanym chowa poprzedni komunikat nie znaleziono", async () => {
    query = "number=NP/2026/999";
    apiMock.mockRejectedValueOnce(new ApiError({ status: 404, code: "not_found", message: "Nie znaleziono" }));
    const { rerender } = render(<CertificateLandingPage />);

    expect(
      await screen.findByText("Nie znaleziono certyfikatu o podanym numerze."),
    ).toBeInTheDocument();

    query = "number=NP/2026/001";
    apiMock.mockResolvedValueOnce(wazny);
    rerender(<CertificateLandingPage />);

    expect(await screen.findByText("NP/2026/001")).toBeInTheDocument();
    expect(
      screen.queryByText("Nie znaleziono certyfikatu o podanym numerze."),
    ).not.toBeInTheDocument();
  });

  it("udane wczytanie numeru po wcześniejszej awarii chowa poprzedni komunikat awarii", async () => {
    query = "number=NP/2026/001";
    apiMock.mockRejectedValueOnce(new ApiError({ status: 500, code: "server_error", message: "Awaria" }));
    const { rerender } = render(<CertificateLandingPage />);

    expect(
      await screen.findByText("Nie udało się połączyć z serwerem. Spróbuj ponownie za chwilę."),
    ).toBeInTheDocument();

    query = "number=NP/2026/002";
    apiMock.mockResolvedValueOnce({ ...wazny, number: "NP/2026/002" });
    rerender(<CertificateLandingPage />);

    expect(await screen.findByText("NP/2026/002")).toBeInTheDocument();
    expect(
      screen.queryByText("Nie udało się połączyć z serwerem. Spróbuj ponownie za chwilę."),
    ).not.toBeInTheDocument();
  });

  it("wczytanie numeru nieznanego po udanym wyniku chowa poprzednią kartę i pokazuje nie znaleziono", async () => {
    query = "number=NP/2026/001";
    apiMock.mockResolvedValueOnce(wazny);
    const { rerender } = render(<CertificateLandingPage />);

    expect(await screen.findByText("NP/2026/001")).toBeInTheDocument();

    query = "number=NP/2026/999";
    apiMock.mockRejectedValueOnce(new ApiError({ status: 404, code: "not_found", message: "Nie znaleziono" }));
    rerender(<CertificateLandingPage />);

    expect(
      await screen.findByText("Nie znaleziono certyfikatu o podanym numerze."),
    ).toBeInTheDocument();
    expect(screen.queryByText("NP/2026/001")).not.toBeInTheDocument();
  });

  it("ponowienie w trakcie, kiedy karta jest już widoczna, nie pokazuje szkieletu ładowania obok niej", async () => {
    query = "number=NP/2026/001";
    apiMock.mockResolvedValueOnce(wazny);
    const { rerender } = render(<CertificateLandingPage />);
    expect(await screen.findByText("NP/2026/001")).toBeInTheDocument();

    query = "number=NP/2026/002";
    apiMock.mockRejectedValueOnce(new ApiError({ status: 500, code: "server_error", message: "Awaria" }));
    rerender(<CertificateLandingPage />);
    await screen.findByText("Nie udało się połączyć z serwerem. Spróbuj ponownie za chwilę.");
    // Karta z pierwszego, udanego wyniku wciąż jest na ekranie (osobny przypadek to sprawdza).

    let uwolnijDrugaProbe: (wartosc: unknown) => void = () => {};
    apiMock.mockImplementationOnce(
      () => new Promise((resolve) => { uwolnijDrugaProbe = resolve; }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));

    // W trakcie ponowienia (przed rozstrzygnięciem) treść już wczytanej karty
    // jest na ekranie i NIE towarzyszy jej szkielet ładowania.
    expect(screen.getByText("NP/2026/001")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    await act(async () => {
      uwolnijDrugaProbe({ ...wazny, number: "NP/2026/002" });
    });
  });

  it("ponowienie po awarii wywołuje kolejne zapytanie o tę samą ścieżkę", async () => {
    query = "number=NP/2026/003";
    apiMock.mockRejectedValueOnce(new ApiError({ status: 500, code: "server_error", message: "Awaria" }));
    render(<CertificateLandingPage />);

    await screen.findByText("Nie udało się połączyć z serwerem. Spróbuj ponownie za chwilę.");
    expect(apiMock).toHaveBeenCalledTimes(1);

    apiMock.mockResolvedValueOnce({ ...wazny, number: "NP/2026/003" });
    await userEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));

    expect(await screen.findByText("NP/2026/003")).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledTimes(2);
  });

  it("ponowienie po awarii pokazuje ponownie szkielet ładowania, dopóki druga odpowiedź się nie rozstrzygnie", async () => {
    query = "number=NP/2026/004";
    apiMock.mockRejectedValueOnce(new ApiError({ status: 500, code: "server_error", message: "Awaria" }));
    render(<CertificateLandingPage />);

    await screen.findByText("Nie udało się połączyć z serwerem. Spróbuj ponownie za chwilę.");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    let uwolnijDrugaProbe: (wartosc: unknown) => void = () => {};
    apiMock.mockImplementationOnce(
      () => new Promise((resolve) => { uwolnijDrugaProbe = resolve; }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));

    // Druga próba jeszcze trwa (obietnica celowo nierozstrzygnięta) — szkielet
    // ładowania MUSI być widoczny, dopóki odpowiedź nie nadejdzie. To jest
    // pozytywna asercja obecności, nie tylko brak: sam brak nigdy nie
    // odróżniłby działającego szkieletu od szkieletu, który nie pokazuje się
    // wcale.
    expect(screen.getByRole("status")).toBeInTheDocument();

    await act(async () => {
      uwolnijDrugaProbe({ ...wazny, number: "NP/2026/004" });
    });

    expect(await screen.findByText("NP/2026/004")).toBeInTheDocument();
  });

  it("druga odpowiedź serwera to błąd po już wczytanym wyniku NIE kasuje wczytanej karty", async () => {
    query = "number=NP/2026/001";
    apiMock.mockResolvedValueOnce(wazny);
    const { rerender } = render(<CertificateLandingPage />);

    expect(await screen.findByText("NP/2026/001")).toBeInTheDocument();

    query = "number=NP/2026/002";
    apiMock.mockRejectedValueOnce(new ApiError({ status: 500, code: "server_error", message: "Awaria" }));
    rerender(<CertificateLandingPage />);

    // Komunikat awarii z drugiej (nieudanej) próby się pojawia — dopiero to
    // dowodzi, że druga odpowiedź faktycznie już rozstrzygnęła się na ekranie.
    expect(
      await screen.findByText("Nie udało się połączyć z serwerem. Spróbuj ponownie za chwilę."),
    ).toBeInTheDocument();
    // …a karta poprzedniego, poprawnego wyniku ZOSTAJE widoczna obok niego,
    // sprawdzone PO rozstrzygnięciu awarii, nie przed nim.
    expect(screen.getByText("NP/2026/001")).toBeInTheDocument();
  });
});
