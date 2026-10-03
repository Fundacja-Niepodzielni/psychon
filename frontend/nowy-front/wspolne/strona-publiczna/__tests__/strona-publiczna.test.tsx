import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

/**
 * Wspólne klocki ekranów publicznych: odnośniki stopki (te same co w starej
 * stopce), rama z szablonem, komunikat z nagłówkiem drugiego stopnia, stan
 * wczytywania i przebieg wylogowania z Kont Niepodzielni.
 */

const endSession = vi.fn();
vi.mock("@/lib/api", () => ({ endSession: (...a: unknown[]) => endSession(...a) }));

const { odnosnikiStopkiPublicznej } = await import("../odnosniki");
const { RamaPubliczna } = await import("../RamaPubliczna");
const { Komunikat } = await import("../Komunikat");
const { Wczytywanie } = await import("../Wczytywanie");
const { wylogujZKont, ADRES_KONCA_SESJI } = await import("../wylogowanie");

const fetchMock = vi.fn();
const oryginalnyFetch = globalThis.fetch;

beforeEach(() => {
  endSession.mockReset();
  endSession.mockResolvedValue(undefined);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  globalThis.fetch = oryginalnyFetch;
});

describe("odnośniki stopki", () => {
  it("deklaracja i trzy dokumenty prawne, w kolejności starej stopki", () => {
    expect(odnosnikiStopkiPublicznej()).toEqual([
      { etykieta: "Deklaracja dostępności", href: "/deklaracja-dostepnosci" },
      { etykieta: "Regulamin", href: "/dokumenty-prawne/regulamin" },
      { etykieta: "Polityka prywatności", href: "/dokumenty-prawne/polityka" },
      { etykieta: "Klauzula RODO (informacja o przetwarzaniu)", href: "/dokumenty-prawne/klauzula-rodo" },
    ]);
  });

  it("ekran deklaracji nie linkuje do siebie", () => {
    const linki = odnosnikiStopkiPublicznej(true).map((o) => o.href);
    expect(linki).not.toContain("/deklaracja-dostepnosci");
    expect(linki).toHaveLength(3);
  });

  it("rama renderuje logo, treść i stopkę", () => {
    render(
      <RamaPubliczna logo={<span role="img" aria-label="Fundacja Niepodzielni" />}>
        <p>Treść</p>
      </RamaPubliczna>,
    );
    expect(screen.getByRole("img", { name: "Fundacja Niepodzielni" })).toBeTruthy();
    expect(within(screen.getByRole("navigation")).getAllByRole("link")).toHaveLength(4);
  });
});

describe("komunikat", () => {
  it("błąd: role=alert, tytuł jest h2", () => {
    render(
      <Komunikat wariant="error" tytul="Nie udało się">
        <p>Zdanie.</p>
      </Komunikat>,
    );
    const alert = screen.getByRole("alert");
    expect(within(alert).getByRole("heading", { level: 2, name: "Nie udało się" })).toBeTruthy();
  });

  it("informacja: role=status, bez tytułu nie ma nagłówka", () => {
    render(
      <Komunikat wariant="info">
        <p>Zdanie.</p>
      </Komunikat>,
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(within(screen.getByRole("status")).queryByRole("heading")).toBeNull();
  });
});

describe("wczytywanie", () => {
  it("obszar status z nazwą i widocznym zdaniem", () => {
    render(<Wczytywanie etykieta="Wczytywanie…" />);
    const status = screen.getByRole("status", { name: "Wczytywanie…" });
    expect(status.textContent).toContain("Wczytywanie…");
  });
});

describe("wylogowanie z Kont", () => {
  it("kolejność: odczyt adresu, koniec sesji, wyjście pod adres Kont", async () => {
    const kolejnosc: string[] = [];
    fetchMock.mockImplementation(async (adres: string) => {
      kolejnosc.push(`fetch ${adres}`);
      return { json: async () => ({ url: "https://konta.example.test/wyloguj" }) };
    });
    endSession.mockImplementation(async () => {
      kolejnosc.push("endSession");
    });
    const wyjdz = vi.fn((url: string) => kolejnosc.push(`wyjdz ${url}`));
    const wroc = vi.fn();
    await expect(wylogujZKont({ wyjdz, wroc })).resolves.toBe(true);
    expect(kolejnosc).toEqual([
      `fetch ${ADRES_KONCA_SESJI}`,
      "endSession",
      "wyjdz https://konta.example.test/wyloguj",
    ]);
    expect(ADRES_KONCA_SESJI).toBe("/api/auth/end-session-url");
    expect(wroc).not.toHaveBeenCalled();
  });

  it("adres nieodczytany: sesja i tak się kończy, ekran wraca", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const wyjdz = vi.fn();
    const wroc = vi.fn();
    await expect(wylogujZKont({ wyjdz, wroc })).resolves.toBe(false);
    expect(endSession).toHaveBeenCalledTimes(1);
    expect(wroc).toHaveBeenCalledTimes(1);
    expect(wyjdz).not.toHaveBeenCalled();
  });
});
