import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * `StaraTresc` to dotychczasowa strona uczestniczek przeniesiona bez zmiany:
 * dwie zakładki jednej trasy, „Osoby” (domyślna) i „Zgłoszenia”
 * (`?zakladka=zgloszenia`), każda ze swoim nagłówkiem i przyciskiem głównym.
 * Test renderuje ją naprawdę (nie czyta źródła), więc pilnuje, że wyłączona
 * grupa przełączenia zwraca ekran, który użytkownik znał. Podmieniony jest
 * wyłącznie transport HTTP (oba moduły: `@/lib/api` i `@/lib/api/klient`).
 */

let zakladka: string | null = null;
const apiPaged = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: vi.fn(),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
}));

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: vi.fn(),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/uczestniczki",
  useSearchParams: () => new URLSearchParams(zakladka === null ? "" : `zakladka=${zakladka}`),
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { default: StaraTresc } = await import("../StaraTresc");

beforeEach(() => {
  zakladka = null;
  apiPaged.mockReset();
  apiPaged.mockResolvedValue({ data: [], meta: { current_page: 1, per_page: 25, total: 0, last_page: 1 } });
});

describe("StaraTresc /admin/uczestniczki — dotychczasowy ekran z zakładkami", () => {
  it("adres bez parametru: dwie zakładki, aktywna „Osoby” z listą osób i przyciskiem eksportu", async () => {
    render(<StaraTresc />);

    const zakladki = screen.getAllByRole("tab");
    expect(zakladki.map((z) => z.textContent)).toEqual(["Osoby", "Zgłoszenia"]);
    expect(zakladki[0]).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByRole("heading", { level: 1, name: "Uczestniczki i uczestnicy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Eksport CSV/ })).toBeInTheDocument();
  });

  it("?zakladka=zgloszenia: aktywna „Zgłoszenia” z kolejką rekrutacyjną i przyciskiem dodania", async () => {
    zakladka = "zgloszenia";
    render(<StaraTresc />);

    expect(screen.getAllByRole("tab")[1]).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByRole("heading", { level: 1, name: "Zgłoszenia" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Dodaj zgłoszenie" }).length).toBeGreaterThan(0);
    expect(apiPaged).toHaveBeenCalledWith(expect.stringContaining("/admin/applications?"));
  });
});
