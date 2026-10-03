import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/** Kolumna „Wysłano” pokazuje datę wg słownika; w DOM nie stoi znacznik ISO z API. */

const fetchAdminEmailsPage = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/api/h16-emails", () => ({
  fetchAdminEmailsPage: (...args: unknown[]) => fetchAdminEmailsPage(...args),
}));

const { PowiadomieniaEmail } = await import("../PowiadomieniaEmail");

const BAZA = {
  body_html: "<p>Tresc</p>",
  status: "simulated" as const,
  created_at: "2026-09-25T15:05:00Z",
};

beforeEach(() => {
  fetchAdminEmailsPage.mockReset().mockResolvedValue({
    data: [
      { ...BAZA, id: 1, to_email: "marta@demo.pl", subject: "Pierwsza", sent_at: "2026-09-25T15:05:00Z" },
      { ...BAZA, id: 2, to_email: "filip@demo.pl", subject: "Druga", sent_at: null, created_at: "2026-09-26T09:30:00Z" },
    ],
    meta: { current_page: 1, per_page: 25, total: 2, last_page: 1, extra: { from: null } },
  });
});

describe("PowiadomieniaEmail — daty wg słownika", () => {
  it("data z godziną zamiast znacznika ISO, brak sent_at bierze created_at", async () => {
    const { container } = render(<PowiadomieniaEmail />);
    await userEvent.click(await screen.findByRole("button", { name: "Wysłane" }));
    await waitFor(() => expect(screen.getByText("marta@demo.pl")).toBeInTheDocument());

    expect(screen.getByText("25 września 2026, 17:05")).toBeInTheDocument();
    expect(screen.getByText("26 września 2026, 11:30")).toBeInTheDocument();
    expect(container.textContent ?? "").not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});
