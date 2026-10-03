import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { straznikHostow } from "../../wspolne/strona-publiczna/__tests__/hosty";

/**
 * Strona certyfikatu z adresu: brak numeru (stan pusty z odnośnikiem), wartość
 * spoza kształtu (bez żądania), wczytywanie, wynik, „nie znaleziono”, awaria z
 * ponowieniem — te same ścieżki co `app/certyfikat/page.tsx`.
 */

let zapytanie = "";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(zapytanie) }));

const api = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: (...a: unknown[]) => api(...a),
}));

const { ApiError } = await import("@/lib/api");
const { CertyfikatPubliczny } = await import("../CertyfikatPubliczny");

const WAZNY = { number: "NP/2026/017", status: "valid", edition: "2026", issued_at: "2026-09-30T08:00:00Z" };
const TOKEN = "A".repeat(20) + "b".repeat(10) + "0123456789";
let straznik: ReturnType<typeof straznikHostow>;

async function pokaz() {
  let wynik: ReturnType<typeof render> | undefined;
  await act(async () => {
    wynik = render(<CertyfikatPubliczny />);
  });
  return wynik!;
}

beforeEach(() => {
  api.mockReset();
  zapytanie = "";
  straznik = straznikHostow();
});
afterEach(() => {
  expect(straznik.adresy).toEqual([]);
  straznik.przywroc();
  cleanup();
});

describe("certyfikat z adresu — stany", () => {
  it("brak numeru: komunikat z odnośnikiem do wyszukiwarki, bez żądania; jeden h1", async () => {
    const { container } = await pokaz();
    expect(screen.getByRole("heading", { level: 1, name: "Certyfikat programu" })).toBeTruthy();
    expect(screen.getByText("Fundacja Niepodzielni — program PsychON")).toBeTruthy();
    expect(screen.getByRole("link", { name: "wyszukiwarki weryfikacji" }).getAttribute("href")).toBe("/weryfikacja");
    expect(api).not.toHaveBeenCalled();
    expect(container.querySelectorAll("h1")).toHaveLength(1);
  });

  it("wczytywanie: „Sprawdzanie…” jako status", async () => {
    zapytanie = "number=NP/2026/017";
    api.mockReturnValue(new Promise(() => {}));
    await pokaz();
    expect(screen.getByRole("status", { name: "Sprawdzanie…" })).toBeTruthy();
  });

  it("numer z adresu (obcięty): jedno żądanie i karta", async () => {
    zapytanie = "number=%20NP/2026/017%20";
    api.mockResolvedValue(WAZNY);
    await pokaz();
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith("/verify/NP/2026/017");
    expect(screen.getByText("Ważny")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("token ma pierwszeństwo przed numerem", async () => {
    zapytanie = `token=${TOKEN}&number=NP/2026/017`;
    api.mockResolvedValue(WAZNY);
    await pokaz();
    expect(api).toHaveBeenCalledWith(`/verify/qr/${TOKEN}`);
  });

  it.each(["number=../../admin", "token=krotki", "number=NP/26/1"])(
    "wartość spoza kształtu (%s): zero żądań, „nie znaleziono”",
    async (adres) => {
      zapytanie = adres;
      await pokaz();
      expect(api).not.toHaveBeenCalled();
      expect(screen.getByRole("alert").textContent).toContain("Nie znaleziono certyfikatu o podanym numerze.");
    },
  );

  it("404: komunikat, bez karty i bez szkieletu", async () => {
    zapytanie = "number=NP/2026/999";
    api.mockRejectedValue(new ApiError({ status: 404, code: "not_found", message: "x" }));
    await pokaz();
    expect(screen.getByRole("alert").textContent).toContain("Nie znaleziono certyfikatu o podanym numerze.");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("awaria: ponowienie pokazuje szkielet i pyta tę samą ścieżkę; sukces chowa awarię", async () => {
    zapytanie = "number=NP/2026/017";
    api.mockRejectedValueOnce(new ApiError({ status: 500, code: "server_error", message: "x" }));
    await pokaz();
    expect(screen.getByRole("alert").textContent).toContain("Nie udało się połączyć z serwerem.");
    let rozstrzygnij: (w: unknown) => void = () => {};
    api.mockReturnValueOnce(new Promise((r) => (rozstrzygnij = r)));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    });
    expect(api).toHaveBeenCalledTimes(2);
    expect(api).toHaveBeenLastCalledWith("/verify/NP/2026/017");
    expect(screen.getByRole("status", { name: "Sprawdzanie…" })).toBeTruthy();
    await act(async () => {
      rozstrzygnij(WAZNY);
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Ważny")).toBeTruthy();
  });
});
