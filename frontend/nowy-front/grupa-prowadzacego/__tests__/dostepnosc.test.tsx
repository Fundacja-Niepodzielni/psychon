import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { ApiError } from "@/lib/api/klient";
import { GRUPA, GRUPA_PUSTA, RZETELNOSC } from "./atrapy";

/**
 * Dostępność ekranu w każdym stanie: axe (bez kontrastu — jsdom go nie liczy), dokładnie jeden `h1`,
 * jeden punkt orientacyjny treści i kolejność nagłówków bez przeskoków.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const api = vi.fn();
vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
}));

const pobierzGrupe = vi.fn();
const pobierzRzetelnosc = vi.fn();
const utworzTermin = vi.fn();
vi.mock("../dane", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../dane")>()),
  pobierzGrupe: (...args: unknown[]) => pobierzGrupe(...args),
  pobierzRzetelnosc: (...args: unknown[]) => pobierzRzetelnosc(...args),
  utworzTermin: (...args: unknown[]) => utworzTermin(...args),
}));

const { GrupaProwadzacego } = await import("../GrupaProwadzacego");

beforeEach(() => {
  api.mockReset();
  api.mockResolvedValue({ first_name: "Anna", role: "instructor" });
  for (const mock of [pobierzGrupe, pobierzRzetelnosc, utworzTermin]) mock.mockReset();
  pobierzRzetelnosc.mockResolvedValue(RZETELNOSC);
});

afterEach(() => {
  cleanup();
});

async function pokaz() {
  let wynik: ReturnType<typeof render> | undefined;
  await act(async () => {
    wynik = render(<GrupaProwadzacego />);
  });
  return wynik!;
}

async function sprawdz(container: HTMLElement) {
  const wynik = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(wynik.violations.map((n) => `${n.id}: ${n.nodes.map((w) => w.target.join(" ")).join(" | ")}`)).toEqual([]);
  expect(container.querySelectorAll("h1")).toHaveLength(1);
  expect(container.querySelectorAll("main")).toHaveLength(1);
  const stopnie = [...container.querySelectorAll("h1, h2, h3, h4")].map((n) => Number(n.tagName.slice(1)));
  stopnie.reduce((poprzedni, biezacy) => {
    expect(biezacy - poprzedni).toBeLessThanOrEqual(1);
    return biezacy;
  }, 0);
}

const blad = (status: number) => new ApiError({ status, code: "x", message: "x" });

const STANY: Array<[string, () => unknown]> = [
  ["ładowanie", () => pobierzGrupe.mockReturnValue(new Promise(() => {}))],
  ["błąd", () => pobierzGrupe.mockRejectedValue(blad(500))],
  ["brak połączenia", () => pobierzGrupe.mockRejectedValue(new TypeError("Failed to fetch"))],
  ["brak dostępu", () => pobierzGrupe.mockRejectedValue(blad(403))],
  ["nie znaleziono", () => pobierzGrupe.mockRejectedValue(blad(404))],
  ["brak grupy", () => pobierzGrupe.mockResolvedValue(GRUPA_PUSTA)],
  ["grupa z osobami", () => pobierzGrupe.mockResolvedValue(GRUPA)],
  [
    "błąd rzetelności",
    () => {
      pobierzGrupe.mockResolvedValue(GRUPA);
      pobierzRzetelnosc.mockRejectedValue(blad(500));
    },
  ],
  [
    "rzetelność w ładowaniu",
    () => {
      pobierzGrupe.mockResolvedValue(GRUPA);
      pobierzRzetelnosc.mockReturnValue(new Promise(() => {}));
    },
  ],
];

describe("Moja grupa — dostępność", () => {
  it.each(STANY)("%s", async (_nazwa, przygotuj) => {
    przygotuj();
    const { container } = await pokaz();
    await sprawdz(container);
  });

  it("panel nowego terminu", async () => {
    pobierzGrupe.mockResolvedValue(GRUPA);
    const { container } = await pokaz();
    fireEvent.click(await screen.findByRole("button", { name: "Utwórz termin" }));
    await screen.findByRole("heading", { level: 2, name: "Nowy termin superwizji" });
    await sprawdz(container);
  });

  it("panel sprawy", async () => {
    pobierzGrupe.mockResolvedValue(GRUPA);
    const { container } = await pokaz();
    fireEvent.click(await screen.findByRole("button", { name: "Zgłoś sprawę" }));
    await screen.findByRole("heading", { level: 2, name: "Zgłoszenie sprawy do administracji" });
    await sprawdz(container);
  });

  it("panel terminu z błędami serwera przy polach", async () => {
    pobierzGrupe.mockResolvedValue(GRUPA);
    utworzTermin.mockRejectedValue(
      new ApiError({ status: 422, code: "validation_failed", message: "x", errors: { seats_limit: ["Limit miejsc jest zbyt duży."] } }),
    );
    const { container } = await pokaz();
    fireEvent.click(await screen.findByRole("button", { name: "Utwórz termin" }));
    await screen.findByRole("heading", { level: 2, name: "Nowy termin superwizji" });
    fireEvent.change(screen.getByLabelText(/Data i godzina/), { target: { value: "2026-10-20T18:00" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Utwórz termin" }));
    });
    expect(screen.getByText("Limit miejsc jest zbyt duży.")).toBeInTheDocument();
    await sprawdz(container);
  });
});
