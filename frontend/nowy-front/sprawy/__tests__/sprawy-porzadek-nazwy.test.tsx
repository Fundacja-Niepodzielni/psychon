import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

/**
 * Ekran A-02 „Sprawy”: kolejność wierszy od najstarszej sprawy (ta sama
 * funkcja porównania co „Otwórz najstarszą sprawę”), nazwy rodzajów z makiety
 * w wierszu, w filtrze, w nazwie akcji dla czytnika i w opisie ekranu.
 * Zegar jest ustawiony na stałą chwilę (tylko `Date`); odczyty źródeł to
 * atrapa funkcji dziedzinowej `pobierzKolejkeSpraw` (reszta modułu `../dane`
 * zostaje prawdziwa, z porównaniem i słownikiem nazw), sekcja spraw
 * prowadzących dostaje pustą listę.
 */

const pobierzKolejkeSpraw = vi.fn();
const pobierzSprawyProwadzacych = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push, replace: vi.fn() }),
}));

vi.mock("../dane", async () => {
  const rzeczywiste = await vi.importActual<typeof import("../dane")>("../dane");
  return { ...rzeczywiste, pobierzKolejkeSpraw: (...args: unknown[]) => pobierzKolejkeSpraw(...args) };
});

vi.mock("../dane-prowadzacych", async () => {
  const rzeczywiste = await vi.importActual<typeof import("../dane-prowadzacych")>("../dane-prowadzacych");
  return { ...rzeczywiste, pobierzSprawyProwadzacych: (...args: unknown[]) => pobierzSprawyProwadzacych(...args) };
});

const { Sprawy } = await import("../Sprawy");

const TERAZ = new Date("2026-10-01T12:00:00Z");
const DOBA = 24 * 60 * 60 * 1000;

function dniTemu(dni: number): string {
  return new Date(TERAZ.getTime() - dni * DOBA).toISOString();
}

type Rodzaj = "applications" | "internship_entries" | "profiles";

const NAZWA_WIERSZA: Record<Rodzaj, string> = {
  applications: "Zgłoszenie rekrutacyjne",
  internship_entries: "Dyżur",
  profiles: "Wniosek o profil psychologa",
};

function pozycja(rodzaj: Rodzaj, id: number, imie: string, nazwisko: string, czekaOd: string) {
  return {
    id: `${rodzaj}-${id}`,
    idLiczbowe: id,
    rodzaj,
    tytul: `${NAZWA_WIERSZA[rodzaj]} — ${imie} ${nazwisko}`,
    osoba: `${imie} ${nazwisko}`,
    nazwisko,
    podpowiedz: "Czeka od 26 września 2026",
    czekaOd,
    href: `/sprawa/${rodzaj}/${id}`,
  };
}

function zrodlo(rodzaj: Rodzaj, pozycje: ReturnType<typeof pozycja>[]) {
  return { rodzaj, pozycje, blad: null, kodBledu: null, liczbaCalkowita: pozycje.length };
}

