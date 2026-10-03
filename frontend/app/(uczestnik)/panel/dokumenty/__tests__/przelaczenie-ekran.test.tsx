import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { podmienRejestr, przywrocRejestr } from "@/lib/przelaczenie/__tests__/podmien-rejestr";

/**
 * Adres `/panel/dokumenty` przy włączonej grupie pokazuje ekran nowego wyglądu (listy z nagłówkami
 * drugiego stopnia „Twoje dokumenty” i „Dokumenty do wygenerowania”), a przy wyłączonej —
 * dotychczasowy ekran (karta „Twoje dokumenty” z tabelą). Test renderuje prawdziwą stronę pod adresem.
 */

const apiPaged = vi.fn();

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: vi.fn(async () => ({ role: "volunteer", first_name: "Zosia" })),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/panel/dokumenty",
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const ODPOWIEDZ = {
  data: [
    {
      id: 3,
      type: "volunteer_agreement",
      number: "NP/PW/2026/003",
      generated_at: "2026-09-10T08:00:00Z",
      signature_status: "none",
      download_url: "http://localhost:8000/api/v1/documents/3/download",
    },
  ],
  meta: {
    current_page: 1,
    per_page: 25,
    total: 1,
    last_page: 1,
    extra: {
      available_types: {
        volunteer_agreement: { available: false, reason: "already_generated", document_id: 3 },
        internship_certificate: { available: false, reason: "conditions_not_met", hours_accepted: "41.5", hours_required: "72" },
      },
    },
  },
};

beforeEach(() => {
  apiPaged.mockReset();
  apiPaged.mockResolvedValue(ODPOWIEDZ);
});

/** Pierwszy import strony z zimną pamięcią podręczną transformacji przekracza domyślne 5 s. */
const LIMIT_CZASU_MS = 30_000;

afterEach(() => {
  przywrocRejestr();
});

describe("/panel/dokumenty a grupa dokumentów uczestnika", () => {
  it("grupa włączona: adres renderuje nowy ekran z dwiema listami", async () => {
    podmienRejestr({ dokumentyUczestnika: true });
    const { default: Strona } = await import("../page");

    render(<Strona />);

    expect(await screen.findByRole("heading", { level: 2, name: "Dokumenty do wygenerowania" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Twoje dokumenty" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  }, LIMIT_CZASU_MS);

  it("grupa wyłączona: ten sam adres renderuje dotychczasowy ekran z tabelą", async () => {
    podmienRejestr({});
    const { default: Strona } = await import("../page");

    render(<Strona />);

    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "Dokumenty do wygenerowania" })).not.toBeInTheDocument();
  }, LIMIT_CZASU_MS);
});
