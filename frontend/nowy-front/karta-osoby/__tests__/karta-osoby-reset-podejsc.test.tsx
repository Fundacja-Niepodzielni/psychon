import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axeViolations } from "@/components/__tests__/axe-helper";
import { kartaPrzykladowa } from "./karta-fixtura";

/**
 * Reset limitu podejść z karty osoby: ta sama trasa i to samo ciało co na starej stronie
 * (`POST /admin/tests/{test}/users/{user}/reset-attempts` z `reason`), wymagany powód i
 * poprawny identyfikator testu, pytanie potwierdzające z imieniem i nazwiskiem, widoczność
 * według roli, zdanie błędu, osobne zdanie dla odpowiedzi, która nie dotarła.
 */

const pobierzKarteOsoby = vi.fn();
const pobierzRzetelnoscOsoby = vi.fn();
const pobierzRoleZalogowanej = vi.fn();
const fetchAdminUsers = vi.fn();
const resetTestAttempts = vi.fn();

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

vi.mock("@/lib/api/h18", async () => {
  const rzeczywiste = await vi.importActual<typeof import("@/lib/api/h18")>("@/lib/api/h18");
  return { ...rzeczywiste, fetchAdminUsers: (...args: unknown[]) => fetchAdminUsers(...args) };
});

vi.mock("@/lib/api/h10", async () => {
  const rzeczywiste = await vi.importActual<typeof import("@/lib/api/h10")>("@/lib/api/h10");
  return { ...rzeczywiste, resetTestAttempts: (...args: unknown[]) => resetTestAttempts(...args) };
});

const { ApiError } = await import("@/lib/api/klient");
const { KartaOsoby } = await import("../KartaOsoby");

const PRZYCISK = "Zresetuj limit podejść";

beforeEach(() => {
  pobierzKarteOsoby.mockReset().mockResolvedValue(kartaPrzykladowa());
  pobierzRzetelnoscOsoby.mockReset().mockResolvedValue({ reliability_percent: null, below_threshold: false });
  pobierzRoleZalogowanej.mockReset().mockResolvedValue("project_manager");
  fetchAdminUsers.mockReset().mockResolvedValue({ data: [] });
  resetTestAttempts.mockReset();
});

async function wypelnij(idTestu = "4", powod = "Awaria platformy podczas testu") {
  render(<KartaOsoby id={17} />);
  await userEvent.type(await screen.findByLabelText(/Identyfikator testu/), idTestu);
  await userEvent.type(screen.getByLabelText(/Powód resetu/), powod);
}

async function otworzPytanie() {
  await wypelnij();
  await userEvent.click(screen.getByRole("button", { name: PRZYCISK }));
  return screen.getByRole("dialog");
}

/**
 * Limit czasu przypadków, które pod obciążeniem hosta (równoległe procesy, zimny pierwszy import)
 * trwają wielokrotnie dłużej niż domyślne 5000 ms. Wartość to większa z: trzykrotność maksimum
 * z 10 pomiarów na cichym hoście albo 15 000 ms; przy każdym przypadku stoi jego zmierzony czas.
 */
const LIMIT_PRZYPADKU_MS = 15_000;

