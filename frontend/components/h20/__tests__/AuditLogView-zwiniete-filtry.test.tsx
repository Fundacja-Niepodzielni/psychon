import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Dziennik działań na telefonie: filtry stoją pod wierszem
 * „Filtry: <wybrane> (N) · Zmień”, a przycisk panelu nazywa się „Pokaż wyniki”;
 * jego wciśnięcie pobiera dziennik, zwija panel i oddaje fokus na wiersz.
 * Od 600 px przycisk zostaje „Filtruj”. Szerokość ekranu to atrapa `matchMedia`.
 */

const fetchAuditLog = vi.fn();

const AUDIT_ACTIONS = ["application.accepted", "internship.accepted"] as const;

vi.mock("@/lib/api", () => ({
  fetchAuditLog: (...args: unknown[]) => fetchAuditLog(...args),
  downloadAuditLogCsv: vi.fn(),
  AUDIT_ACTIONS,
  ApiError: class ApiError extends Error {},
}));

const { default: AuditLogView } = await import("@/components/h20/AuditLogView");

const wpis = {
  id: 7,
  action: "internship.accepted",
  actor: { id: 1, first_name: "Ola", last_name: "Nowak" },
  subject_type: "internship_entry",
  subject_id: 12,
  details: null,
  created_at: "2026-01-05T10:00:00Z",
};

function ustawSzerokosc(telefon: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (zapytanie: string) => ({
      matches: telefon && zapytanie.includes("max-width: 599px"),
      media: zapytanie,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

beforeEach(() => {
  fetchAuditLog.mockReset();
  fetchAuditLog.mockResolvedValue({
    data: [wpis],
    meta: { current_page: 1, per_page: 25, total: 1, last_page: 1 },
  });
});

afterEach(() => {
  Reflect.deleteProperty(window, "matchMedia");
});

describe("Dziennik działań — zwinięte filtry", () => {
  it("wiersz „Filtry” niesie liczbę zdarzeń, a pola filtrów stoją w jego panelu", async () => {
    ustawSzerokosc(true);
    render(<AuditLogView />);
    await screen.findByText("Ola Nowak");

    const wiersz = screen.getByRole("button", { name: /^Filtry:/ });
    expect(wiersz).toHaveAccessibleName("Filtry: Wszystkie zdarzenia (1) Zmień");
    expect(wiersz).toHaveAttribute("aria-expanded", "false");
    const panel = document.getElementById(wiersz.getAttribute("aria-controls") ?? "") as HTMLElement;
    expect(within(panel).getByLabelText("Zdarzenie")).toBeInTheDocument();
    expect(within(panel).getByLabelText("ID osoby")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Pokaż wyniki" })).toBeInTheDocument();
  });

  it("„Pokaż wyniki” pobiera dziennik, zwija panel i oddaje fokus na wiersz z wybranym zdarzeniem", async () => {
    ustawSzerokosc(true);
    const uzytkownik = userEvent.setup();
    render(<AuditLogView />);
    await screen.findByText("Ola Nowak");

    await uzytkownik.click(screen.getByRole("button", { name: /^Filtry:/ }));
    await uzytkownik.selectOptions(screen.getByLabelText("Zdarzenie"), "internship.accepted");
    await uzytkownik.click(screen.getByRole("button", { name: "Pokaż wyniki" }));

    await waitFor(() =>
      expect(fetchAuditLog).toHaveBeenLastCalledWith(
        expect.objectContaining({ action: "internship.accepted", page: 1, per_page: 25 }),
      ),
    );
    await screen.findByText("Ola Nowak");
    const po = screen.getByRole("button", { name: /^Filtry:/ });
    expect(po).toHaveAccessibleName("Filtry: Wpis stażu zaakceptowany (1) Zmień");
    expect(po).toHaveAttribute("aria-expanded", "false");
    expect(po).toHaveFocus();
  });

  it("od 600 px przycisk filtra zostaje „Filtruj”", async () => {
    ustawSzerokosc(false);
    render(<AuditLogView />);
    await screen.findByText("Ola Nowak");

    expect(screen.getByRole("button", { name: "Filtruj" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pokaż wyniki" })).toBeNull();
  });
});
