import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, cleanup, fireEvent } from "@testing-library/react";

const pobierzDaneLekcji = vi.fn();
const wyslijPostep = vi.fn();
const back = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("../dane", async (importOriginal) => {
  const original = await importOriginal<typeof import("../dane")>();
  return {
    ...original,
    pobierzDaneLekcji: (...args: unknown[]) => pobierzDaneLekcji(...args),
    wyslijPostep: (...args: unknown[]) => wyslijPostep(...args),
  };
});

const { Lekcja } = await import("../Lekcja");

const LEKCJA = {
  id: 21,
  title: "Wprowadzenie do wywiadu",
  description: "Opis lekcji",
  content: null,
  topic: null,
  duration_seconds: 1800,
  position_seconds: 0,
  watched_seconds: 0,
  active_seconds: 0,
  is_completed: false,
  completable: false,
  completable_at_percent: 60,
};

/** Server counters returned by a successful heartbeat tick. */
const POSTEP_PO_TYKU = {
  watched_seconds: 30,
  active_seconds: 30,
  completable: false,
  completable_at_percent: 60,
};

/** Own `document.hidden` stub — jsdom's own getter is read-only. */
function ustawUkryta(ukryta: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => ukryta });
}

async function wyswietlLekcje() {
  pobierzDaneLekcji.mockResolvedValue({ status: "ok", dane: LEKCJA, bezNagrania: false });
  const wynik = render(<Lekcja id="21" />);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return wynik;
}

function kliknijOdtwarzanie() {
  fireEvent.click(screen.getByRole("button", { name: /^(Odtwórz|Zatrzymaj)$/ }));
}

beforeEach(() => {
  vi.useFakeTimers();
  pobierzDaneLekcji.mockReset();
  wyslijPostep.mockReset();
  wyslijPostep.mockResolvedValue(POSTEP_PO_TYKU);
  back.mockReset();
  ustawUkryta(false);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Lekcja — heartbeat, cadence i przyrosty", () => {
  it("odtwarzanie: wysyłka co 30 s, przyrosty nieujemne, nazwy pól z kontraktu", async () => {
    await wyswietlLekcje();
    kliknijOdtwarzanie(); // Odtwórz

    await act(async () => {
      vi.advanceTimersByTime(30000);
    });
    expect(wyslijPostep).toHaveBeenCalledTimes(1);
    expect(wyslijPostep).toHaveBeenCalledWith("21", { watched_delta: 30, active_delta: 30 });
    const [, przyrosty] = wyslijPostep.mock.calls[0] as [string, { watched_delta: number; active_delta: number }];
    expect(przyrosty.watched_delta).toBeGreaterThanOrEqual(0);
    expect(przyrosty.active_delta).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(przyrosty.watched_delta)).toBe(true);
    expect(Number.isInteger(przyrosty.active_delta)).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(30000);
    });
    expect(wyslijPostep).toHaveBeenCalledTimes(2);
  });
});

describe("Lekcja — heartbeat, brak wysyłki na pauzie", () => {
  it("zatrzymanie przed tykiem → zero wysyłek", async () => {
    await wyswietlLekcje();
    kliknijOdtwarzanie(); // Odtwórz
    await act(async () => {
      vi.advanceTimersByTime(15000);
    });
    kliknijOdtwarzanie(); // Zatrzymaj
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });
    expect(wyslijPostep).not.toHaveBeenCalled();
  });
});

describe("Lekcja — heartbeat, brak wysyłki przy ukrytej karcie", () => {
  it("karta ukryta w chwili tyku → zero wysyłek; po powrocie widoczności wysyłka wraca", async () => {
    await wyswietlLekcje();
    kliknijOdtwarzanie(); // Odtwórz
    ustawUkryta(true);
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });
    expect(wyslijPostep).not.toHaveBeenCalled();

    ustawUkryta(false);
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });
    expect(wyslijPostep).toHaveBeenCalledTimes(1);
  });
});

describe("Lekcja — heartbeat, brak wysyłki po odmontowaniu", () => {
  it("odmontowanie zatrzymuje interwał — brak wysyłek po tym momencie", async () => {
    const { unmount } = await wyswietlLekcje();
    kliknijOdtwarzanie(); // Odtwórz
    unmount();
    await act(async () => {
      vi.advanceTimersByTime(60000);
    });
    expect(wyslijPostep).not.toHaveBeenCalled();
  });
});

describe("Lekcja — heartbeat, przyrosty liczone z realnego czasu odtwarzania", () => {
  it("pauza nie wlicza się do przyrostów: 20 s gry + 5 s pauzy + 10 s gry → jedna wysyłka po 30 s gry", async () => {
    await wyswietlLekcje();
    kliknijOdtwarzanie(); // Odtwórz
    await act(async () => {
      vi.advanceTimersByTime(20000);
    });
    kliknijOdtwarzanie(); // Zatrzymaj
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(wyslijPostep).not.toHaveBeenCalled();
    kliknijOdtwarzanie(); // Odtwórz
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(wyslijPostep).toHaveBeenCalledTimes(1);
    expect(wyslijPostep).toHaveBeenCalledWith("21", { watched_delta: 30, active_delta: 30 });
  });

  it("karta ukryta: sekundy gry liczą się jako obejrzane, nie jako aktywne", async () => {
    await wyswietlLekcje();
    kliknijOdtwarzanie(); // Odtwórz
    ustawUkryta(true);
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });
    ustawUkryta(false);
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });
    expect(wyslijPostep).toHaveBeenCalledTimes(1);
    expect(wyslijPostep).toHaveBeenCalledWith("21", { watched_delta: 60, active_delta: 30 });
  });
});

describe("Lekcja — odpowiedź heartbeatu odświeża ekran", () => {
  it("po tyku z completable=true przycisk ukończenia staje się dostępny bez przeładowania", async () => {
    wyslijPostep.mockResolvedValue({
      watched_seconds: 1100,
      active_seconds: 1100,
      completable: true,
      completable_at_percent: 60,
    });
    await wyswietlLekcje();
    expect(screen.getByRole("button", { name: "Oznacz jako ukończoną" })).toBeDisabled();
    kliknijOdtwarzanie(); // Odtwórz
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });
    expect(screen.getByRole("button", { name: "Oznacz jako ukończoną" })).toBeEnabled();
  });

  it("nieudany zapis: widać komunikat, a przyrosty nie przepadają — następna wysyłka niesie sumę", async () => {
    wyslijPostep.mockResolvedValueOnce(null);
    await wyswietlLekcje();
    kliknijOdtwarzanie(); // Odtwórz
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Postęp nie został zapisany");

    await act(async () => {
      vi.advanceTimersByTime(30000);
    });
    expect(wyslijPostep).toHaveBeenCalledTimes(2);
    expect(wyslijPostep).toHaveBeenLastCalledWith("21", { watched_delta: 60, active_delta: 60 });
    expect(screen.queryByText("Postęp nie został zapisany")).not.toBeInTheDocument();
  });
});
