import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { kartaPrzykladowa } from "./karta-fixtura";

/**
 * Wygląd i brzmienie karty osoby: zdania pisane po ludzku (bez nazw wewnętrznych
 * części systemu), jedna nazwa dziennika zgodna z menu, czytelne liczby i
 * rozmieszczenie sekcji. Treści i żądania do serwera pozostają bez zmian —
 * tu sprawdzamy wyłącznie to, co widzi osoba przy ekranie.
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

const { KartaOsoby } = await import("../KartaOsoby");

beforeEach(() => {
  pobierzKarteOsoby.mockReset().mockResolvedValue(kartaPrzykladowa());
  pobierzRzetelnoscOsoby.mockReset().mockResolvedValue({ reliability_percent: "73", below_threshold: false });
  pobierzRoleZalogowanej.mockReset().mockResolvedValue("project_manager");
  fetchAdminUsers.mockReset().mockResolvedValue({ data: [] });
});

async function otworzKarte() {
  render(<KartaOsoby id={17} />);
  await screen.findByRole("heading", { name: "Blokada konta" });
}

describe("Karta osoby — zdanie pod liczbami", () => {
  it("mówi, że te same liczby widzi osoba na pulpicie i w raporcie, bez nazwy wewnętrznego składnika", async () => {
    await otworzKarte();

    expect(screen.getByText("Te same liczby widzi osoba na swoim pulpicie i w raporcie.")).toBeInTheDocument();
    expect(screen.queryByText(/ProgressAggregator/)).toBeNull();
  });
});

describe("Karta osoby — zdanie o prowadzącym superwizje", () => {
  it("mówi zwykłym językiem, że poprzednie przypisanie kończy się samo", async () => {
    await otworzKarte();

    expect(
      screen.getByText("Wskazana osoba przejmuje superwizję tej osoby — poprzednie przypisanie kończy się samo."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/serwer zamyka/)).toBeNull();
  });
});
