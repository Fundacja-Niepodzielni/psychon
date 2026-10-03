import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { straznikHostow } from "../../wspolne/strona-publiczna/__tests__/hosty";

/**
 * Wyszukiwarka weryfikacji: pusty stan (sam formularz), wynik, „nie znaleziono”
 * przy polu, awaria obok wyniku z ponowieniem, numer spoza kształtu bez
 * żądania — te same ścieżki co `app/weryfikacja/page.tsx`.
 */

const api = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: (...a: unknown[]) => api(...a),
}));

const { ApiError } = await import("@/lib/api");
const { Weryfikacja } = await import("../Weryfikacja");

const WAZNY = { number: "NP/2026/017", status: "valid", edition: "2026", issued_at: "2026-09-30T08:00:00Z" };
let straznik: ReturnType<typeof straznikHostow>;

async function szukaj(numer: string) {
  fireEvent.change(screen.getByLabelText(/Numer certyfikatu/), { target: { value: numer } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Sprawdź" }));
  });
}

beforeEach(() => {
  api.mockReset();
  straznik = straznikHostow();
});
afterEach(() => {
  expect(straznik.adresy).toEqual([]);
  straznik.przywroc();
  cleanup();
});

describe("weryfikacja — stany", () => {
  it("pusty stan: nagłówek, opis, pole z etykietą i przycisk; jeden h1; bez żądań", () => {
    const { container } = render(<Weryfikacja />);
    expect(screen.getByRole("heading", { level: 1, name: "Weryfikacja certyfikatu" })).toBeTruthy();
    expect(screen.getByText("Wpisz numer certyfikatu, np. NP/2026/001")).toBeTruthy();
    expect(screen.getByLabelText(/Numer certyfikatu/).getAttribute("placeholder")).toBe("NP/2026/001");
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(api).not.toHaveBeenCalled();
  });

  it("wynik: ścieżka segment po segmencie, numer obcięty, karta z danymi", async () => {
    api.mockResolvedValue(WAZNY);
    render(<Weryfikacja />);
    await szukaj("  NP/2026/017  ");
    expect(api).toHaveBeenCalledWith("/verify/NP/2026/017");
    expect(screen.getByRole("heading", { level: 2, name: "NP/2026/017" })).toBeTruthy();
    expect(screen.getByText("Ważny")).toBeTruthy();
    expect(screen.getByText("2026")).toBeTruthy();
    expect(screen.getByText("30 września 2026")).toBeTruthy();
  });

  it("numer powyżej tysiąca", async () => {
    api.mockResolvedValue({ ...WAZNY, number: "NP/2026/1000" });
    render(<Weryfikacja />);
    await szukaj("NP/2026/1000");
    expect(api).toHaveBeenCalledWith("/verify/NP/2026/1000");
  });

  it("404: „nie znaleziono” przy polu (aria-describedby), bez karty", async () => {
    api.mockResolvedValueOnce(WAZNY);
    render(<Weryfikacja />);
    await szukaj("NP/2026/017");
    api.mockRejectedValueOnce(new ApiError({ status: 404, code: "not_found", message: "x" }));
    await szukaj("NP/2026/999");
    const pole = screen.getByLabelText(/Numer certyfikatu/);
    const komunikat = screen.getByText("Nie znaleziono certyfikatu o podanym numerze.");
    expect(pole.getAttribute("aria-describedby")).toContain(komunikat.closest("[id]")?.id);
    expect(pole.getAttribute("aria-invalid")).toBe("true");
    expect(screen.queryByText("Ważny")).toBeNull();
  });

  it("tekst spoza kształtu: zero żądań, „nie znaleziono”, poprzedni wynik znika", async () => {
    api.mockResolvedValueOnce(WAZNY);
    render(<Weryfikacja />);
    await szukaj("NP/2026/017");
    await szukaj("../admin");
    expect(api).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Nie znaleziono certyfikatu o podanym numerze.")).toBeTruthy();
    expect(screen.queryByText("Ważny")).toBeNull();
  });

  it("same spacje: brak żądania i brak komunikatu", async () => {
    render(<Weryfikacja />);
    await szukaj("   ");
    expect(api).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("błąd serwera po wyniku: karta zostaje, obok awaria; ponowienie pyta o ten sam numer", async () => {
    api.mockResolvedValueOnce(WAZNY);
    render(<Weryfikacja />);
    await szukaj("NP/2026/017");
    api.mockRejectedValueOnce(new ApiError({ status: 500, code: "server_error", message: "x" }));
    await szukaj("NP/2026/018");
    expect(screen.getByText("NP/2026/017")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain(
      "Nie udało się połączyć z serwerem. Spróbuj ponownie za chwilę.",
    );
    api.mockResolvedValueOnce({ ...WAZNY, number: "NP/2026/018", status: "revoked" });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    });
    expect(api).toHaveBeenLastCalledWith("/verify/NP/2026/018");
    expect(screen.getByText("Unieważniony")).toBeTruthy();
  });
});
