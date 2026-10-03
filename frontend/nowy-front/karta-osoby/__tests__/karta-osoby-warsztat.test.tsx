import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axeViolations } from "@/components/__tests__/axe-helper";

/**
 * Zaznaczenie warsztatu jako zaliczonego z karty osoby: przycisk tylko dla dwóch
 * ról administracji i tylko przy nieukończonym warsztacie, pytanie potwierdzające,
 * jedno żądanie bez ciała, stan po sukcesie i zdania po odmowie.
 */

const pobierzKarteOsoby = vi.fn();
const pobierzRzetelnoscOsoby = vi.fn();
const pobierzRoleZalogowanej = vi.fn();
const markWorkshopComplete = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("../dane", async () => {
  const rzeczywiste = await vi.importActual<typeof import("../dane")>("../dane");
  return {
    ...rzeczywiste,
    pobierzKarteOsoby: (...args: unknown[]) => pobierzKarteOsoby(...args),
    pobierzRzetelnoscOsoby: (...args: unknown[]) => pobierzRzetelnoscOsoby(...args),
    pobierzRoleZalogowanej: (...args: unknown[]) => pobierzRoleZalogowanej(...args),
  };
});

vi.mock("@/lib/api/h10", () => ({
  markWorkshopComplete: (...args: unknown[]) => markWorkshopComplete(...args),
}));

const { ApiError } = await import("@/lib/api/klient");
const { KartaOsoby } = await import("../KartaOsoby");

function karta(workshopDone: boolean) {
  return {
    profile: {
      id: 17,
      first_name: "Marta",
      last_name: "Demo",
      email: "marta@demo.pl",
      role: "volunteer",
      phone: null,
      pesel: null,
      address: { street: "", city: "", zip: "" },
      access_expires_at: "2027-02-01T00:00:00Z",
      program_completed_at: null,
      product_group: "psychon",
    },
    progress: {
      courses_done: 1,
      courses_total: 10,
      hours_accepted: "0",
      supervision_present: 0,
      workshop_done: workshopDone,
      path_tests_passed: 0,
      path_tests_total: 4,
    },
    recent_notifications: [],
    audit_entries: [],
  };
}

const PRZYCISK = "Zaznacz warsztat jako zaliczony";

beforeEach(() => {
  pobierzKarteOsoby.mockReset().mockResolvedValue(karta(false));
  pobierzRzetelnoscOsoby.mockReset().mockResolvedValue({ reliability_percent: null, below_threshold: false });
  pobierzRoleZalogowanej.mockReset().mockResolvedValue("project_manager");
  markWorkshopComplete.mockReset();
});

async function otworzPytanie() {
  render(<KartaOsoby id={17} />);
  await userEvent.click(await screen.findByRole("button", { name: PRZYCISK }));
  return screen.getByRole("dialog");
}

