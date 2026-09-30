import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Świadek dwustronny sekcji „Ustawienia powiadomień” nad skrzynką e-mail
 * (H16, `GET`/`PATCH /admin/notification-settings`). Na bazie (`9381dba`)
 * ekran nie miał tej sekcji w ogóle — każda próba niżej jest więc czerwona
 * bez zmiany i zielona po niej.
 *
 *  a) odczyt → 20 wierszy z etykietami (kontrakt §3.1 + ANEKS 1/2 pisma
 *     zdawczego — `internship.rejected`, `cooperation_request.answered`,
 *     `supervision.slot_cancelled`) + blok przypomnienia z `08:00`.
 *  b) zmiana jednego typu → ciało PATCH ma WYŁĄCZNIE zmieniony wpis.
 *  c) zmiana samej godziny → ciało PATCH ma WYŁĄCZNIE `supervision_reminder.send_at`.
 *  d) 422 z `errors` → tekst błędu pod właściwym wierszem/polem.
 *  e) 403 → `Notice` i brak aktywnego zapisu (formularz tylko do odczytu).
 *  f) typ nieznany mapie etykiet → widoczny kod, zero wyjątków.
 */

const fetchAdminEmailsPage = vi.fn();
const fetchNotificationSettings = vi.fn();
const updateNotificationSettings = vi.fn();
const back = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, refresh, push: vi.fn(), replace: vi.fn() }),
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

const KODY_TYPOW = [
  "application.accepted",
  "application.rejected",
  "assignment.created",
  "assignment.removed",
  "course.invited",
  "course.unlocked",
  "question.asked",
  "question.answered",
  "internship.accepted",
  "internship.returned",
  "internship.rejected",
  "attempt.failed_final",
  "certificate.ready",
  "document.ready",
  "profile.accepted",
  "profile.returned",
  "profile.withdrawn",
  "export.ready",
  "cooperation_request.answered",
  "supervision.slot_cancelled",
];

function stanDomyslny() {
  return {
    types: KODY_TYPOW.map((type) => ({ type, enabled: true })),
    supervision_reminder: { enabled: true, send_at: "08:00" },
  };
}

beforeEach(() => {
  fetchAdminEmailsPage.mockReset().mockResolvedValue({
    data: [],
    meta: { current_page: 1, per_page: 25, total: 0, last_page: 1, extra: { from: null } },
  });
  fetchNotificationSettings.mockReset().mockResolvedValue(stanDomyslny());
  updateNotificationSettings.mockReset();
  back.mockReset();
  refresh.mockReset();
});

describe("PowiadomieniaEmail — ustawienia powiadomień", () => {
  it("a) odczyt zwraca 20 wierszy z etykietami i blok przypomnienia o 08:00", async () => {
    render(<PowiadomieniaEmail />);

    await waitFor(() => expect(screen.getByText("Zaproszenie na kurs")).toBeInTheDocument());

    expect(screen.getByText("Wpis stażu odrzucony")).toBeInTheDocument();
    expect(screen.getByText("Odpowiedź na zgłoszenie współpracy")).toBeInTheDocument();
    expect(screen.getByText("Termin superwizji odwołany")).toBeInTheDocument();

    const grupa = screen.getByRole("group", { name: "Typy powiadomień" });
    expect(within(grupa).getAllByRole("checkbox")).toHaveLength(20);

    expect(screen.getByText("Wysyłaj przypomnienia o superwizji")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Godzina wysyłki" })).toHaveTextContent("08:00");
  });

  it("b) zmiana jednego typu wysyła WYŁĄCZNIE zmieniony wpis", async () => {
    updateNotificationSettings.mockResolvedValue(stanDomyslny());
    const uzytkownik = userEvent.setup();
    render(<PowiadomieniaEmail />);

    await waitFor(() => expect(screen.getByText("Odblokowanie etapu")).toBeInTheDocument());
    await uzytkownik.click(screen.getByRole("checkbox", { name: "Odblokowanie etapu" }));

    await waitFor(() => expect(screen.getByRole("region", { name: "Niezapisane zmiany" })).toBeInTheDocument());
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz zmiany" }));

    await waitFor(() => expect(updateNotificationSettings).toHaveBeenCalledTimes(1));
    expect(updateNotificationSettings).toHaveBeenCalledWith({
      types: [{ type: "course.unlocked", enabled: false }],
    });
  });

  it("c) zmiana samej godziny wysyła WYŁĄCZNIE supervision_reminder.send_at", async () => {
    updateNotificationSettings.mockResolvedValue(stanDomyslny());
    const uzytkownik = userEvent.setup();
    render(<PowiadomieniaEmail />);

    await waitFor(() => expect(screen.getByRole("combobox", { name: "Godzina wysyłki" })).toBeInTheDocument());

    await uzytkownik.click(screen.getByRole("combobox", { name: "Godzina wysyłki" }));
    await uzytkownik.click(screen.getByRole("option", { name: "14:00" }));

    await waitFor(() => expect(screen.getByRole("region", { name: "Niezapisane zmiany" })).toBeInTheDocument());
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz zmiany" }));

    await waitFor(() => expect(updateNotificationSettings).toHaveBeenCalledTimes(1));
    expect(updateNotificationSettings).toHaveBeenCalledWith({
      supervision_reminder: { send_at: "14:00" },
    });
  });

  it("d) 422 z errors pokazuje tekst błędu pod właściwym wierszem/polem", async () => {
    updateNotificationSettings.mockRejectedValue(
      new ApiError({
        status: 422,
        code: "validation_failed",
        message: "Popraw zaznaczone pola.",
        errors: {
          "types.0.type": ["Nieznany typ powiadomienia."],
          "supervision_reminder.send_at": ["Godzina musi mieć postać HH:00 (00-23)."],
        },
      }),
    );
    const uzytkownik = userEvent.setup();
    render(<PowiadomieniaEmail />);

    await waitFor(() => expect(screen.getByText("Odblokowanie etapu")).toBeInTheDocument());
    await uzytkownik.click(screen.getByRole("checkbox", { name: "Odblokowanie etapu" }));
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz zmiany" }));

    await waitFor(() => expect(screen.getByText("Nieznany typ powiadomienia.")).toBeInTheDocument());
    expect(screen.getByText("Godzina musi mieć postać HH:00 (00-23).")).toBeInTheDocument();
  });

  it("e) 403 przy zapisie pokazuje Notice i blokuje dalszy zapis", async () => {
    updateNotificationSettings.mockRejectedValue(
      new ApiError({ status: 403, code: "forbidden", message: "Nie masz dostępu do tego zasobu." }),
    );
    const uzytkownik = userEvent.setup();
    render(<PowiadomieniaEmail />);

    await waitFor(() => expect(screen.getByText("Odblokowanie etapu")).toBeInTheDocument());
    await uzytkownik.click(screen.getByRole("checkbox", { name: "Odblokowanie etapu" }));
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz zmiany" }));

    await waitFor(() =>
      expect(screen.getByText("Brak uprawnień do zmiany ustawień powiadomień.")).toBeInTheDocument(),
    );
    expect(screen.queryByRole("region", { name: "Niezapisane zmiany" })).toBeNull();
  });

  it("f) typ nieznany mapie etykiet pokazuje surowy kod bez wyjątku", async () => {
    fetchNotificationSettings.mockResolvedValue({
      types: [{ type: "future.unmapped_type", enabled: true }],
      supervision_reminder: { enabled: true, send_at: "08:00" },
    });
    render(<PowiadomieniaEmail />);

    await waitFor(() => expect(screen.getByText("future.unmapped_type")).toBeInTheDocument());
  });
});
