import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, cleanup, fireEvent } from "@testing-library/react";
import { KURS, LEKCJA as LEKCJA_PRZYKLADOWA } from "./pomoce";

const pobierzDaneLekcji = vi.fn();
const wyslijPostep = vi.fn();
const pobierzOdczytKursu = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("../dane", async (importOriginal) => {
  const original = await importOriginal<typeof import("../dane")>();
  return {
    ...original,
    pobierzDaneLekcji: (...args: unknown[]) => pobierzDaneLekcji(...args),
    wyslijPostep: (...args: unknown[]) => wyslijPostep(...args),
    pobierzPytania: async () => [],
  };
});

vi.mock("../kurs", async (importOriginal) => {
  const original = await importOriginal<typeof import("../kurs")>();
  return { ...original, pobierzOdczytKursu: (...args: unknown[]) => pobierzOdczytKursu(...args) };
});

const { Lekcja } = await import("../Lekcja");

/** Nagranie 30-minutowe: pozycje wznowienia 754 / 1800 / 2400 liczą się względem jego długości. */
const LEKCJA = { ...LEKCJA_PRZYKLADOWA, duration_seconds: 1800, watched_seconds: 812, active_seconds: 700 };

const POSTEP = {
  watched_seconds: 842,
  active_seconds: 730,
  completable: false,
  completable_at_percent: 80,
  required_active_seconds: 960,
};

async function wyswietl(nadpisz: Record<string, unknown>) {
  const dane = { ...LEKCJA, ...nadpisz };
  // „Brak pola” = klucz usunięty z odpowiedzi, nie `undefined` ustawione wprost.
  if (nadpisz.position_seconds === "BRAK") delete (dane as Record<string, unknown>).position_seconds;
  pobierzDaneLekcji.mockResolvedValue({ status: "ok", dane, bezNagrania: false, zrodloNagrania: {} });
  const wynik = render(<Lekcja id="21" />);
  await act(async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  });
  return wynik;
}

/** Pozycja startowa przekazana odtwarzaczowi: ramka nagrania nosi ją w `data-pozycja-startowa`. */
function pozycjaStartowaRamki(kontener: HTMLElement): string | null {
  const ramka = kontener.querySelector("[data-pozycja-startowa]");
  return ramka === null ? null : ramka.getAttribute("data-pozycja-startowa");
}

function kliknijOdtwarzanie() {
  fireEvent.click(screen.getByRole("button", { name: /^(Odtwórz|Zatrzymaj)$/ }));
}

beforeEach(() => {
  vi.useFakeTimers();
  pobierzDaneLekcji.mockReset();
  pobierzOdczytKursu.mockReset();
  pobierzOdczytKursu.mockResolvedValue(KURS);
  wyslijPostep.mockReset();
  wyslijPostep.mockResolvedValue(POSTEP);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Lekcja — wznowienie od miejsca przerwania", () => {
  it("odtwarzacz startuje od pozycji z odczytu: zdanie o miejscu i czas w minutach", async () => {
    await wyswietl({ position_seconds: 754 });
    expect(screen.getByText("Ostatnio zatrzymano w 12. minucie.")).toBeInTheDocument();
    expect(screen.getByText("12:34 / 30:00")).toBeInTheDocument();
  });

  it("odczyt z position_seconds = 754: odtwarzacz dostaje pozycję startową 754", async () => {
    const { container } = await wyswietl({ position_seconds: 754 });
    expect(pozycjaStartowaRamki(container)).toBe("754");
  });

  it.each([
    ["brak pola", "BRAK"],
    ["null", null],
    ["0", 0],
    ["równa długości nagrania", 1800],
    ["większa od długości nagrania", 2400],
  ])("odczyt z position_seconds: %s → start od 0", async (_nazwa, wartosc) => {
    const { container } = await wyswietl({ position_seconds: wartosc });
    expect(pozycjaStartowaRamki(container)).toBe("0");
  });

  it("zapis postępu niesie position_seconds startujące od odczytu i rosnące z odtwarzaniem; interwał 30 s bez zmiany", async () => {
    await wyswietl({ position_seconds: 754 });
    kliknijOdtwarzanie(); // Odtwórz

    await act(async () => {
      vi.advanceTimersByTime(29000);
    });
    expect(wyslijPostep).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(wyslijPostep).toHaveBeenCalledTimes(1);
    expect(wyslijPostep).toHaveBeenNthCalledWith(1, "21", { watched_delta: 30, active_delta: 30, position_seconds: 784 });

    await act(async () => {
      vi.advanceTimersByTime(30000);
    });
    expect(wyslijPostep).toHaveBeenCalledTimes(2);
    expect(wyslijPostep).toHaveBeenNthCalledWith(2, "21", { watched_delta: 30, active_delta: 30, position_seconds: 814 });
    const pozycje = wyslijPostep.mock.calls.map(([, cialo]) => (cialo as { position_seconds: number }).position_seconds);
    expect(pozycje[1]).toBeGreaterThan(pozycje[0]);
  });

  it("pozycja stoi na pauzie: przerwa nie przesuwa position_seconds", async () => {
    await wyswietl({ position_seconds: 100 });
    kliknijOdtwarzanie(); // Odtwórz
    await act(async () => {
      vi.advanceTimersByTime(20000);
    });
    kliknijOdtwarzanie(); // Zatrzymaj
    await act(async () => {
      vi.advanceTimersByTime(40000);
    });
    kliknijOdtwarzanie(); // Odtwórz
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(wyslijPostep).toHaveBeenCalledTimes(1);
    expect(wyslijPostep).toHaveBeenCalledWith("21", { watched_delta: 30, active_delta: 30, position_seconds: 130 });
  });

  it("bez pozycji w odczycie zapis startuje od 0", async () => {
    await wyswietl({ position_seconds: "BRAK" });
    kliknijOdtwarzanie(); // Odtwórz
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });
    expect(wyslijPostep).toHaveBeenCalledWith("21", { watched_delta: 30, active_delta: 30, position_seconds: 30 });
  });
});
