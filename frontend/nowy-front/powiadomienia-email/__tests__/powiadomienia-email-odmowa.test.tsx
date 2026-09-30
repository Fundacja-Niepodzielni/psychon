import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Odmowa ekranu z powodu roli: wspólny stan `brak-uprawnien` z nazwą roli,
 * bez danych w DOM, z wyjściem. Kontrola dodatnia: ta sama atrapa z
 * odpowiedzią 200 pokazuje ekran z ustawieniami i bez stanu odmowy.
 */

const fetchAdminEmailsPage = vi.fn();
const fetchNotificationSettings = vi.fn();
const back = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/api/h16-emails", () => ({
  fetchAdminEmailsPage: (...args: unknown[]) => fetchAdminEmailsPage(...args),
}));

vi.mock("@/lib/api/h16-ustawienia", () => ({
  fetchNotificationSettings: (...args: unknown[]) => fetchNotificationSettings(...args),
  updateNotificationSettings: vi.fn(),
}));

const { PowiadomieniaEmail } = await import("../PowiadomieniaEmail");
const { ApiError } = await import("@/lib/api/klient");

beforeEach(() => {
  back.mockReset();
  fetchAdminEmailsPage.mockReset();
  fetchNotificationSettings
    .mockReset()
    .mockResolvedValue({ types: [], supervision_reminder: { enabled: true, send_at: "08:00" } });
});

describe("PowiadomieniaEmail — odmowa z powodu roli", () => {
  it("403: nazwa roli, nagłówek ekranu, zero wierszy i przycisk wyjścia", async () => {
    fetchAdminEmailsPage.mockRejectedValue(
      new ApiError({ status: 403, code: "forbidden", message: "Nie masz dostępu do tego zasobu." }),
    );
    const uzytkownik = userEvent.setup();
    const { container } = render(<PowiadomieniaEmail />);

    expect(await screen.findByText(/tylko dla administracji/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Powiadomienia e-mail dla administracji" })).toBeInTheDocument();
    expect(container.querySelectorAll("table, tr")).toHaveLength(0);
    expect(screen.queryByText("Ustawienia powiadomień")).toBeNull();

    await uzytkownik.click(screen.getByRole("button", { name: "Wróć" }));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("kontrola dodatnia: odpowiedź 200 pokazuje ekran, bez stanu odmowy", async () => {
    fetchAdminEmailsPage.mockResolvedValue({
      data: [],
      meta: { current_page: 1, per_page: 25, total: 0, last_page: 1, extra: { from: null } },
    });
    render(<PowiadomieniaEmail />);

    await waitFor(() => expect(screen.getByText("Ustawienia powiadomień")).toBeInTheDocument());
    expect(screen.queryByText(/tylko dla administracji/)).toBeNull();
  });
});
