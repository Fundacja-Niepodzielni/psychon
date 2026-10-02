import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { POCHODZENIE_ODTWARZACZA } from "../../../lib/konfiguracja/odtwarzacz-nagran";
import { ADRES_RAMKI, KURS, LEKCJA, dalejRamka, graRamka, ramkaOdtwarzacza, zdarzenieRamki, zrodloRamki } from "./pomoce";

/**
 * Ekran lekcji z prawdziwym odtwarzaczem w ramce: z czego rośnie czas aktywny, co robi koniec
 * nagrania, jakie adresy ramki są odrzucane i jak ekran odświeża wygasły adres. Ramka to atrapa
 * (jsdom jej nie wczytuje), komunikaty ramki wysyła test.
 */

const pobierzDaneLekcji = vi.fn();
const wyslijPostep = vi.fn();
const ukonczLekcje = vi.fn();
const odswiezLinkNagrania = vi.fn();
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
    ukonczLekcje: (...args: unknown[]) => ukonczLekcje(...args),
    odswiezLinkNagrania: (...args: unknown[]) => odswiezLinkNagrania(...args),
    pobierzPytania: async () => [],
  };
});

vi.mock("../kurs", async (importOriginal) => {
  const original = await importOriginal<typeof import("../kurs")>();
  return { ...original, pobierzOdczytKursu: (...args: unknown[]) => pobierzOdczytKursu(...args) };
});

const { Lekcja } = await import("../Lekcja");

const TERAZ = Date.parse("2026-10-02T08:00:00Z");
const MOZNA = { ...LEKCJA, completable: true, active_seconds: 1000 };
const POSTEP = { watched_seconds: 750, active_seconds: 750, completable: false, completable_at_percent: 80, required_active_seconds: 960 };
const PRZYCISK = "Oznacz lekcję jako ukończoną";

async function otworz(zrodlo = zrodloRamki(), dane = LEKCJA) {
  pobierzDaneLekcji.mockResolvedValue({ status: "ok", dane, bezNagrania: false, zrodloNagrania: zrodlo });
  const wynik = render(<Lekcja id="21" />);
  await act(async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  });
  return wynik;
}

async function rozstrzygnij() {
  await act(async () => {
    for (let i = 0; i < 4; i += 1) await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TERAZ);
  for (const atrapa of [pobierzDaneLekcji, wyslijPostep, ukonczLekcje, odswiezLinkNagrania, pobierzOdczytKursu]) atrapa.mockReset();
  pobierzOdczytKursu.mockResolvedValue(KURS);
  wyslijPostep.mockResolvedValue(POSTEP);
  ukonczLekcje.mockResolvedValue({ status: "ok" });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Lekcja — czas aktywny rośnie wyłącznie z komunikatów ramki", () => {
  it("ramka gotowa, ale bez komunikatów o odtwarzaniu: upływ czasu nie daje żadnego zapisu postępu", async () => {
    await otworz();
    zdarzenieRamki("ready");

    await act(async () => {
      vi.advanceTimersByTime(600_000);
    });

    expect(ramkaOdtwarzacza()).not.toBeNull();
    expect(wyslijPostep).not.toHaveBeenCalled();
  });

  it("nagranie na pauzie: czas stoi mimo upływu zegara i kolejnych komunikatów o pozycji", async () => {
    await otworz();
    graRamka(10);
    zdarzenieRamki("pause");

    await act(async () => {
      vi.advanceTimersByTime(120_000);
    });
    zdarzenieRamki("timeupdate", { seconds: 500 });
    await rozstrzygnij();

    expect(wyslijPostep).not.toHaveBeenCalled();
  });
});

describe("Lekcja — koniec nagrania nie kończy lekcji", () => {
  it("zdarzenie końca z ramki: zero zapisów ukończenia, przycisk bez zmian, brak znacznika „Ukończona”", async () => {
    await otworz(zrodloRamki(), MOZNA);
    graRamka(30);
    await rozstrzygnij();
    const zapisyPrzed = wyslijPostep.mock.calls.length;

    zdarzenieRamki("ended");
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    await rozstrzygnij();

    expect(ukonczLekcje).not.toHaveBeenCalled();
    expect(wyslijPostep).toHaveBeenCalledTimes(zapisyPrzed);
    expect(screen.queryByText("Ukończona")).toBeNull();
    expect(screen.getByRole("button", { name: PRZYCISK })).toBeInTheDocument();
  });

  it("ukończenie zostaje przy przycisku: kliknięcie po końcu nagrania wysyła jeden zapis ukończenia", async () => {
    await otworz(zrodloRamki(), MOZNA);
    graRamka(5);
    zdarzenieRamki("ended");
    expect(ukonczLekcje).not.toHaveBeenCalled();

    await act(async () => {
      screen.getByRole("button", { name: PRZYCISK }).click();
    });
    await rozstrzygnij();

    expect(ukonczLekcje).toHaveBeenCalledTimes(1);
  });
});

