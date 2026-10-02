import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { ApiError } from "@/lib/api/klient";
import { WATEK, WIADOMOSC_1, WIADOMOSC_2, WIADOMOSC_BEZ_AUTORA, meta } from "./atrapy";

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

const pobierzWatki = vi.fn();
const pobierzWiadomosci = vi.fn();
const wyslijWiadomosc = vi.fn();
vi.mock("../dane", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../dane")>()),
  pobierzWatki: (...args: unknown[]) => pobierzWatki(...args),
  pobierzWiadomosci: (...args: unknown[]) => pobierzWiadomosci(...args),
  wyslijWiadomosc: (...args: unknown[]) => wyslijWiadomosc(...args),
}));

const { WatekGrupowy } = await import("../WatekGrupowy");

beforeEach(() => {
  api.mockReset();
  api.mockResolvedValue({ first_name: "Anna", role: "instructor" });
  for (const mock of [pobierzWatki, pobierzWiadomosci, wyslijWiadomosc]) mock.mockReset();
});

afterEach(() => {
  cleanup();
});

async function pokaz() {
  let wynik: ReturnType<typeof render> | undefined;
  await act(async () => {
    wynik = render(<WatekGrupowy />);
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

const STANY_LISTY: Array<[string, () => unknown]> = [
  ["ładowanie", () => pobierzWatki.mockReturnValue(new Promise(() => {}))],
  ["błąd", () => pobierzWatki.mockRejectedValue(blad(500))],
  ["brak połączenia", () => pobierzWatki.mockRejectedValue(new TypeError("Failed to fetch"))],
  ["brak dostępu", () => pobierzWatki.mockRejectedValue(blad(403))],
  ["nie znaleziono", () => pobierzWatki.mockRejectedValue(blad(404))],
  ["brak wątku", () => pobierzWatki.mockResolvedValue([])],
  ["lista wątków", () => pobierzWatki.mockResolvedValue([WATEK])],
];

describe("Wątek grupowy — dostępność", () => {
  it.each(STANY_LISTY)("%s", async (_nazwa, przygotuj) => {
    przygotuj();
    const { container } = await pokaz();
    await sprawdz(container);
  });

  const STANY_WATKU: Array<[string, () => unknown]> = [
    ["wczytywanie wiadomości", () => pobierzWiadomosci.mockReturnValue(new Promise(() => {}))],
    ["wątek bez wiadomości", () => pobierzWiadomosci.mockResolvedValue({ data: [], meta: meta({ total: 0 }) })],
    ["wątek z wiadomościami", () => pobierzWiadomosci.mockResolvedValue({ data: [WIADOMOSC_1, WIADOMOSC_2, WIADOMOSC_BEZ_AUTORA], meta: meta({ total: 3 }) })],
    ["wątek ze stronicowaniem", () => pobierzWiadomosci.mockResolvedValue({ data: [WIADOMOSC_1], meta: meta({ total: 60, last_page: 3 }) })],
    ["brak dostępu do wiadomości", () => pobierzWiadomosci.mockRejectedValue(blad(403))],
    ["błąd wiadomości", () => pobierzWiadomosci.mockRejectedValue(blad(500))],
  ];

  it.each(STANY_WATKU)("%s", async (_nazwa, przygotuj) => {
    pobierzWatki.mockResolvedValue([WATEK]);
    przygotuj();
    const { container } = await pokaz();
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Otwórz wątek grupowy" }));
    });
    await sprawdz(container);
  });

  it("błąd wysyłki", async () => {
    pobierzWatki.mockResolvedValue([WATEK]);
    pobierzWiadomosci.mockResolvedValue({ data: [WIADOMOSC_1], meta: meta({ total: 1 }) });
    wyslijWiadomosc.mockRejectedValue(blad(422));
    const { container } = await pokaz();
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Otwórz wątek grupowy" }));
    });
    fireEvent.change(await screen.findByLabelText(/Wiadomość do grupy/), { target: { value: "Cześć" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Wyślij wiadomość" }));
    });
    expect(screen.getByText("Nie udało się wysłać wiadomości")).toBeInTheDocument();
    await sprawdz(container);
  });
});
