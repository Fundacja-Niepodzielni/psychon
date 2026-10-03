import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axeViolations } from "@/components/__tests__/axe-helper";
import { kartaPrzykladowa } from "./karta-fixtura";

/**
 * Rola na karcie osoby jest tylko do odczytu: sekcja „Rola konta” pokazuje rolę
 * tekstem i zdanie „Rolę zmienia się w Kontach Niepodzielni.”, bez pola wyboru,
 * bez przycisku zapisu i bez żadnego żądania zmiany roli.
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

const { KartaOsoby } = await import("../KartaOsoby");

const ZDANIE = "Rolę zmienia się w Kontach Niepodzielni.";

/** Każde żądanie sieciowe, które mimo atrap wyszłoby z karty — z metodą i ciałem. */
const fetchSpy = vi.fn<(wejscie: RequestInfo | URL, opcje?: RequestInit) => Promise<Response>>(() =>
  Promise.reject(new Error("sieć wyłączona w próbie")),
);

beforeEach(() => {
  pobierzKarteOsoby.mockReset().mockResolvedValue(kartaPrzykladowa());
  pobierzRzetelnoscOsoby.mockReset().mockResolvedValue({ reliability_percent: null, below_threshold: false });
  pobierzRoleZalogowanej.mockReset().mockResolvedValue("project_manager");
  fetchAdminUsers.mockReset().mockResolvedValue({ data: [] });
  updateAdminUser.mockReset();
  fetchSpy.mockClear();
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function sekcjaRoli() {
  const naglowek = await screen.findByRole("heading", { name: "Rola konta" });
  return naglowek.closest("section") as HTMLElement;
}

function zadaniaPatch() {
  return fetchSpy.mock.calls.filter(([, opcje]) => String(opcje?.method ?? "").toUpperCase() === "PATCH");
}

describe("Karta osoby — rola tylko do odczytu", () => {
  it.each(["project_manager", "super_admin"])("rola %s widzi rolę osoby tekstem i zdanie o Kontach Niepodzielni", async (rola) => {
    pobierzRoleZalogowanej.mockResolvedValue(rola);
    pobierzKarteOsoby.mockResolvedValue(kartaPrzykladowa({ role: "instructor" }));
    render(<KartaOsoby id={17} />);

    const sekcja = await sekcjaRoli();
    expect(within(sekcja).getByText("Rola: Psycholog prowadzący")).toBeInTheDocument();
    expect(within(sekcja).getByText(ZDANIE)).toBeInTheDocument();
  });

  it("na karcie nie ma pola wyboru roli ani przycisku zapisu roli", async () => {
    render(<KartaOsoby id={17} />);
    const sekcja = await sekcjaRoli();

    expect(within(sekcja).queryByRole("combobox")).toBeNull();
    expect(within(sekcja).queryByRole("button")).toBeNull();
    expect(screen.queryByRole("combobox", { name: /^Rola/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Zapisz rolę" })).toBeNull();
  });

  it("karta nie wysyła żadnego żądania zmiany roli, także po kliknięciach w sekcji", async () => {
    const uzytkownik = userEvent.setup();
    render(<KartaOsoby id={17} />);
    const sekcja = await sekcjaRoli();
    await uzytkownik.click(within(sekcja).getByText("Rola: Wolontariusz"));
    await uzytkownik.click(within(sekcja).getByText(ZDANIE));
    await waitFor(() => expect(fetchAdminUsers).toHaveBeenCalled());

    expect(updateAdminUser).not.toHaveBeenCalled();
    expect(zadaniaPatch()).toEqual([]);
  });

  it("rola spoza słownika: zdanie o nieznanej roli, nie surowy klucz", async () => {
    pobierzKarteOsoby.mockResolvedValue(kartaPrzykladowa({ role: "constructor" }));
    render(<KartaOsoby id={17} />);
    const sekcja = await sekcjaRoli();

    expect(within(sekcja).getByText("Rola: nieznana")).toBeInTheDocument();
    expect(within(sekcja).queryByText(/constructor/)).toBeNull();
  });

  it.each(["instructor", "volunteer", "student"])("rola %s nie ma sekcji w drzewie", async (rola) => {
    pobierzRoleZalogowanej.mockResolvedValue(rola);
    render(<KartaOsoby id={17} />);
    await screen.findByText("Dostęp do materiałów do");
    await waitFor(() => expect(pobierzRoleZalogowanej).toHaveBeenCalled());
    expect(screen.queryByRole("heading", { name: "Rola konta" })).toBeNull();
    expect(screen.queryByText(ZDANIE)).toBeNull();
  });

  it("sekcja roli nie ma naruszeń dostępności", async () => {
    render(<KartaOsoby id={17} />);
    const sekcja = await sekcjaRoli();
    expect(await axeViolations(sekcja)).toEqual([]);
  });

  it("blok czynności administracji nie dołącza komponentu zmiany roli ani funkcji zapisu roli", () => {
    const zrodlo = readFileSync(resolve(__dirname, "..", "CzynnosciAdministracji.tsx"), "utf8");
    expect(zrodlo).not.toMatch(/ZmianaRoli/);
    expect(zrodlo).not.toMatch(/updateAdminUser/);
  });
});
