import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";

/**
 * Słownik form stażu: lista stoi w białej karcie z nagłówkiem h2 (bez przeskoku
 * stopnia pod h1), w kolumnach Forma, Stan, Miejsce na liście i akcja „Edytuj”.
 */

/** Komórka wiersza pod nagłówkiem kolumny o podanej nazwie. */
function komorka(wiersz: HTMLElement, kolumna: string): HTMLElement {
  const naglowki = within(screen.getByRole("table", { name: "Formy stażu" })).getAllByRole("columnheader");
  const indeks = naglowki.findIndex((naglowek) => naglowek.textContent === kolumna);
  expect(indeks, `kolumna „${kolumna}”`).toBeGreaterThanOrEqual(0);
  return within(wiersz).getAllByRole("cell")[indeks];
}

function wierszFormy(nazwa: string): HTMLElement {
  return screen.getByText(nazwa).closest<HTMLElement>('[role="row"]')!;
}

const pobierzFormyStazu = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("../dane", () => ({ pobierzFormyStazu: (...args: unknown[]) => pobierzFormyStazu(...args) }));
vi.mock("@/lib/api/h11-formy", () => ({ utworzFormeStazu: vi.fn(), zaktualizujFormeStazu: vi.fn() }));

const { FormyStazu } = await import("../FormyStazu");

const FORMY = [
  { id: 1, name: "Dyżur telefoniczny", description: "Rozmowa.", is_active: true, sort_order: 1, created_at: null, updated_at: null },
  { id: 2, name: "Inna", description: null, is_active: false, sort_order: 2, created_at: null, updated_at: null },
];

beforeEach(() => {
  pobierzFormyStazu.mockReset().mockResolvedValue(FORMY);
});

describe("FormyStazu — lista w karcie", () => {
  it("lista form jest w obszarze karty, z nagłówkiem h2 „Formy stażu” (kontrola dodatnia: nie ma h3 o tym tytule)", async () => {
    const { container } = render(<FormyStazu />);
    await waitFor(() => expect(screen.getByText("Dyżur telefoniczny")).toBeInTheDocument());

    const karta = container.querySelector<HTMLElement>('[data-obszar="lista-form"]');
    expect(karta).not.toBeNull();
    expect(within(karta!).getByRole("heading", { level: 2, name: "Formy stażu" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 3, name: "Formy stażu" })).toBeNull();
    expect(within(karta!).getAllByRole("button", { name: "Edytuj" })).toHaveLength(2);
    // Karta jest kartą organizmu listy (jedno miejsce), ekran nie niesie własnej.
    expect(within(karta!).getByRole("region", { name: "Formy stażu" }).className).toMatch(/karta/);
    expect(karta!.className).toBe("");
  });

  it("kolumny w kolejności: Forma, Stan, Miejsce na liście, akcja — dane z jednego odczytu słownika", async () => {
    render(<FormyStazu />);
    await waitFor(() => expect(screen.getByText("Dyżur telefoniczny")).toBeInTheDocument());
    const tabela = screen.getByRole("table", { name: "Formy stażu" });
    expect(within(tabela).getAllByRole("columnheader").map((naglowek) => naglowek.textContent)).toEqual([
      "Forma",
      "Stan",
      "Miejsce na liście",
      "Akcja",
    ]);
    expect(pobierzFormyStazu).toHaveBeenCalledTimes(1);
    expect(pobierzFormyStazu).toHaveBeenCalledWith();
  });

  it("wiersz: pod nazwą sam opis, stan i miejsce na liście we własnych kolumnach; bez opisu zostaje „Bez opisu.”", async () => {
    render(<FormyStazu />);
    await waitFor(() => expect(screen.getByText("Dyżur telefoniczny")).toBeInTheDocument());
    const pierwszy = wierszFormy("Dyżur telefoniczny");
    const drugi = wierszFormy("Inna");
    expect(within(pierwszy).getAllByRole("cell")[0]).toBe(komorka(pierwszy, "Forma"));
    expect(komorka(pierwszy, "Forma")).toHaveTextContent(/^Dyżur telefonicznyRozmowa\.$/);
    expect(komorka(drugi, "Forma")).toHaveTextContent(/^InnaBez opisu\.$/);
    expect(komorka(pierwszy, "Stan")).toHaveTextContent(/^Stan\s*aktywna$/);
    expect(komorka(drugi, "Stan")).toHaveTextContent(/^Stan\s*nieaktywna$/);
    // W kolumnie miejsca stoi sama liczba: znaczenie niesie nazwa kolumny.
    expect(komorka(pierwszy, "Miejsce na liście")).toHaveTextContent(/^Miejsce na liście\s*1$/);
    expect(komorka(drugi, "Miejsce na liście")).toHaveTextContent(/^Miejsce na liście\s*2$/);
    // Wiersza opisowego „Miejsce na liście: N · opis” już nie ma.
    expect(screen.queryByText(/Miejsce na liście: \d+/)).toBeNull();
    expect(screen.queryByText(/ · /)).toBeNull();
  });

  it("opis pod nazwą: opis, brak opisu (null) i opis pusty albo z samych spacji — nigdy samo „ · ” na końcu", async () => {
    pobierzFormyStazu.mockResolvedValue([
      { ...FORMY[0], id: 1, sort_order: 1, description: "Rozmowa." },
      { ...FORMY[0], id: 2, name: "Druga", sort_order: 2, description: null },
      { ...FORMY[0], id: 3, name: "Trzecia", sort_order: 3, description: "" },
      { ...FORMY[0], id: 4, name: "Czwarta", sort_order: 4, description: "  " },
    ]);
    render(<FormyStazu />);
    await waitFor(() => expect(screen.getByText("Czwarta")).toBeInTheDocument());
    expect(komorka(wierszFormy("Dyżur telefoniczny"), "Forma")).toHaveTextContent(/^Dyżur telefonicznyRozmowa\.$/);
    expect(komorka(wierszFormy("Druga"), "Forma")).toHaveTextContent(/^DrugaBez opisu\.$/);
    expect(komorka(wierszFormy("Trzecia"), "Forma")).toHaveTextContent(/^TrzeciaBez opisu\.$/);
    expect(komorka(wierszFormy("Czwarta"), "Forma")).toHaveTextContent(/^CzwartaBez opisu\.$/);
    expect(screen.queryByText(/ · $/)).toBeNull();
  });

  it("pusty słownik: stan pusty też stoi w karcie z h2", async () => {
    pobierzFormyStazu.mockResolvedValue([]);
    const { container } = render(<FormyStazu />);
    await waitFor(() => expect(screen.getByText("Brak form stażu")).toBeInTheDocument());
    const karta = container.querySelector<HTMLElement>('[data-obszar="lista-form"]');
    expect(within(karta!).getByRole("heading", { level: 2, name: "Formy stażu" })).toBeInTheDocument();
    expect(within(karta!).getByRole("region", { name: "Formy stażu" }).className).toMatch(/karta/);
  });
});
