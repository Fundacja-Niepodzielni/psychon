import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { KURS, LEKCJA } from "./pomoce";

/** Lekcja zamknięta kolejnością: odmowa `403 lesson_locked` z dowolnego żądania ekranu. */

const pobierzDaneLekcji = vi.fn();
const pobierzOdczytKursu = vi.fn();
const wyslijPostep = vi.fn();
const ukonczLekcje = vi.fn();
const pobierzPytania = vi.fn();
const wyslijPytanie = vi.fn();
const push = vi.fn();
let kursZAdresu: string | null = null;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(kursZAdresu === null ? "" : `kurs=${kursZAdresu}`),
}));

vi.mock("../dane", async (importOriginal) => {
  const original = await importOriginal<typeof import("../dane")>();
  return {
    ...original,
    pobierzDaneLekcji: (...args: unknown[]) => pobierzDaneLekcji(...args),
    wyslijPostep: (...args: unknown[]) => wyslijPostep(...args),
    ukonczLekcje: (...args: unknown[]) => ukonczLekcje(...args),
    pobierzPytania: (...args: unknown[]) => pobierzPytania(...args),
    wyslijPytanie: (...args: unknown[]) => wyslijPytanie(...args),
  };
});

vi.mock("../kurs", async (importOriginal) => {
  const original = await importOriginal<typeof import("../kurs")>();
  return { ...original, pobierzOdczytKursu: (...args: unknown[]) => pobierzOdczytKursu(...args) };
});

const { Lekcja } = await import("../Lekcja");

const KOMUNIKAT = "Ta lekcja będzie dostępna po ukończeniu poprzedniej.";

function odmowa(wymaganaLekcjaId: number | null) {
  return { odmowaKolejnosci: true as const, komunikat: KOMUNIKAT, wymaganaLekcjaId };
}

async function przeczekaj() {
  await act(async () => {
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
  });
}

async function otworzZamknieta(wymagana: number | null) {
  pobierzDaneLekcji.mockResolvedValue({ status: "lekcja-zamknieta", ...odmowa(wymagana) });
  render(<Lekcja id="22" />);
  await przeczekaj();
}

function zielone(): string[] {
  return screen
    .queryAllByRole("button")
    .filter((przycisk) => /primary/.test(przycisk.className))
    .map((przycisk) => przycisk.textContent ?? "");
}

