import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { podmienRejestr, przywrocRejestr } from "@/lib/przelaczenie/__tests__/podmien-rejestr";

/**
 * Adres `/panel/certyfikat` przy włączonej grupie pokazuje ekran nowego wyglądu (lista warunków
 * z nagłówkiem drugiego stopnia „Warunki ukończenia programu”), a przy wyłączonej — dotychczasowy
 * ekran (karta „Warunki ukończenia”). Test renderuje prawdziwą stronę pod adresem, nie same elementy.
 */

const api = vi.fn();

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/panel/certyfikat",
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const WARUNKI = {
  eligible: false,
  conditions: [
    { key: "courses", label: "Wszystkie etapy i testy", done: 1, required: 10, met: false },
    { key: "workshop", label: "Warsztat stacjonarny", met: false },
  ],
  passed_tests_count: 2,
};

beforeEach(() => {
  api.mockReset();
  api.mockImplementation((sciezka: string) => {
    if (sciezka === "/certificate/conditions") return Promise.resolve(WARUNKI);
    if (sciezka === "/me") return Promise.resolve({ role: "volunteer", first_name: "Zosia" });
    return Promise.reject(new Error(`nieoczekiwane wywołanie: ${sciezka}`));
  });
});

/** Pierwszy import strony z zimną pamięcią podręczną transformacji przekracza domyślne 5 s. */
const LIMIT_CZASU_MS = 30_000;

afterEach(() => {
  przywrocRejestr();
});

describe("/panel/certyfikat a grupa certyfikatu", () => {
  it("grupa włączona: adres renderuje nowy ekran z listą warunków", async () => {
    podmienRejestr({ certyfikat: true });
    const { default: Strona } = await import("../page");

    render(<Strona />);

    expect(await screen.findByRole("heading", { level: 2, name: "Warunki ukończenia programu" })).toBeInTheDocument();
    expect(screen.getByText("Spełniasz 0 warunków z 2.")).toBeInTheDocument();
    expect(screen.queryByText("Warunki ukończenia")).not.toBeInTheDocument();
  }, LIMIT_CZASU_MS);

  it("grupa wyłączona: ten sam adres renderuje dotychczasowy ekran", async () => {
    podmienRejestr({});
    const { default: Strona } = await import("../page");

    render(<Strona />);

    expect(await screen.findByText("Warunki ukończenia")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "Warunki ukończenia programu" })).not.toBeInTheDocument();
  }, LIMIT_CZASU_MS);
});
