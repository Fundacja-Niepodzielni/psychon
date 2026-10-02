import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Odwołanie terminu superwizji ze stanem „Odwołany”:
 *  - akcje „Edytuj” i „Odwołaj termin” stoją w wierszu tabeli;
 *  - okno potwierdzenia ma datę w tytule i liczbę zapisanych osób;
 *  - po odwołaniu wiersz ZOSTAJE z plakietką „Odwołany” i bez akcji, a
 *    powiadomienie podaje liczbę powiadomionych osób z odmianą;
 *  - odmowa 409/422 pokazuje zdanie serwera i „Wczytaj terminy ponownie”;
 *  - na ekranie nie ma napisów „H12” ani „UTC”.
 */

const fetchAdminSupervisionSlots = vi.fn();
const updateAdminSupervisionSlot = vi.fn();
const cancelAdminSupervisionSlot = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/api/h12", () => ({
  fetchAdminSupervisionSlots: (...args: unknown[]) => fetchAdminSupervisionSlots(...args),
  updateAdminSupervisionSlot: (...args: unknown[]) => updateAdminSupervisionSlot(...args),
  cancelAdminSupervisionSlot: (...args: unknown[]) => cancelAdminSupervisionSlot(...args),
}));

const { ApiError } = await import("@/lib/api/klient");
const { SuperwizjeTerminy, trescPotwierdzeniaOdwolania, zdaniePoOdwolaniu } = await import("../SuperwizjeTerminy");

const ZAPLANOWANY = {
  id: 9,
  starts_at: "2026-10-03T12:00:00Z",
  duration_minutes: 60,
  seats_limit: 6,
  location_or_link: "Sala 2",
  status: "scheduled" as const,
  cancelled_at: null,
  supervisor: { id: 5, first_name: "Joanna", last_name: "Demo" },
  active_signups_count: 3,
  available_seats: 3,
  signups: [],
};

const ODWOLANY = {
  ...ZAPLANOWANY,
  id: 10,
  starts_at: "2026-10-04T12:00:00Z",
  status: "cancelled" as const,
  cancelled_at: "2026-10-02T09:00:00Z",
  active_signups_count: 0,
  available_seats: 6,
};

beforeEach(() => {
  fetchAdminSupervisionSlots.mockReset().mockResolvedValue({ data: [ZAPLANOWANY] });
  updateAdminSupervisionSlot.mockReset();
  cancelAdminSupervisionSlot.mockReset();
});

async function otworzOkno() {
  const uzytkownik = userEvent.setup();
  render(<SuperwizjeTerminy />);
  const wiersz = await screen.findByTestId("termin-9");
  await uzytkownik.click(within(wiersz).getByRole("button", { name: "Odwołaj termin" }));
  return { uzytkownik, okno: screen.getByRole("dialog") };
}