beforeEach(() => {
  pobierzDaneLekcji.mockReset();
  pobierzOdczytKursu.mockReset();
  pobierzOdczytKursu.mockResolvedValue(KURS);
  wyslijPostep.mockReset();
  ukonczLekcje.mockReset();
  pobierzPytania.mockReset();
  pobierzPytania.mockResolvedValue([]);
  wyslijPytanie.mockReset();
  push.mockReset();
  kursZAdresu = null;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("lekcja zamknięta kolejnością — odczyt lekcji", () => {
  it("komunikat z numerem wymaganej lekcji w kursie i jeden przycisk do tej lekcji", async () => {
    kursZAdresu = "pierwsza-pomoc-psychologiczna";
    await otworzZamknieta(21);

    expect(screen.getByRole("heading", { level: 1, name: "Najpierw ukończ lekcję 3" })).toBeInTheDocument();
    expect(screen.getByText("Lekcje w tym kursie przechodzisz po kolei.")).toBeInTheDocument();
    expect(pobierzOdczytKursu).toHaveBeenCalledWith("pierwsza-pomoc-psychologiczna");

    const przycisk = screen.getByRole("button", { name: "Przejdź do lekcji 3" });
    expect(zielone()).toEqual(["Przejdź do lekcji 3"]);
    fireEvent.click(przycisk);
    expect(push).toHaveBeenCalledWith("/panel/lekcje/21?kurs=pierwsza-pomoc-psychologiczna");
  });

  it("bez odtwarzacza, paska ukończenia i kart lekcji", async () => {
    kursZAdresu = "pierwsza-pomoc-psychologiczna";
    await otworzZamknieta(21);

    expect(screen.queryByRole("button", { name: /^Odtwórz/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Oznacz lekcję jako ukończoną" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Zapytaj prowadzącego" })).toBeNull();
    expect(pobierzPytania).not.toHaveBeenCalled();
    expect(wyslijPostep).not.toHaveBeenCalled();
  });

  it("numer ustalony z odczytu kursu: nie z identyfikatora (lekcja 31 to ósma w kursie)", async () => {
    kursZAdresu = "pierwsza-pomoc-psychologiczna";
    await otworzZamknieta(31);

    expect(screen.getByRole("heading", { level: 1, name: "Najpierw ukończ lekcję 8" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Przejdź do lekcji 8" }));
    expect(push).toHaveBeenCalledWith("/panel/lekcje/31?kurs=pierwsza-pomoc-psychologiczna");
  });

  it("numeru nie da się ustalić (adres bez kursu): zdanie serwera i przycisk do wymaganej lekcji", async () => {
    await otworzZamknieta(21);

    expect(pobierzOdczytKursu).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 1, name: "Ta lekcja jest jeszcze zamknięta" })).toBeInTheDocument();
    expect(screen.getByText(KOMUNIKAT)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Przejdź do wymaganej lekcji" }));
    expect(push).toHaveBeenCalledWith("/panel/lekcje/21");
    expect(zielone()).toHaveLength(1);
  });

  it("odczyt kursu zawodzi albo nie zawiera tej lekcji: zdanie serwera, przycisk do wymaganej lekcji", async () => {
    kursZAdresu = "pierwsza-pomoc-psychologiczna";
    pobierzOdczytKursu.mockResolvedValue(null);
    await otworzZamknieta(21);

    expect(screen.getByText(KOMUNIKAT)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Przejdź do wymaganej lekcji" })).toBeInTheDocument();
  });

  it("odmowa bez `reason` (sam kod): zdanie serwera i odnośnik do strony kursu", async () => {
    kursZAdresu = "pierwsza-pomoc-psychologiczna";
    await otworzZamknieta(null);

    expect(screen.getByText(KOMUNIKAT)).toBeInTheDocument();
    expect(zielone()).toEqual(["Wróć do kursu"]);
    fireEvent.click(screen.getByRole("button", { name: "Wróć do kursu" }));
    expect(push).toHaveBeenCalledWith("/panel/kursy/pierwsza-pomoc-psychologiczna");
  });

  it("odmowa bez `reason` i bez kursu w adresie: powrót do listy kursów", async () => {
    await otworzZamknieta(null);

    fireEvent.click(screen.getByRole("button", { name: "Wróć do kursu" }));
    expect(push).toHaveBeenCalledWith("/panel/kursy");
  });
});

describe("lekcja zamknięta kolejnością — odmowa w trakcie pracy", () => {
  async function otworzOtwarta() {
    pobierzDaneLekcji.mockResolvedValue({ status: "ok", dane: LEKCJA, bezNagrania: false, zrodloNagrania: {} });
    kursZAdresu = "pierwsza-pomoc-psychologiczna";
    render(<Lekcja id="21" />);
    await przeczekaj();
  }

  it("odmowa zapisu postępu: ten sam stan, odtwarzacz znika, ponowna wysyłka nie następuje", async () => {
    vi.useFakeTimers();
    wyslijPostep.mockResolvedValue(odmowa(20));
    await otworzOtwarta();
    fireEvent.click(screen.getByRole("button", { name: /^(Odtwórz|Zatrzymaj)$/ }));

    await act(async () => {
      vi.advanceTimersByTime(30000);
    });
    await przeczekaj();

    expect(wyslijPostep).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { level: 1, name: "Najpierw ukończ lekcję 2" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^(Odtwórz|Zatrzymaj)/ })).toBeNull();
    expect(zielone()).toEqual(["Przejdź do lekcji 2"]);

    await act(async () => {
      vi.advanceTimersByTime(120000);
    });
    expect(wyslijPostep).toHaveBeenCalledTimes(1);
  });

  it("odmowa ukończenia: ten sam stan i przycisk do wymaganej lekcji", async () => {
    pobierzDaneLekcji.mockResolvedValue({ status: "ok", dane: { ...LEKCJA, completable: true, active_seconds: 1000 }, bezNagrania: true });
    kursZAdresu = "pierwsza-pomoc-psychologiczna";
    ukonczLekcje.mockResolvedValue({ status: "zamknieta", odmowa: odmowa(20) });
    render(<Lekcja id="21" />);
    await przeczekaj();

    fireEvent.click(screen.getByRole("button", { name: "Oznacz lekcję jako ukończoną" }));
    await przeczekaj();

    expect(ukonczLekcje).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { level: 1, name: "Najpierw ukończ lekcję 2" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Przejdź do lekcji 2" }));
    expect(push).toHaveBeenCalledWith("/panel/lekcje/20?kurs=pierwsza-pomoc-psychologiczna");
  });

  it("odmowa przy odczycie pytań: ten sam stan", async () => {
    pobierzDaneLekcji.mockResolvedValue({ status: "ok", dane: LEKCJA, bezNagrania: true });
    kursZAdresu = "pierwsza-pomoc-psychologiczna";
    pobierzPytania.mockResolvedValue(odmowa(20));
    render(<Lekcja id="21" />);
    await przeczekaj();

    expect(screen.getByRole("heading", { level: 1, name: "Najpierw ukończ lekcję 2" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Zapytaj prowadzącego" })).toBeNull();
  });

  it("odmowa przy wysłaniu pytania: ten sam stan", async () => {
    pobierzDaneLekcji.mockResolvedValue({ status: "ok", dane: LEKCJA, bezNagrania: true });
    kursZAdresu = "pierwsza-pomoc-psychologiczna";
    wyslijPytanie.mockResolvedValue({ status: "zamknieta", odmowa: odmowa(20) });
    render(<Lekcja id="21" />);
    await przeczekaj();

    fireEvent.change(screen.getByRole("textbox", { name: "Twoje pytanie" }), { target: { value: "Czy mogę?" } });
    fireEvent.click(screen.getByRole("button", { name: "Wyślij pytanie" }));
    await przeczekaj();

    expect(screen.getByRole("heading", { level: 1, name: "Najpierw ukończ lekcję 2" })).toBeInTheDocument();
  });
});
