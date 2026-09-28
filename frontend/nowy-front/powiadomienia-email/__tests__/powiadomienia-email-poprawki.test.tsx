import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * Świadek dwustronny dwóch poprawek zmierzonych na ekranie przeglądu
 * skrzynki e-mail:
 *  2. Okruszek „Administracja" nie jest odnośnikiem do nieistniejącej trasy.
 *  — Szukajka: `GET /admin/emails` nie ma parametru wyszukiwania — pole
 *    filtrujące usunięte, nie zmyślone jako parametr zaplecza.
 */

const fetchAdminEmailsPage = vi.fn();
const back = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, refresh, push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/api/h16-emails", () => ({
  fetchAdminEmailsPage: (...args: unknown[]) => fetchAdminEmailsPage(...args),
}));

const { PowiadomieniaEmail } = await import("../PowiadomieniaEmail");

const WIADOMOSC = {
  id: 1,
  to_email: "marta@demo.pl",
  subject: "Twój wpis stażu został zaakceptowany",
  body_html: "<p>Tresc</p>",
  status: "simulated" as const,
  sent_at: "2026-09-10T08:00:00Z",
  created_at: "2026-09-10T08:00:00Z",
};

beforeEach(() => {
  fetchAdminEmailsPage.mockReset().mockResolvedValue({
    data: [WIADOMOSC],
    meta: { current_page: 1, per_page: 25, total: 1, last_page: 1, extra: { from: null } },
  });
  back.mockReset();
  refresh.mockReset();
});

describe("PowiadomieniaEmail — poprawki", () => {
  it("okruszek „Administracja” nie jest odnośnikiem (trasa nadrzędna nie istnieje)", async () => {
    render(<PowiadomieniaEmail />);
    await waitFor(() => expect(screen.getByText("marta@demo.pl")).toBeInTheDocument());

    const okruszek = screen.getByText("Administracja");
    expect(okruszek.closest("a")).toBeNull();
    expect(screen.queryByRole("link", { name: "Administracja" })).toBeNull();
  });

  it("bez szukajki — GET /admin/emails nie ma parametru wyszukiwania", async () => {
    render(<PowiadomieniaEmail />);
    await waitFor(() => expect(screen.getByText("marta@demo.pl")).toBeInTheDocument());

    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByLabelText("Szukaj po adresie albo temacie")).toBeNull();
  });
});
