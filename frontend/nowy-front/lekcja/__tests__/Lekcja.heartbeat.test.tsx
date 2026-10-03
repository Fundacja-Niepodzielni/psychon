import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, cleanup } from "@testing-library/react";
import { KURS, LEKCJA, dalejRamka, graRamka, zdarzenieRamki, zrodloRamki } from "./pomoce";

const pobierzDaneLekcji = vi.fn();
const wyslijPostep = vi.fn();
const pobierzOdczytKursu = vi.fn();
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
    pobierzPytania: async () => [],
  };
});

vi.mock("../kurs", async (importOriginal) => {
  const original = await importOriginal<typeof import("../kurs")>();
  return { ...original, pobierzOdczytKursu: (...args: unknown[]) => pobierzOdczytKursu(...args) };
});

const { Lekcja } = await import("../Lekcja");

/** Server counters returned by a successful heartbeat tick. */
const POSTEP_PO_TYKU = {
  watched_seconds: 750,
  active_seconds: 750,
  completable: false,
  completable_at_percent: 80,
  required_active_seconds: 960,
};

/** Own `document.hidden` stub — jsdom's own getter is read-only. */
function ustawUkryta(ukryta: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => ukryta });
}

async function wyswietlLekcje() {
  pobierzDaneLekcji.mockResolvedValue({ status: "ok", dane: LEKCJA, bezNagrania: false, zrodloNagrania: zrodloRamki() });
  const wynik = render(<Lekcja id="21" />);
  await act(async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  });
  return wynik;
}

/** Po zgłoszeniu ramki zapis postępu (obietnica) ma się rozstrzygnąć, zanim ekran coś pokaże. */
async function rozstrzygnij() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  pobierzDaneLekcji.mockReset();
  pobierzOdczytKursu.mockReset();
  pobierzOdczytKursu.mockResolvedValue(KURS);
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
    graRamka(30);
    await rozstrzygnij();
    expect(wyslijPostep).toHaveBeenCalledTimes(1);
    expect(wyslijPostep).toHaveBeenCalledWith("21", { watched_delta: 30, active_delta: 30, position_seconds: 30 });
    const [, przyrosty] = wyslijPostep.mock.calls[0] as [string, { watched_delta: number; active_delta: number; position_seconds: number }];
    expect(przyrosty.watched_delta).toBeGreaterThanOrEqual(0);
    expect(przyrosty.active_delta).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(przyrosty.watched_delta)).toBe(true);
    expect(Number.isInteger(przyrosty.active_delta)).toBe(true);

    dalejRamka(30, 30);
    await rozstrzygnij();
    expect(wyslijPostep).toHaveBeenCalledTimes(2);
  });
});

describe("Lekcja — heartbeat, brak wysyłki na pauzie", () => {
  it("zatrzymanie przed tykiem → zero wysyłek", async () => {
    await wyswietlLekcje();
    graRamka(15);
    zdarzenieRamki("pause");
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });
    expect(wyslijPostep).not.toHaveBeenCalled();
  });
});

describe("Lekcja — heartbeat, brak wysyłki przy ukrytej karcie", () => {
  it("karta ukryta w chwili tyku → zero wysyłek; po powrocie widoczności wysyłka wraca", async () => {
    await wyswietlLekcje();
    ustawUkryta(true);
    graRamka(30);
    await rozstrzygnij();
    expect(wyslijPostep).not.toHaveBeenCalled();

    ustawUkryta(false);
    dalejRamka(30, 30);
    await rozstrzygnij();
    expect(wyslijPostep).toHaveBeenCalledTimes(1);
  });
});

describe("Lekcja — heartbeat, brak wysyłki po odmontowaniu", () => {
  it("po odmontowaniu komunikaty ramki nie dają żadnej wysyłki", async () => {
    const { unmount } = await wyswietlLekcje();
    graRamka(10);
    unmount();
    zdarzenieRamki("timeupdate", { seconds: 400 });
    await act(async () => {
      vi.advanceTimersByTime(60000);
    });
    expect(wyslijPostep).not.toHaveBeenCalled();
  });
});