/** Nazwy akcji wierszy w kolejności, w jakiej stoją na liście. */
function kolejnoscWierszy(): string[] {
  return screen.getAllByRole("link", { name: /^Otwórz sprawę: / }).map((odnosnik) => odnosnik.getAttribute("aria-label") ?? odnosnik.textContent ?? "");
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(TERAZ);
  pobierzKolejkeSpraw.mockReset();
  pobierzSprawyProwadzacych.mockReset();
  pobierzSprawyProwadzacych.mockResolvedValue({ sprawy: [], blad: null, odmowa: false });
  push.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Sprawy — lista od najstarszej sprawy", () => {
  it("wiersze stoją od najstarszej, nie w stałej kolejności rodzajów", async () => {
    pobierzKolejkeSpraw.mockResolvedValue([
      zrodlo("applications", [pozycja("applications", 1, "Marta", "Demo", dniTemu(2))]),
      zrodlo("internship_entries", [pozycja("internship_entries", 9, "Filip", "Kot", dniTemu(9))]),
      zrodlo("profiles", [pozycja("profiles", 3, "Joanna", "Lis", dniTemu(5))]),
    ]);
    render(<Sprawy />);
    await screen.findByText("Filip Kot");

    expect(kolejnoscWierszy()).toEqual([
      "Otwórz sprawę: Dyżur — Filip Kot",
      "Otwórz sprawę: Wniosek o profil psychologa — Joanna Lis",
      "Otwórz sprawę: Zgłoszenie rekrutacyjne — Marta Demo",
    ]);
  });

  it("remis tej samej chwili: rodzaj, potem nazwisko po polsku (Lis, Łukasik, Żak), potem identyfikator", async () => {
    const chwila = dniTemu(3);
    pobierzKolejkeSpraw.mockResolvedValue([
      zrodlo("applications", [
        pozycja("applications", 4, "Ewa", "Żak", chwila),
        pozycja("applications", 5, "Ola", "Łukasik", chwila),
        pozycja("applications", 6, "Ania", "Lis", chwila),
        pozycja("applications", 20, "Basia", "Lis", chwila),
        pozycja("applications", 7, "Celina", "Lis", chwila),
      ]),
      zrodlo("internship_entries", [pozycja("internship_entries", 1, "Filip", "Abacki", chwila)]),
      zrodlo("profiles", []),
    ]);
    render(<Sprawy />);
    await screen.findByText("Filip Abacki");

    expect(kolejnoscWierszy()).toEqual([
      "Otwórz sprawę: Zgłoszenie rekrutacyjne — Ania Lis",
      "Otwórz sprawę: Zgłoszenie rekrutacyjne — Celina Lis",
      "Otwórz sprawę: Zgłoszenie rekrutacyjne — Basia Lis",
      "Otwórz sprawę: Zgłoszenie rekrutacyjne — Ola Łukasik",
      "Otwórz sprawę: Zgłoszenie rekrutacyjne — Ewa Żak",
      "Otwórz sprawę: Dyżur — Filip Abacki",
    ]);
  });

  it("sprawa bez daty stoi na końcu listy", async () => {
    pobierzKolejkeSpraw.mockResolvedValue([
      zrodlo("applications", [pozycja("applications", 1, "Marta", "Demo", "")]),
      zrodlo("internship_entries", [pozycja("internship_entries", 9, "Filip", "Kot", dniTemu(1))]),
      zrodlo("profiles", []),
    ]);
    render(<Sprawy />);
    await screen.findByText("Filip Kot");

    expect(kolejnoscWierszy()).toEqual([
      "Otwórz sprawę: Dyżur — Filip Kot",
      "Otwórz sprawę: Zgłoszenie rekrutacyjne — Marta Demo",
    ]);
  });

  it("pierwszy wiersz pełnej listy jest celem „Otwórz najstarszą sprawę” (także przy remisie)", async () => {
    const chwila = dniTemu(4);
    pobierzKolejkeSpraw.mockResolvedValue([
      zrodlo("applications", [pozycja("applications", 8, "Ewa", "Żak", chwila), pozycja("applications", 9, "Ola", "Łukasik", chwila)]),
      zrodlo("internship_entries", []),
      zrodlo("profiles", [pozycja("profiles", 2, "Joanna", "Lis", chwila)]),
    ]);
    render(<Sprawy />);
    await screen.findByText("Ola Łukasik");

    const pierwszy = screen.getAllByRole("link", { name: /^Otwórz sprawę: / })[0];
    expect(pierwszy).toHaveAttribute("href", "/sprawa/applications/9");
    fireEvent.click(screen.getByRole("button", { name: "Otwórz najstarszą sprawę" }));
    expect(push).toHaveBeenCalledWith(pierwszy.getAttribute("href"));
  });

  it("po filtrze rodzaju lista nadal idzie od najstarszej", async () => {
    pobierzKolejkeSpraw.mockResolvedValue([
      zrodlo("applications", []),
      zrodlo("internship_entries", []),
      zrodlo("profiles", [
        pozycja("profiles", 1, "Ewa", "Nowak", dniTemu(1)),
        pozycja("profiles", 2, "Ola", "Kot", dniTemu(8)),
        pozycja("profiles", 3, "Ania", "Lis", dniTemu(3)),
      ]),
    ]);
    render(<Sprawy />);
    await screen.findByText("Ola Kot");

    fireEvent.click(screen.getByRole("button", { name: /^Filtr:/ }));
    fireEvent.click(screen.getByRole("button", { name: "Wnioski o profil psychologa (3)" }));

    expect(kolejnoscWierszy()).toEqual([
      "Otwórz sprawę: Wniosek o profil psychologa — Ola Kot",
      "Otwórz sprawę: Wniosek o profil psychologa — Ania Lis",
      "Otwórz sprawę: Wniosek o profil psychologa — Ewa Nowak",
    ]);
  });
});

