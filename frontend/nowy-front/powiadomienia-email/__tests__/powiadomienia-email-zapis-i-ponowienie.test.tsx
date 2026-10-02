import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Dwa zachowania ekranu powiadomień e-mail:
 * - po udanym zapisie ustawień pojawia się potwierdzenie; nieudany zapis
 *   potwierdzenia nie pokazuje;
 * - błąd wczytania skrzynki ma zdanie i przycisk „Spróbuj ponownie”, który
 *   ponawia odczyt i po sukcesie pokazuje ekran.
 */

const fetchAdminEmailsPage = vi.fn();
const fetchNotificationSettings = vi.fn();
const updateNotificationSettings = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/api/h16-emails", () => ({
  fetchAdminEmailsPage: (...args: unknown[]) => fetchAdminEmailsPage(...args),
}));

vi.mock("@/lib/api/h16-ustawienia", () => ({
  fetchNotificationSettings: (...args: unknown[]) => fetchNotificationSettings(...args),
  updateNotificationSettings: (...args: unknown[]) => updateNotificationSettings(...args),
}));

const { PowiadomieniaEmail } = await import("../PowiadomieniaEmail");
const { ApiError } = await import("@/lib/api/klient");

const SKRZYNKA = {
  data: [],
  meta: { current_page: 1, per_page: 25, total: 0, last_page: 1, extra: { from: null } },
};

function ustawienia() {
  return {
    types: [{ type: "course.unlocked", enabled: true }],
    supervision_reminder: { enabled: true, send_at: "08:00" },
  };
}

const POTWIERDZENIE = "Ustawienia powiadomień zapisane.";

async function zmienIZapisz(uzytkownik: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => expect(screen.getByText("Odblokowanie etapu")).toBeInTheDocument());
  await uzytkownik.click(screen.getByRole("checkbox", { name: "Odblokowanie etapu" }));
  await uzytkownik.click(await screen.findByRole("button", { name: "Zapisz zmiany" }));
  await waitFor(() => expect(updateNotificationSettings).toHaveBeenCalledTimes(1));
}

beforeEach(() => {
  fetchAdminEmailsPage.mockReset().mockResolvedValue(SKRZYNKA);
  fetchNotificationSettings.mockReset().mockResolvedValue(ustawienia());
  updateNotificationSettings.mockReset();
});

describe("PowiadomieniaEmail — potwierdzenie zapisu", () => {
  it("udany zapis pokazuje potwierdzenie", async () => {
    updateNotificationSettings.mockResolvedValue({
      types: [{ type: "course.unlocked", enabled: false }],
      supervision_reminder: { enabled: true, send_at: "08:00" },
    });
    const uzytkownik = userEvent.setup();
    render(<PowiadomieniaEmail />);

    expect(screen.queryByText(POTWIERDZENIE)).toBeNull();
    await zmienIZapisz(uzytkownik);

    expect(await screen.findByText(POTWIERDZENIE)).toBeInTheDocument();
  });

  it("nieudany zapis nie pokazuje potwierdzenia", async () => {
    updateNotificationSettings.mockRejectedValue(
      new ApiError({ status: 500, code: "server_error", message: "Błąd serwera." }),
    );
    const uzytkownik = userEvent.setup();
    render(<PowiadomieniaEmail />);

    await zmienIZapisz(uzytkownik);

    expect(await screen.findByText("Nie udało się zapisać. Spróbuj ponownie.")).toBeInTheDocument();
    expect(screen.queryByText(POTWIERDZENIE)).toBeNull();
  });
});

describe("PowiadomieniaEmail — błąd wczytania skrzynki", () => {
  it("zdanie i „Spróbuj ponownie”; ponowienie czyta skrzynkę jeszcze raz i pokazuje ekran", async () => {
    fetchAdminEmailsPage
      .mockReset()
      .mockRejectedValueOnce(new ApiError({ status: 500, code: "server_error", message: "Błąd serwera." }))
      .mockResolvedValueOnce(SKRZYNKA);
    const uzytkownik = userEvent.setup();
    render(<PowiadomieniaEmail />);

    expect(await screen.findByText("Nie udało się wczytać wiadomości")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Powiadomienia e-mail" })).toBeInTheDocument();
    expect(fetchAdminEmailsPage).toHaveBeenCalledTimes(1);

    await uzytkownik.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));

    await waitFor(() => expect(fetchAdminEmailsPage).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Brak wiadomości.")).toBeInTheDocument();
    expect(screen.queryByText("Nie udało się wczytać wiadomości")).toBeNull();
    expect(screen.queryByRole("button", { name: "Spróbuj ponownie" })).toBeNull();
  });

  it("ponowienie, które znów się nie udaje, zostawia zdanie i przycisk", async () => {
    fetchAdminEmailsPage
      .mockReset()
      .mockRejectedValue(new ApiError({ status: 500, code: "server_error", message: "Błąd serwera." }));
    const uzytkownik = userEvent.setup();
    render(<PowiadomieniaEmail />);

    await uzytkownik.click(await screen.findByRole("button", { name: "Spróbuj ponownie" }));

    await waitFor(() => expect(fetchAdminEmailsPage).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("button", { name: "Spróbuj ponownie" })).toBeInTheDocument();
  });
});
