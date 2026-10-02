import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axeViolations } from "@/components/__tests__/axe-helper";
import { kartaPrzykladowa } from "./karta-fixtura";

/**
 * Sekcja „Dokumenty” karty osoby: tylko do odczytu — rodzaj z polskiej etykiety i numer,
 * bez żadnej trasy zapisu; pusta lista jako zdanie; karta bez pola dokumentów nie wywraca ekranu.
 */

const pobierzKarteOsoby = vi.fn();
const pobierzRzetelnoscOsoby = vi.fn();
const pobierzRoleZalogowanej = vi.fn();
const fetchAdminUsers = vi.fn();

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
  };
});

const { ApiError } = await import("@/lib/api/klient");
const { KartaOsoby } = await import("../KartaOsoby");

beforeEach(() => {
  pobierzKarteOsoby.mockReset().mockResolvedValue(kartaPrzykladowa());
  pobierzRzetelnoscOsoby.mockReset().mockResolvedValue({ reliability_percent: null, below_threshold: false });
  pobierzRoleZalogowanej.mockReset().mockResolvedValue("project_manager");
  fetchAdminUsers.mockReset().mockResolvedValue({ data: [] });
});

describe("Karta osoby — dokumenty", () => {
  it("rodzaje i numery dokumentów po rozwinięciu sekcji, z liczbą w nagłówku", async () => {
    pobierzKarteOsoby.mockResolvedValue(
      kartaPrzykladowa({
        documents: [
          { id: 3, type: "volunteer_agreement", number: "NP/POR/2026/003" },
          { id: 4, type: "internship_certificate", number: "NP/ZAS/2026/004" },
        ],
      }),
    );
    render(<KartaOsoby id={17} />);
    const naglowek = await screen.findByRole("button", { name: "Dokumenty (2)" });
    expect(naglowek).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(naglowek);

    const wiersze = within(screen.getByTestId("dokumenty-lista")).getAllByRole("listitem");
    expect(wiersze).toHaveLength(2);
    expect(wiersze[0]).toHaveTextContent("Porozumienie wolontariackie");
    expect(wiersze[0]).toHaveTextContent("NP/POR/2026/003");
    expect(wiersze[1]).toHaveTextContent("Zaświadczenie o stażu");
    expect(wiersze[1]).toHaveTextContent("NP/ZAS/2026/004");
  });

  it("nieznany rodzaj dokumentu jest pokazany kodem z zaplecza, a nie gubiony", async () => {
    pobierzKarteOsoby.mockResolvedValue(kartaPrzykladowa({ documents: [{ id: 9, type: "inny_rodzaj", number: "X/1" }] }));
    render(<KartaOsoby id={17} />);
    await userEvent.click(await screen.findByRole("button", { name: "Dokumenty (1)" }));
    expect(screen.getByTestId("dokumenty-lista")).toHaveTextContent("inny_rodzaj");
  });

  it("brak dokumentów: zdanie zamiast pustej listy", async () => {
    render(<KartaOsoby id={17} />);
    await userEvent.click(await screen.findByRole("button", { name: "Dokumenty (0)" }));
    expect(screen.getByText("Brak dokumentów.")).toBeInTheDocument();
    expect(screen.queryByTestId("dokumenty-lista")).toBeNull();
  });

  it("odpowiedź bez pola dokumentów pokazuje to samo zdanie", async () => {
    const karta: Record<string, unknown> = { ...kartaPrzykladowa() };
    delete karta.documents;
    pobierzKarteOsoby.mockResolvedValue(karta);
    render(<KartaOsoby id={17} />);
    await userEvent.click(await screen.findByRole("button", { name: "Dokumenty (0)" }));
    expect(screen.getByText("Brak dokumentów.")).toBeInTheDocument();
  });

  it("sekcja nie ma żadnego przycisku zapisu ani usuwania", async () => {
    pobierzKarteOsoby.mockResolvedValue(kartaPrzykladowa({ documents: [{ id: 3, type: "volunteer_agreement", number: "NP/1" }] }));
    render(<KartaOsoby id={17} />);
    await userEvent.click(await screen.findByRole("button", { name: "Dokumenty (1)" }));
    const lista = screen.getByTestId("dokumenty-lista");
    expect(within(lista).queryAllByRole("button")).toHaveLength(0);
    expect(within(lista).queryAllByRole("link")).toHaveLength(0);
  });

  it("widoczna dla każdej roli, która otworzyła kartę, także bez bloku czynności", async () => {
    pobierzRoleZalogowanej.mockResolvedValue("instructor");
    render(<KartaOsoby id={17} />);
    expect(await screen.findByRole("button", { name: "Dokumenty (0)" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Rola konta" })).toBeNull();
  });
});
