import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Próby `/certyfikat?number=…|token=…` — wartość z adresu strony wchodzi do
 * ścieżki żądania wyłącznie po sprawdzeniu kształtu. Atrapa siedzi na
 * `api()` z `@/lib/api`: próba liczy WOŁANIA KLIENTA, nie `fetch` — dzięki
 * temu nie zasłania jej strażnik segmentów z samego klienta (`..` zatrzymałby
 * się tam nawet bez sprawdzenia kształtu na ekranie).
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

const CertificateLandingPage = (await import("@/app/certyfikat/page")).default;

const NIE_ZNALEZIONO = "Nie znaleziono certyfikatu o podanym numerze.";
// Jawnie sztuczna wartość o długości tokenu z kodu QR (40 liter i cyfr), zbudowana
// z powtórzenia krótkiego wzoru — nie jest odczytem żadnego prawdziwego tokenu.
const TOKEN_40 = "Test0".repeat(8);

const wazny = {
  number: "NP/2026/017",
  status: "valid" as const,
  edition: "2026",
  issued_at: "2026-01-01",
};

beforeEach(() => {
  // Domyślnie żądanie wisi bez odpowiedzi: próba wartości spoza kształtu ma
  // zawieść na asercji „klient niezawołany”, a nie na braku odpowiedzi atrapy.
  apiMock.mockReset();
  apiMock.mockImplementation(() => new Promise(() => {}));
  query = "";
});

describe("/certyfikat — wartość spoza kształtu: zero żądań, stan „nie znaleziono”", () => {
  it.each([
    ["segment wsteczny zakodowany w numerze", "number=..%2Fadmin%2Fusers"],
    ["numer z segmentami wstecznymi na końcu", "number=NP/2026/017/../../me"],
    ["token będący samymi kropkami", "token=.."],
    ["token z 39 znaków", `token=${"a".repeat(39)}`],
    ["token z 41 znaków", `token=${"a".repeat(41)}`],
    ["token z 40 znaków z ukośnikiem", `token=${"a".repeat(20)}/${"a".repeat(19)}`],
    ["numer ze znakiem nowego wiersza w środku", "number=NP/2026/0%0A01"],
    ["numer z doklejonym zapytaniem", "number=NP/2026/017%3Fx%3D1"],
    ["numer z samych spacji", "number=%20%20"],
    ["niepoprawny token przy poprawnym numerze (token ma pierwszeństwo)", `token=..&number=NP/2026/017`],
  ])("%s", async (_nazwa, zapytanie) => {
    query = zapytanie;

    render(<CertificateLandingPage />);

    // Efekt strony wykonał się już w `render()`: klient jest niezawołany.
    expect(apiMock).not.toHaveBeenCalled();
    expect(await screen.findByText(NIE_ZNALEZIONO)).toBeInTheDocument();
    // To nie jest stan ładowania ani stan „brak numeru w adresie”.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText("Brak numeru certyfikatu w adresie.", { exact: false })).not.toBeInTheDocument();
  });
});

describe("/certyfikat — wartość poprawna z białymi znakami na brzegach: żądanie idzie z wartością obciętą", () => {
  it.each([
    ["numer", "number=%20NP/2026/017%20", "/verify/NP/2026/017"],
    ["token", `token=%20${TOKEN_40}%0A`, `/verify/qr/${TOKEN_40}`],
  ])("%s", async (_nazwa, zapytanie, sciezka) => {
    query = zapytanie;
    apiMock.mockResolvedValue(wazny);

    render(<CertificateLandingPage />);

    expect(await screen.findByText("NP/2026/017")).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(apiMock).toHaveBeenCalledWith(sciezka);
  });
});

// Próba zachowania: wartość poprawna dostaje tę samą ścieżkę co przed zmianą,
// więc te przypadki są zielone także na kodzie bez sprawdzenia kształtu.
describe("/certyfikat — wartość poprawna bez zmian: jedno żądanie pod dokładnie tą ścieżką", () => {
  it.each([
    ["numer", "number=NP/2026/017", "/verify/NP/2026/017"],
    ["numer powyżej tysiąca", "number=NP/2026/1000", "/verify/NP/2026/1000"],
    ["token", `token=${TOKEN_40}`, `/verify/qr/${TOKEN_40}`],
  ])("%s", async (_nazwa, zapytanie, sciezka) => {
    query = zapytanie;
    apiMock.mockResolvedValue(wazny);

    render(<CertificateLandingPage />);

    expect(await screen.findByText("NP/2026/017")).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(apiMock).toHaveBeenCalledWith(sciezka);
  });
});