describe("Lekcja — heartbeat, przyrosty liczone z realnego czasu odtwarzania", () => {
  it("pauza nie wlicza się do przyrostów: 20 s gry + 5 s pauzy + 10 s gry → jedna wysyłka po 30 s gry", async () => {
    await wyswietlLekcje();
    graRamka(20);
    zdarzenieRamki("pause");
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(wyslijPostep).not.toHaveBeenCalled();
    zdarzenieRamki("play");
    zdarzenieRamki("timeupdate", { seconds: 20 });
    dalejRamka(10, 20);
    await rozstrzygnij();
    expect(wyslijPostep).toHaveBeenCalledTimes(1);
    expect(wyslijPostep).toHaveBeenCalledWith("21", { watched_delta: 30, active_delta: 30, position_seconds: 30 });
  });

  it("karta ukryta: sekundy gry liczą się jako obejrzane, nie jako aktywne", async () => {
    await wyswietlLekcje();
    ustawUkryta(true);
    graRamka(30);
    ustawUkryta(false);
    dalejRamka(30, 30);
    await rozstrzygnij();
    expect(wyslijPostep).toHaveBeenCalledTimes(1);
    expect(wyslijPostep).toHaveBeenCalledWith("21", { watched_delta: 60, active_delta: 30, position_seconds: 60 });
  });
});

describe("Lekcja — odpowiedź heartbeatu odświeża ekran", () => {
  it("po tyku z completable=true przycisk staje się czynny, a zdanie mówi, że można ukończyć", async () => {
    wyslijPostep.mockResolvedValue({
      watched_seconds: 1100,
      active_seconds: 1100,
      completable: true,
      completable_at_percent: 80,
      required_active_seconds: 960,
    });
    await wyswietlLekcje();
    const przycisk = screen.getByRole("button", { name: "Oznacz lekcję jako ukończoną" });
    expect(przycisk).toHaveAttribute("aria-disabled", "true");
    graRamka(30);
    await rozstrzygnij();
    expect(screen.getByRole("button", { name: "Oznacz lekcję jako ukończoną" })).not.toHaveAttribute("aria-disabled");
    expect(screen.getByText("Możesz zaznaczyć lekcję jako ukończoną.")).toBeInTheDocument();
  });

  it("odpowiedź niesie nowy wymagany czas: zdanie z brakującymi minutami liczy się od niego", async () => {
    wyslijPostep.mockResolvedValue({
      watched_seconds: 900,
      active_seconds: 900,
      completable: false,
      completable_at_percent: 80,
      required_active_seconds: 1200,
    });
    await wyswietlLekcje();
    expect(screen.getByText("Zostały 4 minuty nagrania.")).toBeInTheDocument();
    graRamka(30);
    await rozstrzygnij();
    expect(screen.getByText("Zostało 5 minut nagrania.")).toBeInTheDocument();
  });

  it("brak internetu: zdanie z ostatnim zapisem, a przyrosty nie przepadają — następna wysyłka niesie sumę", async () => {
    wyslijPostep.mockResolvedValueOnce(null);
    await wyswietlLekcje();
    graRamka(30);
    await rozstrzygnij();
    expect(screen.getByText("Brak internetu. Ostatnio zapisane: 12 z 16 minut.")).toBeInTheDocument();

    dalejRamka(30, 30);
    await rozstrzygnij();
    expect(wyslijPostep).toHaveBeenCalledTimes(2);
    expect(wyslijPostep).toHaveBeenLastCalledWith("21", { watched_delta: 60, active_delta: 60, position_seconds: 60 });
    expect(screen.queryByText(/^Brak internetu/)).not.toBeInTheDocument();
  });
});
