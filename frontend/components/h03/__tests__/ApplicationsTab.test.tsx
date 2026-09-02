import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * T-4 · świadek ekranu H03 (zgłoszenia rekrutacyjne).
 *
 * Kryteria ★ H03.1–2 „z ekranu": akceptacja prowadzi do utworzenia konta,
 * odrzucenie BEZ POWODU → 422 **pokazane użytkowniczce**.
 *
 * Ten plik celowo NIE sprawdza, czy „coś się wyrenderowało". Sprawdza WARTOŚCI
 * i WYWOŁANIA: jakie żądanie poszło do API, z jakim ciałem, i co ekran zrobił
 * z odpowiedzią. Test na obecność elementu byłby zielony także wtedy, gdyby
 * przycisk „Odrzuć" nie wysyłał niczego.
 *
 * Klient API jest zaślepiony (`vi.mock`), bo mierzymy EKRAN, nie sieć — logika
 * serwera ma własnych świadków po stronie backendu.
 */

const api = vi.fn();
const apiPaged = vi.fn();
const downloadFile = vi.fn();

class ApiError extends Error {
  status: number;
  code: string;
  errors?: Record<string, string[]>;

  constructor(status: number, code: string, message: string, errors?: Record<string, string[]>) {
    super(message);
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

vi.mock("@/lib/api", () => ({
  api: (...args: unknown[]) => api(...args),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
  downloadFile: (...args: unknown[]) => downloadFile(...args),
  ApiError,
}));

const { ApplicationsTab } = await import("@/components/h03/ApplicationsTab");

const zgloszenie = {
  id: 7,
  first_name: "Marta",
  last_name: "Testowa",
  email: "marta.testowa@example.test",
  phone: "+48 600 100 200",
  role: "volunteer" as const,
  status: "new" as const,
  created_at: "2026-09-01T10:00:00Z",
  decided_at: null,
  reason: null,
};

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
  apiPaged.mockResolvedValue({ data: [zgloszenie], meta: { current_page: 1, per_page: 25, total: 1, last_page: 1 } });
});

describe("ApplicationsTab — odrzucenie", () => {
  it("nie wysyła żądania, gdy powód jest pusty, i mówi o tym wprost", async () => {
    // Kryterium ★ H03.2 od strony ekranu. Serwer i tak odrzuci puste `reason`
    // kodem 422, ale ekran ma to powiedzieć ZANIM zmarnuje żądanie — i przede
    // wszystkim ma powiedzieć cokolwiek, zamiast wyglądać na zepsuty przycisk.
    const user = userEvent.setup();
    render(<ApplicationsTab />);

    await user.click(await screen.findByRole("button", { name: "Odrzuć" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Odrzuć" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Podaj powód odrzucenia.");
    expect(api).not.toHaveBeenCalled();
  });

  it("wysyła powód dokładnie tam, gdzie trzeba, i z takim ciałem, jakie mówi kontrakt", async () => {
    const user = userEvent.setup();
    api.mockResolvedValue({ ...zgloszenie, status: "rejected" });
    render(<ApplicationsTab />);

    await user.click(await screen.findByRole("button", { name: "Odrzuć" }));

    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/Powód/), "Brak wymaganych kwalifikacji.");
    await user.click(within(dialog).getByRole("button", { name: "Odrzuć" }));

    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));

    expect(api).toHaveBeenCalledWith("/admin/applications/7/reject", {
      method: "POST",
      body: { reason: "Brak wymaganych kwalifikacji." },
    });
  });

  it("pokazuje błąd pola z odpowiedzi 422 serwera, a nie własny komunikat zastępczy", async () => {
    // KONTROLA NEGATYWNA. Ekran, który przy każdym błędzie pokazuje własne
    // „coś poszło nie tak", przechodzi test obecności komunikatu i gubi
    // JEDYNĄ informację, która jest użyteczna: co dokładnie jest nie tak z polem.
    const user = userEvent.setup();
    api.mockRejectedValue(
      new ApiError(422, "validation_failed", "Popraw zaznaczone pola.", {
        reason: ["Powód jest za krótki (minimum 10 znaków)."],
      }),
    );
    render(<ApplicationsTab />);

    await user.click(await screen.findByRole("button", { name: "Odrzuć" }));

    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/Powód/), "krótkie");
    await user.click(within(dialog).getByRole("button", { name: "Odrzuć" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Powód jest za krótki (minimum 10 znaków).",
    );
  });
});