describe("Lekcja — adres ramki spoza dozwolonego pochodzenia", () => {
  it.each([
    ["http:", ADRES_RAMKI.replace("https:", "http:")],
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:text/html,<p>x</p>"],
    ["obcy host", "https://obcy.example/embed/1/lekcja-21?token=aaa"],
    ["host z dopiskiem", `${POCHODZENIE_ODTWARZACZA}.example/embed/1/lekcja-21?token=aaa`],
  ])("%s: ramki nie ma, ekran mówi, że nagrania nie da się obejrzeć, a lekcję można czytać", async (_nazwa, adres) => {
    await otworz(zrodloRamki({ adresOsadzenia: adres }));

    expect(ramkaOdtwarzacza()).toBeNull();
    expect(screen.getByText("Tego nagrania nie da się teraz obejrzeć.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Napisz do prowadzącego" })).toBeInTheDocument();
    expect(screen.getByText(/Kryzys psychiczny nie zawsze wygląda jak kryzys\./)).toBeInTheDocument();
  });

  it("odpowiedź bez adresu osadzenia: ten sam stan, bez ramki", async () => {
    await otworz(zrodloRamki({ adresOsadzenia: undefined, osadzenieWygasaO: undefined }));

    expect(ramkaOdtwarzacza()).toBeNull();
    expect(screen.getByText("Tego nagrania nie da się teraz obejrzeć.")).toBeInTheDocument();
  });

  it("dozwolony adres: ramka jest, a stanu błędu nie ma", async () => {
    await otworz();

    expect(ramkaOdtwarzacza()).toHaveAttribute("src", ADRES_RAMKI);
    expect(screen.queryByText("Tego nagrania nie da się teraz obejrzeć.")).toBeNull();
  });
});

describe("Lekcja — wygasły adres ramki", () => {
  it("termin mija w trakcie: jedno zapytanie warstwy danych o nowy link tej lekcji, ramka zostaje, nasłuch działa raz", async () => {
    const nowy = `${POCHODZENIE_ODTWARZACZA}/embed/1/lekcja-21?token=nowy`;
    odswiezLinkNagrania.mockResolvedValue(zrodloRamki({ adresOsadzenia: nowy, osadzenieWygasaO: Math.floor(TERAZ / 1000) + 7200 }));
    await otworz(zrodloRamki({ osadzenieWygasaO: Math.floor(TERAZ / 1000) + 40 }));
    graRamka(35);

    await act(async () => {
      vi.advanceTimersByTime(6_000);
    });
    await rozstrzygnij();

    expect(odswiezLinkNagrania).toHaveBeenCalledTimes(1);
    expect(odswiezLinkNagrania).toHaveBeenCalledWith("21");
    expect(ramkaOdtwarzacza()).not.toBeNull();
    dalejRamka(1, 35);
    await act(async () => {
      vi.advanceTimersByTime(600_000);
    });
    expect(odswiezLinkNagrania).toHaveBeenCalledTimes(1);
  });

  it("odświeżenie nieudane, nagranie stoi: stan „nie działa” z zapytaniem raz, bez pętli", async () => {
    odswiezLinkNagrania.mockResolvedValue(null);
    await otworz(zrodloRamki({ osadzenieWygasaO: Math.floor(TERAZ / 1000) - 60 }));

    await act(async () => {
      vi.advanceTimersByTime(0);
    });
    await rozstrzygnij();
    await act(async () => {
      vi.advanceTimersByTime(300_000);
    });
    await rozstrzygnij();

    expect(odswiezLinkNagrania).toHaveBeenCalledTimes(1);
    expect(ramkaOdtwarzacza()).toBeNull();
    expect(screen.getByText("Tego nagrania nie da się teraz obejrzeć.")).toBeInTheDocument();
  });
});
