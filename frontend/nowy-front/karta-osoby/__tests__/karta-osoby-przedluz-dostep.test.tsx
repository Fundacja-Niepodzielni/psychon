import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Wejście z karty osoby na ekran przedłużenia dostępu: przycisk stoi pod
 * danymi osoby (tam, gdzie data końca dostępu), prowadzi pod adres podany
 * przez stronę i nie pojawia się, gdy strona adresu nie podała.
 */

const pobierzKarteOsoby = vi.fn();
const pobierzRzetelnoscOsoby = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push, replace: vi.fn() }),
}));

vi.mock("../dane", async () => {
  const rzeczywiste = await vi.importActual<typeof import("../dane")>("../dane");
  return {
    ...rzeczywiste,
    pobierzKarteOsoby: (...args: unknown[]) => pobierzKarteOsoby(...args),
    pobierzRzetelnoscOsoby: (...args: unknown[]) => pobierzRzetelnoscOsoby(...args),
  };
});

const { KartaOsoby } = await import("../KartaOsoby");

const KARTA: unknown = {
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
    workshop_done: false,
    path_tests_passed: 0,
    path_tests_total: 4,
  },
  recent_notifications: [],
  audit_entries: [],
};

const ADRES = "/nowy-front/admin/uczestniczki/17/przedluzenie";

beforeEach(() => {
  pobierzKarteOsoby.mockReset();
  pobierzRzetelnoscOsoby.mockReset();
  push.mockReset();
  pobierzKarteOsoby.mockResolvedValue(KARTA);
  pobierzRzetelnoscOsoby.mockResolvedValue({ reliability_percent: null, below_threshold: false });
});

describe("KartaOsoby — wejście na przedłużenie dostępu", () => {
  it("przycisk „Przedłuż dostęp” stoi w obszarze danych osoby i prowadzi pod adres ekranu przedłużenia", async () => {
    render(<KartaOsoby id={17} adresPrzedluzenia={ADRES} />);

    const przycisk = await screen.findByRole("button", { name: "Przedłuż dostęp" });
    expect(screen.getByTestId("obszar-tabela")).toContainElement(przycisk);
    expect(screen.getByText("Dostęp do materiałów do")).toBeInTheDocument();

    await userEvent.click(przycisk);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(ADRES);
  });

  it("bez adresu ekranu przedłużenia karta nie pokazuje przycisku", async () => {
    render(<KartaOsoby id={17} />);

    await screen.findByText("Dostęp do materiałów do");
    expect(screen.queryByRole("button", { name: "Przedłuż dostęp" })).not.toBeInTheDocument();
  });

  it("w trakcie edycji danych przycisku nie ma — na ekranie zostaje jeden rząd przycisków formularza", async () => {
    render(<KartaOsoby id={17} adresPrzedluzenia={ADRES} />);

    await userEvent.click(await screen.findByRole("button", { name: "Zmień dane" }));
    expect(screen.queryByRole("button", { name: "Przedłuż dostęp" })).not.toBeInTheDocument();
  });
});