describe("Karta osoby — reset limitu podejść", () => {
  it.each(["project_manager", "super_admin"])("rola %s widzi sekcję", async (rola) => {
    pobierzRoleZalogowanej.mockResolvedValue(rola);
    render(<KartaOsoby id={17} />);
    expect(await screen.findByRole("heading", { name: "Reset limitu podejść" })).toBeInTheDocument();
  });

  it.each(["instructor", "volunteer", "student"])("rola %s nie ma sekcji w drzewie", async (rola) => {
    pobierzRoleZalogowanej.mockResolvedValue(rola);
    render(<KartaOsoby id={17} />);
    await screen.findByText("Dostęp do materiałów do");
    await waitFor(() => expect(pobierzRoleZalogowanej).toHaveBeenCalled());
    expect(screen.queryByRole("heading", { name: "Reset limitu podejść" })).toBeNull();
    expect(screen.queryByRole("button", { name: PRZYCISK })).toBeNull();
  });

  it("przycisk jest zablokowany bez powodu albo z niepoprawnym identyfikatorem testu", async () => {
    render(<KartaOsoby id={17} />);
    const przycisk = await screen.findByRole("button", { name: PRZYCISK });
    expect(przycisk).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/Identyfikator testu/), "4");
    expect(przycisk).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/Powód resetu/), "   ");
    expect(przycisk).toBeDisabled();

    await userEvent.clear(screen.getByLabelText(/Identyfikator testu/));
    await userEvent.type(screen.getByLabelText(/Identyfikator testu/), "0");
    await userEvent.type(screen.getByLabelText(/Powód resetu/), "Powód");
    expect(przycisk).toBeDisabled();
  });

  // zmierzone na cichym hoście: maks. 0,8 s z 10; limit 3× i co najmniej 15 s
  it("pytanie pokazuje imię i nazwisko oraz numer testu, bez żądania, a okno nie ma naruszeń dostępności", { timeout: LIMIT_PRZYPADKU_MS }, async () => {
    const okno = await otworzPytanie();

    expect(within(okno).getByText(/Marta Demo/)).toHaveTextContent("Test nr 4");
    expect(within(okno).getByRole("button", { name: "Zresetuj limit" })).toBeInTheDocument();
    expect(resetTestAttempts).not.toHaveBeenCalled();
    expect(await axeViolations(okno)).toEqual([]);
  });

  // zmierzone na cichym hoście: maks. 0,8 s z 10; limit 3× i co najmniej 15 s
  it("„Anuluj” zamyka okno i nie woła trasy", { timeout: LIMIT_PRZYPADKU_MS }, async () => {
    const okno = await otworzPytanie();
    await userEvent.click(within(okno).getByRole("button", { name: "Anuluj" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(resetTestAttempts).not.toHaveBeenCalled();
  });

  // zmierzone na cichym hoście: maks. 0,9 s z 10; limit 3× i co najmniej 15 s
  it("potwierdzenie woła trasę raz z testem, osobą i przyciętym powodem; po sukcesie potwierdzenie z liczbą i pusty powód", { timeout: LIMIT_PRZYPADKU_MS }, async () => {
    resetTestAttempts.mockResolvedValue({ test_id: 4, user_id: 17, cleared: 3, attempts_used: 0, attempts_limit: 3 });
    await wypelnij("4", "  Awaria platformy podczas testu  ");
    await userEvent.click(screen.getByRole("button", { name: PRZYCISK }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Zresetuj limit" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Wyczyszczono 3 podejścia — limit tej osoby do tego testu to teraz 3.");
    expect(resetTestAttempts).toHaveBeenCalledTimes(1);
    expect(resetTestAttempts).toHaveBeenCalledWith(4, 17, "Awaria platformy podczas testu");
    expect(screen.getByLabelText(/Powód resetu/)).toHaveValue("");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // zmierzone na cichym hoście: maks. 0,8 s z 10; limit 3× i co najmniej 15 s
  it("odmowa serwera: zdanie z koperty błędu, bez potwierdzenia, powód zostaje", { timeout: LIMIT_PRZYPADKU_MS }, async () => {
    resetTestAttempts.mockRejectedValue(new ApiError({ status: 404, code: "not_found", message: "Nie znaleziono testu." }));
    await wypelnij();
    await userEvent.click(screen.getByRole("button", { name: PRZYCISK }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Zresetuj limit" }));

    expect(await screen.findByText("Nie znaleziono testu.")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByLabelText(/Powód resetu/)).toHaveValue("Awaria platformy podczas testu");
  });

  it("odpowiedź, która nie dotarła: zdanie, że nie wiadomo, czy reset się wykonał", async () => {
    resetTestAttempts.mockRejectedValue(new Error("rozłączono"));
    await wypelnij();
    await userEvent.click(screen.getByRole("button", { name: PRZYCISK }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Zresetuj limit" }));

    expect(await screen.findByText("Nie wiadomo, czy reset się wykonał")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
