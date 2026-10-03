import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { kartaPrzykladowa } from "./karta-fixtura";

/**
 * Przypisanie prowadzącego superwizje z karty osoby: ta sama trasa i te same pola co
 * na starej stronie (`PUT /admin/users/{id}/supervisor` z `supervisor_id`), lista kandydatów
 * z `GET /admin/users?role=instructor`, widoczność według roli zalogowanej, błąd zdaniem.
 */

const pobierzKarteOsoby = vi.fn();
const pobierzRzetelnoscOsoby = vi.fn();
const pobierzRoleZalogowanej = vi.fn();
const fetchAdminUsers = vi.fn();
const assignSupervisor = vi.fn();

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
    assignSupervisor: (...args: unknown[]) => assignSupervisor(...args),
  };
});

const { ApiError } = await import("@/lib/api/klient");
const { KartaOsoby } = await import("../KartaOsoby");

const INSTRUKTORZY = [
  { id: 5, first_name: "Joanna", last_name: "Prowadząca", email: "joanna@demo.pl", role: "instructor" },
  { id: 6, first_name: "Piotr", last_name: "Drugi", email: "piotr@demo.pl", role: "instructor" },
];

beforeEach(() => {
  pobierzKarteOsoby.mockReset().mockResolvedValue(kartaPrzykladowa());
  pobierzRzetelnoscOsoby.mockReset().mockResolvedValue({ reliability_percent: null, below_threshold: false });
  pobierzRoleZalogowanej.mockReset().mockResolvedValue("project_manager");
  fetchAdminUsers.mockReset().mockResolvedValue({ data: INSTRUKTORZY });
  assignSupervisor.mockReset();
});

async function wybierzProwadzacego() {
  render(<KartaOsoby id={17} />);
  await userEvent.click(await screen.findByRole("combobox", { name: /^Prowadzący/ }));
  await userEvent.click(await screen.findByRole("option", { name: /Joanna Prowadząca/ }));
}

describe("Karta osoby — prowadzący superwizje", () => {
  it.each(["project_manager", "super_admin"])("rola %s widzi sekcję i pobiera kandydatów trasą z rolą instructor", async (rola) => {
    pobierzRoleZalogowanej.mockResolvedValue(rola);
    render(<KartaOsoby id={17} />);

    expect(await screen.findByRole("heading", { name: "Prowadzący superwizje" })).toBeInTheDocument();
    await waitFor(() => expect(fetchAdminUsers).toHaveBeenCalledWith({ role: "instructor", per_page: 100 }));
  });

  it.each(["instructor", "volunteer", "student"])("rola %s nie ma sekcji w drzewie i nie pobiera listy", async (rola) => {
    pobierzRoleZalogowanej.mockResolvedValue(rola);
    render(<KartaOsoby id={17} />);
    await screen.findByText("Dostęp do materiałów do");
    await waitFor(() => expect(pobierzRoleZalogowanej).toHaveBeenCalled());

    expect(screen.queryByRole("heading", { name: "Prowadzący superwizje" })).toBeNull();
    expect(fetchAdminUsers).not.toHaveBeenCalled();
  });

  it("przycisk jest zablokowany do wyboru osoby", async () => {
    render(<KartaOsoby id={17} />);
    expect(await screen.findByRole("button", { name: "Nadaj prowadzącego" })).toBeDisabled();
  });

  it("zapis woła trasę z identyfikatorem osoby i wskazanego prowadzącego, potem pokazuje potwierdzenie i zdanie o nowym prowadzącym", async () => {
    assignSupervisor.mockResolvedValue({ volunteer_id: 17, supervisor_id: 5, assigned_at: "2026-10-02T12:00:00Z", unassigned_at: null });
    await wybierzProwadzacego();

    await userEvent.click(screen.getByRole("button", { name: "Nadaj prowadzącego" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Nadano prowadzącego: Joanna Prowadząca.");
    expect(assignSupervisor).toHaveBeenCalledTimes(1);
    expect(assignSupervisor).toHaveBeenCalledWith(17, 5);
    expect(screen.getByText(/Prowadzącym jest teraz Joanna Prowadząca/)).toBeInTheDocument();
  });

  it("odmowa serwera: zdanie z koperty błędu, bez potwierdzenia, przycisk znowu dostępny", async () => {
    assignSupervisor.mockRejectedValue(
      new ApiError({ status: 422, code: "validation_failed", message: "Ta osoba nie jest wolontariuszem." }),
    );
    await wybierzProwadzacego();
    await userEvent.click(screen.getByRole("button", { name: "Nadaj prowadzącego" }));

    expect(await screen.findByText("Ta osoba nie jest wolontariuszem.")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: "Nadaj prowadzącego" })).toBeEnabled();
  });

  it("błąd bez koperty: zdanie zapasowe, nie kod", async () => {
    assignSupervisor.mockRejectedValue(new Error("rozłączono"));
    await wybierzProwadzacego();
    await userEvent.click(screen.getByRole("button", { name: "Nadaj prowadzącego" }));

    expect(await screen.findByText("Nie udało się nadać prowadzącego. Spróbuj ponownie.")).toBeInTheDocument();
  });

  it("lista prowadzących niedostępna: zdanie, a sekcja dalej istnieje", async () => {
    fetchAdminUsers.mockRejectedValue(new Error("sieć"));
    render(<KartaOsoby id={17} />);

    expect(await screen.findByText("Nie udało się wczytać listy prowadzących.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Prowadzący superwizje" })).toBeInTheDocument();
  });
});
