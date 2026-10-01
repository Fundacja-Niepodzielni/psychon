import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Świadek reguły axe `heading-order` na ekranie A-02: sekwencja stopni
 * nagłówków w drzewie DOM zaczyna się od `h1` i nigdy nie przeskakuje o więcej
 * niż jeden stopień w dół (h1 → h2 → h3). Mierzona w stanach: dane, pusto,
 * błąd sekcji spraw prowadzących, błąd całej kolejki i błąd jednego źródła
 * kolejki (komunikat `Notice` ma nagłówek `h3`, więc musi stać pod `h2`).
 */

const apiPaged = vi.fn();

class ApiErrorAtrapa extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

vi.mock("@/lib/api/klient", () => ({
  apiPaged: (...args: unknown[]) => apiPaged(...args),
  ApiError: ApiErrorAtrapa,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

const { Sprawy } = await import("../Sprawy");

const TRASA_SPRAW = "/admin/supervision/cases";
const STRONA_PUSTA = { data: [], meta: { current_page: 1, per_page: 100, total: 0, last_page: 1 } };
const ZGLOSZENIE = {
  data: [{ id: 1, first_name: "Marta", last_name: "Demo", created_at: "2026-01-01T00:00:00Z" }],
  meta: { current_page: 1, per_page: 100, total: 1, last_page: 1 },
};
const SPRAWY = {
  data: [
    {
      id: 7,
      subject: "Nieobecność na dyżurze",
      body: "Treść.",
      created_at: "2026-09-01T10:00:00Z",
      reporter: { id: 5, first_name: "Joanna", last_name: "Prowadząca" },
      volunteer: null,
    },
  ],
};

/** Stopnie wszystkich nagłówków w kolejności dokumentu. */
export function stopnieNaglowkow(korzen: HTMLElement): number[] {
  return Array.from(korzen.querySelectorAll("h1, h2, h3, h4, h5, h6")).map((naglowek) =>
    Number(naglowek.tagName.slice(1)),
  );
}

/** Pierwszy przeskok (w dół o więcej niż jeden stopień) albo `null`. */
export function przeskokNaglowkow(stopnie: number[]): string | null {
  let poprzedni = 0;
  for (const stopien of stopnie) {
    if (stopien > poprzedni + 1) return `h${poprzedni} → h${stopien}`;
    poprzedni = stopien;
  }
  return null;
}

function atrapa(
  sprawy: () => Promise<unknown>,
  zrodlo: (sciezka: string) => Promise<unknown> = () => Promise.resolve(STRONA_PUSTA),
) {
  apiPaged.mockImplementation((sciezka: string) =>
    String(sciezka).startsWith(TRASA_SPRAW) ? sprawy() : zrodlo(String(sciezka)),
  );
}

beforeEach(() => {
  apiPaged.mockReset();
});

describe("kontrola dodatnia miernika sekwencji nagłówków", () => {
  it("h1 → h2 → h4 jest przeskokiem, a h1 → h2 → h3 → h2 → h3 nie", () => {
    expect(przeskokNaglowkow([1, 2, 4])).toBe("h2 → h4");
    expect(przeskokNaglowkow([1, 3])).toBe("h1 → h3");
    expect(przeskokNaglowkow([1, 2, 3, 2, 3])).toBeNull();
  });
});

describe("Sprawy — kolejność nagłówków bez przeskoków", () => {
  it("stan z danymi: h1, h2 kolejki, wiersze, h2 sekcji, h3 spraw", async () => {
    atrapa(
      () => Promise.resolve(SPRAWY),
      (sciezka) => (sciezka.startsWith("/admin/applications") ? Promise.resolve(ZGLOSZENIE) : Promise.resolve(STRONA_PUSTA)),
    );
    const { container } = render(<Sprawy />);

    await screen.findByText("Nieobecność na dyżurze");
    await screen.findByText("Zgłoszenie — Marta Demo");
    const stopnie = stopnieNaglowkow(container);
    expect(stopnie).toEqual([1, 2, 2, 3]);
    expect(przeskokNaglowkow(stopnie)).toBeNull();
  });

  it("stan pusty: h1, h2 kolejki, h2 pustego stanu, h2 sekcji", async () => {
    atrapa(() => Promise.resolve({ data: [] }));
    const { container } = render(<Sprawy />);

    await screen.findByText("Brak spraw do decyzji");
    await screen.findByText("Brak spraw zgłoszonych przez prowadzących.");
    const stopnie = stopnieNaglowkow(container);
    expect(przeskokNaglowkow(stopnie)).toBeNull();
    expect(stopnie[0]).toBe(1);
    expect(stopnie.filter((s) => s === 1)).toHaveLength(1);
  });

  it("błąd sekcji spraw prowadzących: komunikat (h3) stoi pod h2 sekcji", async () => {
    atrapa(() => Promise.reject(new TypeError("Failed to fetch")));
    const { container } = render(<Sprawy />);

    await screen.findByText("Nie udało się wczytać spraw zgłoszonych przez prowadzących");
    await screen.findByText("Brak spraw do decyzji");
    const stopnie = stopnieNaglowkow(container);
    expect(stopnie).toContain(3);
    expect(przeskokNaglowkow(stopnie)).toBeNull();
  });

  it("błąd całej kolejki: komunikat (h3) stoi pod h2 „Sprawy”", async () => {
    atrapa(
      () => Promise.resolve({ data: [] }),
      () => Promise.reject(new TypeError("Failed to fetch")),
    );
    const { container } = render(<Sprawy />);

    await screen.findByText("Nie udało się wczytać spraw");
    await screen.findByText("Brak spraw zgłoszonych przez prowadzących.");
    const stopnie = stopnieNaglowkow(container);
    expect(stopnie).toContain(3);
    expect(przeskokNaglowkow(stopnie)).toBeNull();
  });

  it("błąd jednego źródła kolejki: Notice źródła (h3) stoi pod h2 kolejki", async () => {
    atrapa(
      () => Promise.resolve({ data: [] }),
      (sciezka) =>
        sciezka.startsWith("/admin/internship/pending")
          ? Promise.reject(new TypeError("Failed to fetch"))
          : Promise.resolve(STRONA_PUSTA),
    );
    const { container } = render(<Sprawy />);

    await screen.findByText(/Źródło „Dyżur” nieosiągalne/);
    await screen.findByText("Brak spraw zgłoszonych przez prowadzących.");
    const stopnie = stopnieNaglowkow(container);
    expect(stopnie).toContain(3);
    expect(przeskokNaglowkow(stopnie)).toBeNull();
  });
});
