import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axeViolations } from "@/components/__tests__/axe-helper";
import { kartaPrzykladowa } from "./karta-fixtura";

/**
 * Zmiana roli z karty osoby: ta sama trasa i to samo pole co na starej stronie
 * (`PATCH /admin/users/{id}` z `role`), te same pięć wartości, widoczność według roli,
 * ponowne wczytanie karty po sukcesie, zdanie błędu z koperty (m.in. odmowa serwera
 * przy koncie Super Admina).
 */

const pobierzKarteOsoby = vi.fn();
const pobierzRzetelnoscOsoby = vi.fn();
const pobierzRoleZalogowanej = vi.fn();
const fetchAdminUsers = vi.fn();
const updateAdminUser = vi.fn();

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
    updateAdminUser: (...args: unknown[]) => updateAdminUser(...args),
  };
});

const { ApiError } = await import("@/lib/api/klient");
const { KartaOsoby } = await import("../KartaOsoby");

const PRZYCISK = "Zapisz rolę";

beforeEach(() => {
  pobierzKarteOsoby.mockReset().mockResolvedValue(kartaPrzykladowa());
  pobierzRzetelnoscOsoby.mockReset().mockResolvedValue({ reliability_percent: null, below_threshold: false });
  pobierzRoleZalogowanej.mockReset().mockResolvedValue("project_manager");
  fetchAdminUsers.mockReset().mockResolvedValue({ data: [] });
  updateAdminUser.mockReset();
});

async function wybierz(etykieta: RegExp) {
  render(<KartaOsoby id={17} />);
  await userEvent.click(await screen.findByRole("combobox", { name: /^Rola/ }));
  await userEvent.click(screen.getByRole("option", { name: etykieta }));
}

describe("Karta osoby — zmiana roli", () => {
  it.each(["project_manager", "super_admin"])("rola %s widzi sekcję z dotychczasową rolą osoby", async (rola) => {
    pobierzRoleZalogowanej.mockResolvedValue(rola);
    render(<KartaOsoby id={17} />);
    expect(await screen.findByRole("heading", { name: "Rola konta" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /^Rola/ })).toHaveTextContent("Wolontariusz");
  });

  it.each(["instructor", "volunteer", "student"])("rola %s nie ma sekcji w drzewie", async (rola) => {
    pobierzRoleZalogowanej.mockResolvedValue(rola);
    render(<KartaOsoby id={17} />);
    await screen.findByText("Dostęp do materiałów do");
    await waitFor(() => expect(pobierzRoleZalogowanej).toHaveBeenCalled());
    expect(screen.queryByRole("heading", { name: "Rola konta" })).toBeNull();
    expect(screen.queryByRole("button", { name: PRZYCISK })).toBeNull();
  });

  it("pole ma pięć ról z kontraktu", async () => {
    render(<KartaOsoby id={17} />);
    await userEvent.click(await screen.findByRole("combobox", { name: /^Rola/ }));
    expect(screen.getAllByRole("option").map((opcja) => opcja.textContent)).toEqual([
      "Super Admin",
      "Opiekun Projektu",
      "Psycholog prowadzący",
      "Wolontariusz",
      "Student",
    ]);
  });

  it("przycisk jest zablokowany, dopóki rola nie różni się od dotychczasowej", async () => {
    render(<KartaOsoby id={17} />);
    expect(await screen.findByRole("button", { name: PRZYCISK })).toBeDisabled();
    await userEvent.click(screen.getByRole("combobox", { name: /^Rola/ }));
    await userEvent.click(screen.getByRole("option", { name: "Student" }));
    expect(screen.getByRole("button", { name: PRZYCISK })).toBeEnabled();
    await userEvent.click(screen.getByRole("combobox", { name: /^Rola/ }));
    await userEvent.click(screen.getByRole("option", { name: "Wolontariusz" }));
    expect(screen.getByRole("button", { name: PRZYCISK })).toBeDisabled();
  });

  it("zapis woła trasę raz z samą rolą, potwierdza i wczytuje kartę ponownie", async () => {
    updateAdminUser.mockResolvedValue({});
    await wybierz(/^Psycholog prowadzący$/);
    await waitFor(() => expect(pobierzKarteOsoby).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole("button", { name: PRZYCISK }));

    expect(await screen.findByRole("status")).toHaveTextContent("Zmieniono rolę na: Psycholog prowadzący.");
    expect(updateAdminUser).toHaveBeenCalledTimes(1);
    expect(updateAdminUser).toHaveBeenCalledWith(17, { role: "instructor" });
    await waitFor(() => expect(pobierzKarteOsoby).toHaveBeenCalledTimes(2));
  });

  it("odmowa serwera: zdanie z koperty błędu, bez potwierdzenia, karta nie jest wczytywana ponownie", async () => {
    updateAdminUser.mockRejectedValue(
      new ApiError({ status: 403, code: "forbidden", message: "Kontami Super Admina zarządza wyłącznie Super Admin." }),
    );
    await wybierz(/^Super Admin$/);
    await userEvent.click(screen.getByRole("button", { name: PRZYCISK }));

    expect(await screen.findByText("Kontami Super Admina zarządza wyłącznie Super Admin.")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
    expect(pobierzKarteOsoby).toHaveBeenCalledTimes(1);
  });

  it("błąd bez koperty: zdanie zapasowe", async () => {
    updateAdminUser.mockRejectedValue(new Error("rozłączono"));
    await wybierz(/^Student$/);
    await userEvent.click(screen.getByRole("button", { name: PRZYCISK }));

    expect(await screen.findByText("Nie udało się zmienić roli.")).toBeInTheDocument();
  });
});