describe("Terminy superwizji — odwołanie", () => {
  it("wiersz ma obie akcje; okno ma datę w tytule i liczbę zapisanych osób", async () => {
    const { okno } = await otworzOkno();

    expect(within(okno).getByRole("heading", { name: "Odwołać termin 3 października 2026, 14:00?" })).toBeInTheDocument();
    expect(okno).toHaveTextContent(
      "Zapisane osoby: 3. Każda dostanie powiadomienie. Termin zostanie na liście ze stanem „Odwołany”.",
    );
    expect(within(okno).getByRole("button", { name: "Nie odwołuj" })).toBeInTheDocument();
    expect(cancelAdminSupervisionSlot).not.toHaveBeenCalled();
  });

  it("przy zerze zapisanych okno mówi, że nikt nie jest zapisany", async () => {
    fetchAdminSupervisionSlots.mockResolvedValue({
      data: [{ ...ZAPLANOWANY, active_signups_count: 0, available_seats: 6 }],
    });
    const { okno } = await otworzOkno();

    expect(okno).toHaveTextContent("Nikt nie jest zapisany na ten termin.");
    expect(okno).not.toHaveTextContent("Zapisane osoby:");
  });

  it("„Nie odwołuj” zamyka okno bez wywołania trasy", async () => {
    const { uzytkownik, okno } = await otworzOkno();
    await uzytkownik.click(within(okno).getByRole("button", { name: "Nie odwołuj" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(cancelAdminSupervisionSlot).not.toHaveBeenCalled();
  });

  it("po odwołaniu wiersz zostaje z plakietką „Odwołany” i bez akcji, powiadomienie z liczbą", async () => {
    cancelAdminSupervisionSlot.mockResolvedValue({ id: 9, signups_released: 3, cancelled_at: "2026-10-02T15:00:00Z" });
    const { uzytkownik, okno } = await otworzOkno();
    await uzytkownik.click(within(okno).getByRole("button", { name: "Odwołaj termin" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Termin odwołany. Powiadomiono 3 osoby.");
    expect(cancelAdminSupervisionSlot).toHaveBeenCalledWith(9);
    const wiersz = screen.getByTestId("termin-9");
    expect(wiersz).toHaveTextContent("Odwołany");
    expect(within(wiersz).queryByRole("button")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetchAdminSupervisionSlots).toHaveBeenCalledTimes(1);
  });

  it("termin odwołany z serwera: plakietka „Odwołany”, brak akcji; zaplanowany ma obie akcje", async () => {
    fetchAdminSupervisionSlots.mockResolvedValue({ data: [ZAPLANOWANY, ODWOLANY] });
    render(<SuperwizjeTerminy />);

    const odwolany = await screen.findByTestId("termin-10");
    expect(within(odwolany).getByText("Odwołany")).toBeInTheDocument();
    expect(within(odwolany).queryByRole("button")).toBeNull();

    const zaplanowany = screen.getByTestId("termin-9");
    expect(within(zaplanowany).queryByText("Odwołany")).toBeNull();
    expect(within(zaplanowany).getByRole("button", { name: "Edytuj" })).toBeInTheDocument();
    expect(within(zaplanowany).getByRole("button", { name: "Odwołaj termin" })).toBeInTheDocument();
  });

  it("409: zdanie serwera i „Wczytaj terminy ponownie” wczytuje listę jeszcze raz", async () => {
    cancelAdminSupervisionSlot.mockRejectedValue(
      new ApiError({ status: 409, code: "slot_cancelled", message: "Ten termin jest już odwołany." }),
    );
    const { uzytkownik, okno } = await otworzOkno();
    await uzytkownik.click(within(okno).getByRole("button", { name: "Odwołaj termin" }));

    expect(await screen.findByText("Ten termin jest już odwołany.")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
    fetchAdminSupervisionSlots.mockResolvedValue({ data: [ODWOLANY] });
    await uzytkownik.click(screen.getByRole("button", { name: "Wczytaj terminy ponownie" }));

    await waitFor(() => expect(fetchAdminSupervisionSlots).toHaveBeenCalledTimes(2));
    expect(await screen.findByTestId("termin-10")).toHaveTextContent("Odwołany");
    expect(screen.queryByText("Ten termin jest już odwołany.")).toBeNull();
  });

  it("422 (termin rozpoczęty): zdanie serwera i przycisk ponownego wczytania", async () => {
    cancelAdminSupervisionSlot.mockRejectedValue(
      new ApiError({ status: 422, code: "validation_failed", message: "Rozpoczętego terminu nie można odwołać." }),
    );
    const { uzytkownik, okno } = await otworzOkno();
    await uzytkownik.click(within(okno).getByRole("button", { name: "Odwołaj termin" }));

    expect(await screen.findByText("Rozpoczętego terminu nie można odwołać.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Wczytaj terminy ponownie" })).toBeInTheDocument();
  });

  it("409 przy edycji odwołanego terminu: zdanie serwera i przycisk ponownego wczytania w panelu", async () => {
    const uzytkownik = userEvent.setup();
    updateAdminSupervisionSlot.mockRejectedValue(
      new ApiError({ status: 409, code: "slot_cancelled", message: "Odwołanego terminu nie można zmienić." }),
    );
    render(<SuperwizjeTerminy />);
    await uzytkownik.click(await screen.findByRole("button", { name: "Edytuj" }));
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz" }));

    expect(await screen.findByText("Odwołanego terminu nie można zmienić.")).toBeInTheDocument();
    await uzytkownik.click(screen.getByRole("button", { name: "Wczytaj terminy ponownie" }));
    await waitFor(() => expect(fetchAdminSupervisionSlots).toHaveBeenCalledTimes(2));
  });

  it("na ekranie nie ma napisów „H12” ani „UTC” (lista i panel edycji)", async () => {
    const uzytkownik = userEvent.setup();
    const { container } = render(<SuperwizjeTerminy />);
    await uzytkownik.click(await screen.findByRole("button", { name: "Edytuj" }));

    expect(screen.getByText("Edycja i odwołanie terminów wszystkich prowadzących. Zapisy są tylko do odczytu.")).toBeInTheDocument();
    expect(screen.getByText("Czas lokalny Twojej przeglądarki.")).toBeInTheDocument();
    expect(container.textContent ?? "").not.toMatch(/H12|UTC/);
  });

  it("błąd wczytania: zdanie bez nazwy pakietu i „Spróbuj ponownie” wczytuje listę jeszcze raz", async () => {
    const uzytkownik = userEvent.setup();
    fetchAdminSupervisionSlots.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { container } = render(<SuperwizjeTerminy />);

    expect(await screen.findByText("Nie udało się wczytać terminów.")).toBeInTheDocument();
    expect(container.textContent ?? "").not.toMatch(/H12|Backend/);
    await uzytkownik.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));

    expect(await screen.findByTestId("termin-9")).toBeInTheDocument();
    expect(fetchAdminSupervisionSlots).toHaveBeenCalledTimes(2);
  });
});

describe("Terminy superwizji — zdania z liczbą", () => {
  it("powiadomienie po odwołaniu odmienia „osoba” i ma osobne zdanie dla zera", () => {
    expect(zdaniePoOdwolaniu(0)).toBe("Termin odwołany. Nikt nie był zapisany.");
    expect(zdaniePoOdwolaniu(1)).toBe("Termin odwołany. Powiadomiono 1 osobę.");
    expect(zdaniePoOdwolaniu(2)).toBe("Termin odwołany. Powiadomiono 2 osoby.");
    expect(zdaniePoOdwolaniu(5)).toBe("Termin odwołany. Powiadomiono 5 osób.");
    expect(zdaniePoOdwolaniu(12)).toBe("Termin odwołany. Powiadomiono 12 osób.");
    expect(zdaniePoOdwolaniu(22)).toBe("Termin odwołany. Powiadomiono 22 osoby.");
  });

  it("treść okna: liczba zapisanych albo zdanie o braku zapisów", () => {
    expect(trescPotwierdzeniaOdwolania(0)).toBe("Nikt nie jest zapisany na ten termin.");
    expect(trescPotwierdzeniaOdwolania(1)).toBe(
      "Zapisane osoby: 1. Każda dostanie powiadomienie. Termin zostanie na liście ze stanem „Odwołany”.",
    );
  });
});
