import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { saPowodyPytania } from "@/design-system/szablony/NiezapisaneZmiany";

/**
 * Układ ekranu „Powiadomienia”: nazwa ekranu, zdania, jeden nagłówek bloku
 * przypomnienia, jeden przycisk zapisu i pytanie przy wyjściu z niezapisanymi
 * zmianami.
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

function ustawienia() {
  return {
    types: [
      { type: "assignment.removed", enabled: true },
      { type: "course.unlocked", enabled: true },
      { type: "supervision.slot_cancelled", enabled: true },
    ],
    supervision_reminder: { enabled: true, send_at: "08:00" },
  };
}

beforeEach(() => {
  fetchAdminEmailsPage.mockReset().mockResolvedValue({
    data: [],
    meta: { current_page: 1, per_page: 25, total: 0, last_page: 1, extra: { from: null } },
  });
  fetchNotificationSettings.mockReset().mockResolvedValue(ustawienia());
  updateNotificationSettings.mockReset();
});

describe("PowiadomieniaEmail — układ ekranu", () => {
  it("nazwa ekranu to „Powiadomienia”: nagłówek i okruszek, bez „e-mail” w nazwie", async () => {
    render(<PowiadomieniaEmail />);
    await screen.findByText("Odblokowanie etapu");

    expect(screen.getByRole("heading", { level: 1, name: "Powiadomienia" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Okruszki" })).getByText("Powiadomienia")).toBeInTheDocument();
    expect(screen.queryByText("Powiadomienia e-mail")).toBeNull();
  });

  it("zdanie wstępu mówi, że wyłączenie rodzaju wyłącza e-mail i wpis w dzwonku", async () => {
    render(<PowiadomieniaEmail />);
    await screen.findByText("Odblokowanie etapu");

    expect(
      screen.getByText(/Wyłączony rodzaj powiadomienia nie tworzy ani wpisu w dzwonku, ani wiadomości e-mail/),
    ).toBeInTheDocument();
  });

  it("żadne zdanie o trybie próbnym nie stoi na ekranie, w żadnej zakładce", async () => {
    const uzytkownik = userEvent.setup();
    render(<PowiadomieniaEmail />);
    await screen.findByText("Odblokowanie etapu");

    const bezTrybuProbnego = () => {
      const tekst = document.body.textContent ?? "";
      expect(tekst).not.toMatch(/tryb pr[oó]bny/i);
      expect(tekst).not.toMatch(/nie wychodz[aą] poza system/i);
    };
    bezTrybuProbnego();

    await uzytkownik.click(screen.getByRole("button", { name: "Wysłane" }));
    await screen.findByText("Brak wiadomości.");
    bezTrybuProbnego();
  });

  it("odebranie przypisania prowadzącego nazywa się „Odebranie”, nie „Zdjęcie”", async () => {
    render(<PowiadomieniaEmail />);

    expect(await screen.findByText("Odebranie przypisania prowadzącego")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Zdjęcie przypisania");
  });

  it("blok przypomnienia o superwizji ma jedną nazwę, a godzina ma dopisek „UTC”", async () => {
    render(<PowiadomieniaEmail />);
    await screen.findByText("Odblokowanie etapu");

    expect(screen.getAllByText("Przypomnienie o superwizji")).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Przypomnienie o superwizji" })).toBeNull();
    expect(screen.getByRole("combobox", { name: "Godzina wysyłki (UTC)" })).toBeInTheDocument();
  });

  it("jeden przycisk zapisu, bez „Cofnij” i „Porzuć wszystko”", async () => {
    render(<PowiadomieniaEmail />);
    await screen.findByText("Odblokowanie etapu");

    expect(screen.getAllByRole("button", { name: /zapisz/i })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /cofnij|porzuć/i })).toBeNull();
    // Przycisk główny nigdy nie jest nieaktywny; bez zmian zapis niczego nie wysyła.
    await userEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));
    expect(updateNotificationSettings).not.toHaveBeenCalled();
  });

  it("niezapisana zmiana zgłasza ramie pytanie przy wyjściu, a zapis je zdejmuje", async () => {
    updateNotificationSettings.mockResolvedValue({
      ...ustawienia(),
      types: ustawienia().types.map((wpis) =>
        wpis.type === "course.unlocked" ? { ...wpis, enabled: false } : wpis,
      ),
    });
    const uzytkownik = userEvent.setup();
    render(<PowiadomieniaEmail />);
    await screen.findByText("Odblokowanie etapu");
    expect(saPowodyPytania()).toBe(false);

    await uzytkownik.click(screen.getByRole("switch", { name: "Odblokowanie etapu" }));
    expect(screen.getByRole("switch", { name: "Odblokowanie etapu" })).toHaveAttribute("aria-checked", "false");
    expect(saPowodyPytania()).toBe(true);

    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz zmiany" }));
    await waitFor(() => expect(saPowodyPytania()).toBe(false));
    expect(await screen.findByText("Ustawienia powiadomień zostały zapisane.")).toBeInTheDocument();
  });
});