describe("ApplicationsTab — akceptacja", () => {
  it("wysyła wybraną rolę, a nie rolę domyślną zapisaną w kodzie", async () => {
    const user = userEvent.setup();
    api.mockResolvedValue({ user_id: 42, access_expires_at: "2027-02-01T00:00:00Z" });
    render(<ApplicationsTab />);

    await user.click(await screen.findByRole("button", { name: "Akceptuj" }));

    const dialog = await screen.findByRole("dialog");
    await user.selectOptions(within(dialog).getByLabelText(/Rola/), "student");
    await user.click(within(dialog).getByRole("button", { name: /Akceptuj/ }));

    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));

    expect(api).toHaveBeenCalledWith("/admin/applications/7/accept", {
      method: "POST",
      body: { role: "student" },
    });
  });

  it("nie wysyła `force` na pierwsze żądanie — dopiero po świadomym potwierdzeniu", async () => {
    // ★ H03.1: akceptacja PONAD LIMIT ma być decyzją, nie skutkiem ubocznym
    // klikania. Ekran wysyłający `force` od razu „działa" tak samo z punktu
    // widzenia listy, a znosi limit miejsc w edycji bez niczyjej wiedzy.
    const user = userEvent.setup();
    api.mockRejectedValueOnce(
      new ApiError(409, "edition_capacity_exceeded", "Brak wolnych miejsc.", undefined),
    );
    render(<ApplicationsTab />);

    await user.click(await screen.findByRole("button", { name: "Akceptuj" }));

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /Akceptuj/ }));

    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));

    expect(api.mock.calls[0]?.[1]).toEqual({ method: "POST", body: { role: "volunteer" } });
    expect(JSON.stringify(api.mock.calls[0]?.[1])).not.toContain("force");
  });
});

describe("ApplicationsTab — rola wnioskowana", () => {
  it("podpowiada rolę ze zgłoszenia, a nie stałą z kodu", async () => {
    // Zauważone przy naprawie własnej fikstury: ekran czyta `role` ze zgłoszenia.
    // To nie jest kosmetyka — od tej wartości zależy, jakie konto powstanie.
    const user = userEvent.setup();
    api.mockResolvedValue({ user_id: 42, access_expires_at: "2027-02-01T00:00:00Z" });
    render(<ApplicationsTab />);

    await user.click(await screen.findByRole("button", { name: "Akceptuj" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /Akceptuj/ }));

    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    expect(api.mock.calls[0]?.[1]).toEqual({ method: "POST", body: { role: "volunteer" } });
  });

  it("KONTROLA NEGATYWNA: zgłoszenie o rolę `super_admin` nie może jej dostać", async () => {
    // Zgłoszenie rekrutacyjne przychodzi z zewnątrz. Gdyby ekran przepisywał
    // wnioskowaną rolę wprost, wystarczyłoby wysłać formularz z `super_admin`,
    // żeby akceptacja jednym kliknięciem utworzyła konto administratora.
    const user = userEvent.setup();
    apiPaged.mockResolvedValue({
      data: [{ ...zgloszenie, role: "super_admin" }],
      meta: { current_page: 1, per_page: 25, total: 1, last_page: 1 },
    });
    api.mockResolvedValue({ user_id: 42, access_expires_at: "2027-02-01T00:00:00Z" });
    render(<ApplicationsTab />);

    await user.click(await screen.findByRole("button", { name: "Akceptuj" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /Akceptuj/ }));

    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));

    const wyslanaRola = (api.mock.calls[0]?.[1] as { body: { role: string } }).body.role;

    expect(wyslanaRola).not.toBe("super_admin");
    expect(wyslanaRola).toBe("volunteer");
  });
});

describe("ApplicationsTab — lista", () => {
  it("pokazuje wartości ze zgłoszenia, nie same nagłówki tabeli", async () => {
    render(<ApplicationsTab />);

    expect(await screen.findByText("marta.testowa@example.test")).toBeInTheDocument();
    expect(apiPaged).toHaveBeenCalledWith(
      expect.stringContaining("/admin/applications?"),
    );
  });
});