describe("Sprawy — nazwy rodzajów z makiety", () => {
  const dane = () => [
    zrodlo("applications", [pozycja("applications", 1, "Marta", "Demo", dniTemu(3))]),
    zrodlo("internship_entries", [pozycja("internship_entries", 9, "Filip", "Kot", dniTemu(2))]),
    zrodlo("profiles", [pozycja("profiles", 3, "Joanna", "Lis", dniTemu(1))]),
  ];

  it.each<{ rodzaj: Rodzaj; wiersz: string; osoba: string }>([
    { rodzaj: "applications", wiersz: "Zgłoszenie rekrutacyjne", osoba: "Marta Demo" },
    { rodzaj: "internship_entries", wiersz: "Dyżur", osoba: "Filip Kot" },
    { rodzaj: "profiles", wiersz: "Wniosek o profil psychologa", osoba: "Joanna Lis" },
  ])("$rodzaj: wiersz „$wiersz”, nazwa akcji „Otwórz sprawę: $wiersz — $osoba”", async ({ rodzaj, wiersz, osoba }) => {
    pobierzKolejkeSpraw.mockResolvedValue(dane());
    render(<Sprawy />);

    const nazwaWiersza = await screen.findByText(wiersz, { selector: "p" });
    expect(nazwaWiersza.parentElement?.className).toMatch(/pogrubiony/);
    const odnosnik = screen.getByRole("link", { name: `Otwórz sprawę: ${wiersz} — ${osoba}` });
    expect(odnosnik).toHaveAttribute("href", `/sprawa/${rodzaj}/${rodzaj === "applications" ? 1 : rodzaj === "profiles" ? 3 : 9}`);
    // Stare skrócone nazwy nie zostają w wierszach.
    expect(screen.queryByText("Profil psychologa")).toBeNull();
    expect(screen.queryByText("Zgłoszenie", { selector: "p" })).toBeNull();
  });

  it("filtr: te same nazwy w liczbie mnogiej, każda z liczbą", async () => {
    pobierzKolejkeSpraw.mockResolvedValue(dane());
    render(<Sprawy />);
    await screen.findByText("Marta Demo");

    fireEvent.click(screen.getByRole("button", { name: /^Filtr:/ }));
    const grupa = screen.getByRole("group", { name: "Rodzaj sprawy" });
    expect(Array.from(grupa.children).map((opcja) => opcja.textContent)).toEqual([
      "Wszystkie (3)",
      "Zgłoszenia rekrutacyjne (1)",
      "Dyżury (1)",
      "Wnioski o profil psychologa (1)",
    ]);
    expect(within(grupa).queryByText(/Rekrutacja|Profile psychologów/)).toBeNull();
  });

  it("opis ekranu nazywa rodzaje tak samo jak filtr", async () => {
    pobierzKolejkeSpraw.mockResolvedValue(dane());
    const { container } = render(<Sprawy />);
    await screen.findByText("Marta Demo");

    expect(container.textContent).toContain(
      "Zgłoszenia rekrutacyjne, dyżury i wnioski o profil psychologa czekające na Twoją decyzję — w jednym miejscu.",
    );
  });

  it("komunikat źródła, które zawiodło, używa nazwy wiersza", async () => {
    pobierzKolejkeSpraw.mockResolvedValue([
      { ...zrodlo("applications", []), blad: "Zaplecze nieosiągalne." },
      zrodlo("internship_entries", [pozycja("internship_entries", 9, "Filip", "Kot", dniTemu(2))]),
      zrodlo("profiles", []),
    ]);
    render(<Sprawy />);

    expect(await screen.findByText(/Źródło „Zgłoszenie rekrutacyjne” nieosiągalne/)).toBeInTheDocument();
  });
});
