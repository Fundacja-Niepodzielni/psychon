import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Świadek ekranu `#/panel/superwizja` (`SupervisionSlots`) — połowa
 * kryterium pozycji 6 widziana od strony osoby uczestniczącej: zapis ma być
 * zablokowany, gdy serwer uzna termin za zamknięty (`can_sign_up: false`), a
 * powód ma być czytelny PRZY TEJ KARCIE, nie w jednym komunikacie nad całą
 * listą terminów.
 *
 * `can_sign_up` liczy serwer — komponent go tylko odczytuje, dlatego test nie
 * odtwarza logiki backendu, tylko podstawia gotową wartość z API i sprawdza
 * reakcję ekranu.
 *
 * Klient API jest zaślepiony (`vi.mock`), bo mierzymy EKRAN, nie sieć.
 */

const api = vi.fn();
const apiPaged = vi.fn();

class ApiError extends Error {
  status: number;
  code: string;
  errors?: Record<string, string[]>;

  constructor(status: number, code: string, message: string, errors?: Record<string, string[]>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

vi.mock("@/lib/api", () => ({
  api: (...args: unknown[]) => api(...args),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
  ApiError,
}));

const { default: SupervisionSlots } = await import("@/components/h12/SupervisionSlots");

function termin(overrides: Partial<Record<string, unknown>> & { id: number }) {
  return {
    id: overrides.id,
    starts_at: "2026-09-12T09:00:00Z",
    duration_minutes: 60,
    seats_limit: 6,
    location_or_link: "https://przyklad.test/superwizja",
    active_signups_count: 1,
    available_seats: 5,
    is_full: false,
    can_sign_up: true,
    signup: null,
    ...overrides,
  };
}

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
});

describe("SupervisionSlots — przycisk zapisu zależy od can_sign_up", () => {
  it("termin z can_sign_up: false i wolnymi miejscami ma przycisk zapisu wyłączony", async () => {
    apiPaged.mockResolvedValue({ data: [termin({ id: 1, can_sign_up: false })] });
    render(<SupervisionSlots />);

    const przycisk = await screen.findByRole("button", { name: "Zapisz się" });
    expect(przycisk).toBeDisabled();
  });

  it("KONTROLA NEGATYWNA: termin z can_sign_up: true i wolnymi miejscami ma przycisk czynny", async () => {
    // Bez tej nogi test wyżej byłby zielony także wtedy, gdyby przycisk zapisu
    // był wyłączony ZAWSZE, niezależnie od tego, co przysłał serwer.
    apiPaged.mockResolvedValue({ data: [termin({ id: 1, can_sign_up: true })] });
    render(<SupervisionSlots />);

    const przycisk = await screen.findByRole("button", { name: "Zapisz się" });
    expect(przycisk).toBeEnabled();
  });

  it("przy can_sign_up: false widać zdanie wyjaśniające powód, nie tylko wyłączony przycisk", async () => {
    apiPaged.mockResolvedValue({ data: [termin({ id: 1, can_sign_up: false })] });
    render(<SupervisionSlots />);

    await screen.findByRole("button", { name: "Zapisz się" });
    expect(
      await screen.findByText("Termin już się rozpoczął — zapis i wypis nie są już możliwe."),
    ).toBeInTheDocument();
  });
});

describe("SupervisionSlots — błąd zapisu jest przy WŁAŚCIWEJ karcie", () => {
  it("błąd zwrócony dla jednego terminu pokazuje się tylko przy tej karcie, nie przy pozostałych", async () => {
    // To jest dokładnie wada zgłoszona przez właściciela: komunikat błędu
    // wisiał nad całą listą terminów zamiast stać przy tym, którego dotyczył.
    const user = userEvent.setup();
    apiPaged.mockResolvedValue({
      data: [
        termin({ id: 1, can_sign_up: true, is_full: false }),
        termin({ id: 2, can_sign_up: true, is_full: false }),
      ],
    });
    render(<SupervisionSlots />);

    const kartaPierwsza = (await screen.findByTestId("slot-1")) as HTMLElement;
    const kartaDruga = screen.getByTestId("slot-2") as HTMLElement;

    api.mockRejectedValue(
      new ApiError(409, "not_your_supervisor", "Możesz zapisywać się tylko na terminy swojego superwizora."),
    );
    // Po błędzie komponent dolicza `reload`, więc kolejne pobranie listy musi
    // wciąż zwracać te same dwa terminy.
    apiPaged.mockResolvedValue({
      data: [
        termin({ id: 1, can_sign_up: true, is_full: false }),
        termin({ id: 2, can_sign_up: true, is_full: false }),
      ],
    });

    await user.click(within(kartaPierwsza).getByRole("button", { name: "Zapisz się" }));

    expect(
      await within(kartaPierwsza).findByText("Możesz zapisywać się tylko na terminy swojego superwizora."),
    ).toBeInTheDocument();
    expect(
      within(kartaDruga).queryByText("Możesz zapisywać się tylko na terminy swojego superwizora."),
    ).not.toBeInTheDocument();
  });
});