describe("Karta osoby — zaznaczenie warsztatu", () => {
  it.each(["project_manager", "super_admin"])("rola %s widzi przycisk przy nieukończonym warsztacie", async (rola) => {
    pobierzRoleZalogowanej.mockResolvedValue(rola);
    render(<KartaOsoby id={17} />);
    expect(await screen.findByRole("button", { name: PRZYCISK })).toBeInTheDocument();
  });

  it.each(["instructor", "volunteer", "student"])("rola %s nie ma przycisku w drzewie", async (rola) => {
    pobierzRoleZalogowanej.mockResolvedValue(rola);
    render(<KartaOsoby id={17} />);
    await screen.findByText("Dostęp do materiałów do");
    await waitFor(() => expect(pobierzRoleZalogowanej).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: PRZYCISK })).toBeNull();
  });

  it("nieznana rola (odczyt konta się nie udał) nie daje przycisku, a karta działa", async () => {
    pobierzRoleZalogowanej.mockRejectedValue(new Error("sieć"));
    render(<KartaOsoby id={17} />);
    await screen.findByText("Dostęp do materiałów do");
    expect(screen.queryByRole("button", { name: PRZYCISK })).toBeNull();
  });

  it("warsztat już ukończony: przycisku nie ma nawet dla administracji", async () => {
    pobierzKarteOsoby.mockResolvedValue(karta(true));
    render(<KartaOsoby id={17} />);
    await screen.findByText("Dostęp do materiałów do");
    await waitFor(() => expect(pobierzRoleZalogowanej).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: PRZYCISK })).toBeNull();
  });

  it("kliknięcie otwiera pytanie z imieniem i nazwiskiem oraz zdaniem o braku cofnięcia, bez żądania zapisu", async () => {
    const okno = await otworzPytanie();

    expect(within(okno).getByText("Zaznaczyć warsztat jako zaliczony?")).toBeInTheDocument();
    expect(within(okno).getByText(/Marta Demo/)).toBeInTheDocument();
    expect(within(okno).getByText("Tego nie da się cofnąć z ekranu.")).toBeInTheDocument();
    expect(within(okno).getByRole("button", { name: "Zaznacz jako zaliczony" })).toBeInTheDocument();
    expect(within(okno).getByRole("button", { name: "Anuluj" })).toBeInTheDocument();
    expect(markWorkshopComplete).not.toHaveBeenCalled();
  });

  it("okno pytania nie ma naruszeń dostępności", async () => {
    const okno = await otworzPytanie();
    expect(await axeViolations(okno)).toEqual([]);
  });

  it("„Anuluj” zamyka okno i nie woła trasy", async () => {
    const okno = await otworzPytanie();
    await userEvent.click(within(okno).getByRole("button", { name: "Anuluj" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(markWorkshopComplete).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: PRZYCISK })).toBeInTheDocument();
  });

  it("Escape zamyka okno według zastanego elementu i nie woła trasy", async () => {
    await otworzPytanie();
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(markWorkshopComplete).not.toHaveBeenCalled();
  });

  it("potwierdzenie woła trasę dokładnie raz z identyfikatorem osoby; po sukcesie wiersz ukończony, przycisk znika, komunikat w drzewie dostępności", async () => {
    markWorkshopComplete.mockResolvedValue({ user_id: 17, edition_id: 1, completed_at: "2026-10-02T12:00:00Z", workshop_done: true });
    pobierzKarteOsoby.mockResolvedValueOnce(karta(false)).mockResolvedValue(karta(true));
    const okno = await otworzPytanie();

    await userEvent.click(within(okno).getByRole("button", { name: "Zaznacz jako zaliczony" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Zaznaczono warsztat jako zaliczony.");
    expect(markWorkshopComplete).toHaveBeenCalledTimes(1);
    expect(markWorkshopComplete).toHaveBeenCalledWith(17);
    await waitFor(() => expect(screen.queryByRole("button", { name: PRZYCISK })).toBeNull());
    expect(screen.getByText("ukończony")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("po potwierdzeniu fokus trafia na nagłówek bloku warsztatu — przycisk, który otworzył pytanie, znika", async () => {
    markWorkshopComplete.mockResolvedValue({ user_id: 17, edition_id: 1, completed_at: "2026-10-02T12:00:00Z", workshop_done: true });
    pobierzKarteOsoby.mockResolvedValueOnce(karta(false)).mockResolvedValue(karta(true));
    const okno = await otworzPytanie();

    await userEvent.click(within(okno).getByRole("button", { name: "Zaznacz jako zaliczony" }));

    const naglowek = screen.getByRole("heading", { level: 2, name: "Warsztat stacjonarny" });
    expect(naglowek).toHaveFocus();
    await waitFor(() => expect(screen.queryByRole("button", { name: PRZYCISK })).toBeNull());
    expect(naglowek).toHaveFocus();
    expect(screen.getByText("Warsztat zaliczony.")).toBeInTheDocument();
  });

  it("„Anuluj” oddaje fokus przyciskowi, który nadal istnieje", async () => {
    const okno = await otworzPytanie();
    await userEvent.click(within(okno).getByRole("button", { name: "Anuluj" }));
    expect(screen.getByRole("button", { name: PRZYCISK })).toHaveFocus();
  });

  it("blok warsztatu ma stały nagłówek także po zaliczeniu (dla administracji)", async () => {
    pobierzKarteOsoby.mockResolvedValue(karta(true));
    render(<KartaOsoby id={17} />);
    expect(await screen.findByRole("heading", { level: 2, name: "Warsztat stacjonarny" })).toBeInTheDocument();
    expect(screen.getByText("Warsztat zaliczony.")).toBeInTheDocument();
  });

  it("w trakcie żądania przycisk jest zablokowany", async () => {
    let zakoncz: (wartosc: unknown) => void = () => undefined;
    markWorkshopComplete.mockReturnValue(new Promise((resolve) => (zakoncz = resolve)));
    const okno = await otworzPytanie();

    await userEvent.click(within(okno).getByRole("button", { name: "Zaznacz jako zaliczony" }));

    expect(screen.getByRole("button", { name: PRZYCISK })).toBeDisabled();
    expect(markWorkshopComplete).toHaveBeenCalledTimes(1);
    zakoncz({ user_id: 17, edition_id: 1, completed_at: null, workshop_done: true });
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
  });

  it("odmowa roli: zdanie po polsku bez kodu, wiersz i przycisk bez zmian, brak komunikatu o sukcesie", async () => {
    markWorkshopComplete.mockRejectedValue(new ApiError({ status: 403, code: "forbidden", message: "Brak dostępu." }));
    const okno = await otworzPytanie();
    await userEvent.click(within(okno).getByRole("button", { name: "Zaznacz jako zaliczony" }));

    expect(await screen.findByText("Nie masz uprawnień do tej czynności.")).toBeInTheDocument();
    expect(screen.queryByText(/forbidden|403/)).toBeNull();
    expect(screen.getByRole("button", { name: PRZYCISK })).toBeEnabled();
    expect(screen.getByText("nieukończony")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("inny błąd zaplecza: komunikat z koperty błędu; bez komunikatu — zdanie ogólne", async () => {
    markWorkshopComplete.mockRejectedValueOnce(
      new ApiError({ status: 422, code: "validation_failed", message: "Nie ma aktywnej edycji." }),
    );
    let okno = await otworzPytanie();
    await userEvent.click(within(okno).getByRole("button", { name: "Zaznacz jako zaliczony" }));
    expect(await screen.findByText("Nie ma aktywnej edycji.")).toBeInTheDocument();

    markWorkshopComplete.mockRejectedValueOnce(new Error("rozłączono"));
    await userEvent.click(screen.getByRole("button", { name: PRZYCISK }));
    okno = screen.getByRole("dialog");
    await userEvent.click(within(okno).getByRole("button", { name: "Zaznacz jako zaliczony" }));
    expect(await screen.findByText("Nie udało się zapisać. Spróbuj ponownie.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: PRZYCISK })).toBeEnabled();
  });
});
