import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Pole „Kontakt w e-mailach” w sekcji ustawień powiadomień
 * (`GET`/`PATCH /admin/notification-settings`, pole `email_contact`).
 *
 *  a) odczyt wpisuje zapisany kontakt w pole; brak pola w odpowiedzi = puste pole.
 *  b) zmiana kontaktu → PATCH WYŁĄCZNIE z `email_contact`.
 *  c) wyczyszczenie pola → PATCH z pustym `email_contact` (serwer zapisuje „brak kontaktu”).
 *  d) 422 na `email_contact` → błąd pod polem.
 *  e) bez zmiany kontaktu PATCH go nie niesie.
 *  f) trzy nowe rodzaje e-maili mają polskie etykiety.
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

const KONTAKT = "kontakt@psychon.example.org";

function stan(kontakt: string | null | undefined) {
  const wynik: Record<string, unknown> = {
    types: [
      { type: "course.unlocked", enabled: true },
      { type: "access.expiring_7d", enabled: true },
      { type: "access.expired", enabled: true },
      { type: "cooperation_request.created", enabled: true },
    ],
    supervision_reminder: { enabled: true, send_at: "08:00" },
  };
  if (kontakt !== undefined) wynik.email_contact = kontakt;
  return wynik;
}

beforeEach(() => {
  fetchAdminEmailsPage.mockReset().mockResolvedValue({
    data: [],
    meta: { current_page: 1, per_page: 25, total: 0, last_page: 1, extra: { from: null } },
  });
  fetchNotificationSettings.mockReset().mockResolvedValue(stan(KONTAKT));
  updateNotificationSettings.mockReset();
});

async function poleKontaktu() {
  return await screen.findByRole("textbox", { name: "Kontakt w e-mailach" });
}

describe("PowiadomieniaEmail — kontakt w e-mailach", () => {
  it("a) odczyt wpisuje zapisany kontakt; brak pola w odpowiedzi daje puste pole", async () => {
    const { unmount } = render(<PowiadomieniaEmail />);
    expect(await poleKontaktu()).toHaveValue(KONTAKT);
    expect(screen.getByText(/Puste pole: e-maile nie pokażą kontaktu/)).toBeInTheDocument();
    unmount();

    fetchNotificationSettings.mockResolvedValue(stan(undefined));
    render(<PowiadomieniaEmail />);
    expect(await poleKontaktu()).toHaveValue("");
    expect(screen.queryByRole("region", { name: "Niezapisane zmiany" })).toBeNull();
  });

  it("b) zmiana kontaktu wysyła WYŁĄCZNIE email_contact", async () => {
    updateNotificationSettings.mockResolvedValue(stan("biuro@psychon.example.org"));
    const uzytkownik = userEvent.setup();
    render(<PowiadomieniaEmail />);

    const pole = await poleKontaktu();
    await uzytkownik.clear(pole);
    await uzytkownik.type(pole, "biuro@psychon.example.org");
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz zmiany" }));

    await waitFor(() => expect(updateNotificationSettings).toHaveBeenCalledTimes(1));
    expect(updateNotificationSettings).toHaveBeenCalledWith({ email_contact: "biuro@psychon.example.org" });
    await waitFor(() => expect(screen.getByText("Ustawienia powiadomień zapisane.")).toBeInTheDocument());
    expect(await poleKontaktu()).toHaveValue("biuro@psychon.example.org");
  });

  it("c) wyczyszczone pole wysyła pusty kontakt", async () => {
    updateNotificationSettings.mockResolvedValue(stan(null));
    const uzytkownik = userEvent.setup();
    render(<PowiadomieniaEmail />);

    await uzytkownik.clear(await poleKontaktu());
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz zmiany" }));

    await waitFor(() => expect(updateNotificationSettings).toHaveBeenCalledWith({ email_contact: "" }));
    expect(await poleKontaktu()).toHaveValue("");
  });

  it("d) 422 na polu kontaktu pokazuje błąd pod polem", async () => {
    updateNotificationSettings.mockRejectedValue(
      new ApiError({
        status: 422,
        code: "validation_failed",
        message: "Popraw zaznaczone pola.",
        errors: { email_contact: ["Kontakt może mieć najwyżej 300 znaków."] },
      }),
    );
    const uzytkownik = userEvent.setup();
    render(<PowiadomieniaEmail />);

    await uzytkownik.type(await poleKontaktu(), " i więcej");
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz zmiany" }));

    await waitFor(() => expect(screen.getByText("Kontakt może mieć najwyżej 300 znaków.")).toBeInTheDocument());
  });

  it("e) zmiana samego typu nie niesie kontaktu", async () => {
    updateNotificationSettings.mockResolvedValue(stan(KONTAKT));
    const uzytkownik = userEvent.setup();
    render(<PowiadomieniaEmail />);

    await poleKontaktu();
    await uzytkownik.click(screen.getByRole("checkbox", { name: "Odblokowanie etapu" }));
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz zmiany" }));

    await waitFor(() => expect(updateNotificationSettings).toHaveBeenCalledTimes(1));
    expect(updateNotificationSettings).toHaveBeenCalledWith({
      types: [{ type: "course.unlocked", enabled: false }],
    });
  });

  it("f) nowe rodzaje e-maili mają polskie etykiety", async () => {
    render(<PowiadomieniaEmail />);

    await poleKontaktu();
    expect(screen.getByRole("checkbox", { name: "Dostęp kończy się za 7 dni" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Dostęp do materiałów się zakończył" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Nowe zgłoszenie dalszej współpracy" })).toBeInTheDocument();
    expect(screen.queryByText("Inne powiadomienie")).toBeNull();
  });
});
