import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axeViolations } from "@/components/__tests__/axe-helper";
import { kartaPrzykladowa } from "./karta-fixtura";

/**
 * Blokada konta z karty osoby: ta sama trasa i to samo ciało co na starej stronie
 * (`POST /admin/users/{id}/block` z `reason`), wymagany powód, pytanie z imieniem i
 * nazwiskiem, ponowne wczytanie karty po sukcesie, widoczność według roli, zdanie błędu.
 */

const pobierzKarteOsoby = vi.fn();
const pobierzRzetelnoscOsoby = vi.fn();
const pobierzRoleZalogowanej = vi.fn();
const fetchAdminUsers = vi.fn();
const blockAdminUser = vi.fn();

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
  return {
    ...rzeczywiste,
    fetchAdminUsers: (...args: unknown[]) => fetchAdminUsers(...args),
    blockAdminUser: (...args: unknown[]) => blockAdminUser(...args),
  };
});

const { ApiError } = await import("@/lib/api/klient");
const { KartaOsoby } = await import("../KartaOsoby");

const PRZYCISK = "Zablokuj konto";

beforeEach(() => {
  pobierzKarteOsoby.mockReset().mockResolvedValue(kartaPrzykladowa());
  pobierzRzetelnoscOsoby.mockReset().mockResolvedValue({ reliability_percent: null, below_threshold: false });
  pobierzRoleZalogowanej.mockReset().mockResolvedValue("project_manager");
  fetchAdminUsers.mockReset().mockResolvedValue({ data: [] });
  blockAdminUser.mockReset();
});

async function wpiszPowod(powod = "Konto używane przez inną osobę") {
  render(<KartaOsoby id={17} />);
  await userEvent.type(await screen.findByLabelText(/Powód blokady/), powod);
}

async function potwierdz() {
  await userEvent.click(screen.getByRole("button", { name: PRZYCISK }));
  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Zablokuj konto" }));
}

describe("Karta osoby — blokada konta", () => {
  it.each(["project_manager", "super_admin"])("rola %s widzi sekcję", async (rola) => {
    pobierzRoleZalogowanej.mockResolvedValue(rola);
    render(<KartaOsoby id={17} />);
    expect(await screen.findByRole("heading", { name: "Blokada konta" })).toBeInTheDocument();
  });

  it.each(["instructor", "volunteer", "student"])("rola %s nie ma sekcji w drzewie", async (rola) => {
    pobierzRoleZalogowanej.mockResolvedValue(rola);
    render(<KartaOsoby id={17} />);
    await screen.findByText("Dostęp do materiałów do");
    await waitFor(() => expect(pobierzRoleZalogowanej).toHaveBeenCalled());
    expect(screen.queryByRole("heading", { name: "Blokada konta" })).toBeNull();
    expect(screen.queryByRole("button", { name: PRZYCISK })).toBeNull();
  });

  it("przycisk jest zablokowany bez powodu i przy samych spacjach", async () => {
    render(<KartaOsoby id={17} />);
    const przycisk = await screen.findByRole("button", { name: PRZYCISK });
    expect(przycisk).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Powód blokady/), "   ");
    expect(przycisk).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Powód blokady/), "Powód");
    expect(przycisk).toBeEnabled();
  });

  it("pytanie pokazuje imię i nazwisko, nie woła trasy, a okno nie ma naruszeń dostępności", async () => {
    await wpiszPowod();
    await userEvent.click(screen.getByRole("button", { name: PRZYCISK }));
    const okno = screen.getByRole("dialog");

    expect(within(okno).getByText(/Marta Demo/)).toBeInTheDocument();
    expect(blockAdminUser).not.toHaveBeenCalled();
    expect(await axeViolations(okno)).toEqual([]);
  });

  it("„Anuluj” zamyka okno i nie woła trasy", async () => {
    await wpiszPowod();
    await userEvent.click(screen.getByRole("button", { name: PRZYCISK }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Anuluj" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(blockAdminUser).not.toHaveBeenCalled();
  });

  it("potwierdzenie woła trasę raz z osobą i przyciętym powodem, potwierdza i wczytuje kartę ponownie", async () => {
    blockAdminUser.mockResolvedValue({});
    await wpiszPowod("  Konto używane przez inną osobę  ");
    await waitFor(() => expect(pobierzKarteOsoby).toHaveBeenCalledTimes(1));
    await potwierdz();

    expect(await screen.findByRole("status")).toHaveTextContent("Zablokowano konto: Marta Demo.");
    expect(blockAdminUser).toHaveBeenCalledTimes(1);
    expect(blockAdminUser).toHaveBeenCalledWith(17, "Konto używane przez inną osobę");
    await waitFor(() => expect(pobierzKarteOsoby).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText(/Powód blokady/)).toHaveValue("");
  });

  it("odmowa serwera: zdanie z koperty błędu, bez potwierdzenia, powód zostaje, karta nie jest wczytywana ponownie", async () => {
    blockAdminUser.mockRejectedValue(
      new ApiError({ status: 403, code: "forbidden", message: "Kontami Super Admina zarządza wyłącznie Super Admin." }),
    );
    await wpiszPowod();
    await potwierdz();

    expect(await screen.findByText("Kontami Super Admina zarządza wyłącznie Super Admin.")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByLabelText(/Powód blokady/)).toHaveValue("Konto używane przez inną osobę");
    expect(pobierzKarteOsoby).toHaveBeenCalledTimes(1);
  });

  it("błąd bez koperty: zdanie zapasowe", async () => {
    blockAdminUser.mockRejectedValue(new Error("rozłączono"));
    await wpiszPowod();
    await potwierdz();

    expect(await screen.findByText("Nie udało się zablokować konta.")).toBeInTheDocument();
  });

  it("karta Super Admina niesie zdanie o tym, kto zarządza jego kontem", async () => {
    pobierzKarteOsoby.mockResolvedValue(kartaPrzykladowa({ role: "super_admin" }));
    render(<KartaOsoby id={17} />);
    expect(await screen.findByText("Kontami Super Admina zarządza wyłącznie Super Admin.")).toBeInTheDocument();
  });

  it("karta zwykłej osoby nie niesie tego zdania", async () => {
    render(<KartaOsoby id={17} />);
    await screen.findByRole("heading", { name: "Blokada konta" });
    expect(screen.queryByText("Kontami Super Admina zarządza wyłącznie Super Admin.")).toBeNull();
  });
});
