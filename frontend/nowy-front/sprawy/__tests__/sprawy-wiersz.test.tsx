import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { naruszeniaSeparatora } from "@/design-system/molekuly/ListRow/__tests__/separator-linii";

/**
 * Ekran A-02 „Sprawy” w układzie makiety: wiersz z plakietką „czeka N dni”,
 * podtytuł z wiekiem najstarszej sprawy, zwijany filtr z licznikami, nagłówek
 * listy tylko dla czytnika. Zegar jest ustawiony na stałą chwilę (tylko
 * `Date`), żeby wiek spraw był deterministyczny; odczyty źródeł to atrapa
 * funkcji dziedzinowej `pobierzKolejkeSpraw`, a sekcja spraw prowadzących
 * dostaje pustą listę (ma własne testy).
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

function pozycja(rodzaj: Rodzaj, id: number, osoba: string, czekaOd: string) {
  const etykieta = { applications: "Zgłoszenie", internship_entries: "Dyżur", profiles: "Profil psychologa" }[rodzaj];
  return {
    id: `${rodzaj}-${id}`,
    idLiczbowe: id,
    rodzaj,
    tytul: `${etykieta} — ${osoba}`,
    osoba,
    podpowiedz: "Czeka od 26 września 2026",
    czekaOd,
    href: `/sprawa/${rodzaj}/${id}`,
  };
}

function zrodlo(rodzaj: Rodzaj, pozycje: ReturnType<typeof pozycja>[]) {
  return { rodzaj, pozycje, blad: null, kodBledu: null, liczbaCalkowita: pozycje.length };
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

describe("Sprawy — wiersz kolejki jak w makiecie A-02", () => {
  it("plakietka „czeka N dni”: 4 dni szara, 5 dni ostrzegawcza; rodzaj i osoba osobno, bez pigułki rodzaju", async () => {
    pobierzKolejkeSpraw.mockResolvedValue([
      zrodlo("applications", [pozycja("applications", 1, "Marta Demo", dniTemu(4))]),
      zrodlo("internship_entries", [pozycja("internship_entries", 9, "Filip Demo", dniTemu(5))]),
      zrodlo("profiles", []),
    ]);
    render(<Sprawy />);

    const czteryDni = await screen.findByText("czeka 4 dni");
    const piecDni = screen.getByText("czeka 5 dni");
    expect(czteryDni.className).toMatch(/neutral/);
    expect(czteryDni.className).not.toMatch(/warn/);
    expect(piecDni.className).toMatch(/warn/);

    // Rodzaj to pogrubiony akapit, nie plakietka; osoba stoi obok, rodzaj nie powtarza się w tytule.
    const rodzaj = screen.getByText("Dyżur");
    expect(rodzaj.tagName).toBe("P");
    expect(rodzaj.parentElement?.className).toMatch(/pogrubiony/);
    expect(screen.getByText("Filip Demo")).toBeInTheDocument();
    expect(screen.queryByText(/Dyżur — /)).toBeNull();
    // Jedyne plakietki w wierszach to „czeka N dni”.
    const wiersz = rodzaj.closest("[data-wariant]") as HTMLElement;
    expect(wiersz.textContent).not.toMatch(/Dyżur.*Dyżur/);
  });

  it("wiersz: widoczne „Otwórz”, pełna nazwa akcji i data tylko dla czytnika, wiersz bez wcięcia", async () => {
    pobierzKolejkeSpraw.mockResolvedValue([
      zrodlo("applications", []),
      zrodlo("internship_entries", [pozycja("internship_entries", 9, "Filip Demo", dniTemu(2))]),
      zrodlo("profiles", []),
    ]);
    render(<Sprawy />);

    const odnosnik = await screen.findByRole("link", { name: "Otwórz sprawę: Dyżur — Filip Demo" });
    expect(odnosnik.textContent).toMatch(/^Otwórz\s*›$/);
    expect(odnosnik).toHaveAttribute("href", "/sprawa/internship_entries/9");
    expect(screen.getByText("Czeka od 26 września 2026").className).toMatch(/ukryte/);
    const wiersz = odnosnik.closest("[data-wariant]") as HTMLElement;
    expect(wiersz.className).toMatch(/bezWciecia/);
    // Separator „·” jest pierwszym dzieckiem elementu z osobą (nigdy na końcu linii).
    expect(naruszeniaSeparatora(screen.getByText("Dyżur").parentElement as HTMLElement)).toEqual([]);
  });

  it("sprawa bez daty źródłowej nie dostaje plakietki (wiek się nie zgaduje)", async () => {
    pobierzKolejkeSpraw.mockResolvedValue([
      zrodlo("applications", [pozycja("applications", 1, "Marta Demo", "")]),
      zrodlo("internship_entries", []),
      zrodlo("profiles", []),
    ]);
    render(<Sprawy />);

    await screen.findByText("Marta Demo");
    expect(screen.queryByText(/^czeka /)).toBeNull();
    expect(screen.queryByText(/Najstarsza sprawa czeka/)).toBeNull();
  });
});

describe("Sprawy — podtytuł z wiekiem najstarszej sprawy", () => {
  it("„… Najstarsza sprawa czeka N dni.” liczone z najstarszej pozycji pełnej kolejki", async () => {
    pobierzKolejkeSpraw.mockResolvedValue([
      zrodlo("applications", [pozycja("applications", 1, "Marta Demo", dniTemu(2))]),
      zrodlo("internship_entries", [pozycja("internship_entries", 9, "Filip Demo", dniTemu(6))]),
      zrodlo("profiles", [pozycja("profiles", 3, "Joanna Demo", dniTemu(3))]),
    ]);
    const { container } = render(<Sprawy />);

    await screen.findByText("Filip Demo");
    expect(container.textContent).toContain("w jednym miejscu. Najstarsza sprawa czeka 6 dni.");
  });

  it("jedna doba: „1 dzień”", async () => {
    pobierzKolejkeSpraw.mockResolvedValue([
      zrodlo("applications", [pozycja("applications", 1, "Marta Demo", dniTemu(1))]),
      zrodlo("internship_entries", []),
      zrodlo("profiles", []),
    ]);
    const { container } = render(<Sprawy />);

    await screen.findByText("Marta Demo");
    expect(container.textContent).toContain("Najstarsza sprawa czeka 1 dzień.");
  });

  it("filtr rodzaju nie zmienia podtytułu (najstarsza z pełnej kolejki)", async () => {
    pobierzKolejkeSpraw.mockResolvedValue([
      zrodlo("applications", [pozycja("applications", 1, "Marta Demo", dniTemu(2))]),
      zrodlo("internship_entries", [pozycja("internship_entries", 9, "Filip Demo", dniTemu(6))]),
      zrodlo("profiles", []),
    ]);
    const { container } = render(<Sprawy />);
    await screen.findByText("Filip Demo");

    fireEvent.click(screen.getByRole("button", { name: /^Filtr:/ }));
    fireEvent.click(screen.getByRole("button", { name: "Rekrutacja (1)" }));

    expect(screen.queryByText("Filip Demo")).toBeNull();
    expect(container.textContent).toContain("Najstarsza sprawa czeka 6 dni.");
  });

  it("pusta kolejka: bez zdania o najstarszej sprawie", async () => {
    pobierzKolejkeSpraw.mockResolvedValue([zrodlo("applications", []), zrodlo("internship_entries", []), zrodlo("profiles", [])]);
    const { container } = render(<Sprawy />);

    await screen.findByText("Brak spraw do decyzji");
    expect(container.textContent).not.toContain("Najstarsza sprawa");
    expect(container.textContent).toContain("w jednym miejscu.");
  });
});

describe("Sprawy — zwijany filtr z licznikami", () => {
  const dane = () => [
    zrodlo("applications", [pozycja("applications", 1, "Marta Demo", dniTemu(2))]),
    zrodlo("internship_entries", [
      pozycja("internship_entries", 9, "Filip Demo", dniTemu(6)),
      pozycja("internship_entries", 10, "Ola Demo", dniTemu(1)),
    ]),
    zrodlo("profiles", []),
  ];

  it("zwinięty: „Filtr: Wszystkie (3)” z aria-expanded=false i bez przycisków rodzajów", async () => {
    pobierzKolejkeSpraw.mockResolvedValue(dane());
    render(<Sprawy />);
    await screen.findByText("Filip Demo");

    const przelacznik = screen.getByRole("button", { name: "Filtr: Wszystkie (3)" });
    expect(przelacznik).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("group", { name: "Rodzaj sprawy" })).toBeNull();
  });

  it("klawiatura: Enter rozwija, Spacja zwija; rozwinięty niesie rodzaje obecne w danych, każdy z liczbą", async () => {
    pobierzKolejkeSpraw.mockResolvedValue(dane());
    vi.useRealTimers();
    const osoba = userEvent.setup();
    render(<Sprawy />);
    await screen.findByText("Filip Demo");

    const przelacznik = screen.getByRole("button", { name: /^Filtr:/ });
    przelacznik.focus();
    await osoba.keyboard("{Enter}");
    expect(przelacznik).toHaveAttribute("aria-expanded", "true");
    const grupa = screen.getByRole("group", { name: "Rodzaj sprawy" });
    expect(przelacznik).toHaveAttribute("aria-controls", grupa.parentElement?.id);
    expect(within(grupa).getAllByRole("button").map((przycisk) => przycisk.textContent)).toEqual([
      "Wszystkie (3)",
      "Rekrutacja (1)",
      "Dyżury (2)",
    ]);
    expect(within(grupa).getByRole("button", { name: "Wszystkie (3)" })).toHaveAttribute("aria-pressed", "true");

    await osoba.keyboard(" ");
    expect(przelacznik).toHaveAttribute("aria-expanded", "false");
  });

  it("wybór rodzaju zmienia podpis filtra i zawęża listę; „Wszystkie” przywraca pełną", async () => {
    pobierzKolejkeSpraw.mockResolvedValue(dane());
    render(<Sprawy />);
    await screen.findByText("Filip Demo");

    fireEvent.click(screen.getByRole("button", { name: /^Filtr:/ }));
    fireEvent.click(screen.getByRole("button", { name: "Dyżury (2)" }));

    expect(screen.getByRole("button", { name: "Filtr: Dyżury (2)" })).toBeInTheDocument();
    expect(screen.queryByText("Marta Demo")).toBeNull();
    expect(screen.getByText("Ola Demo")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Wszystkie (3)" }));
    await waitFor(() => expect(screen.getByText("Marta Demo")).toBeInTheDocument());
  });
});

describe("Sprawy — nagłówek listy tylko dla czytnika", () => {
  it("h2 „Sprawy” jest w drzewie nagłówków, ale w ukrytym kontenerze; h1 ekranu zostaje widoczny", async () => {
    pobierzKolejkeSpraw.mockResolvedValue([
      zrodlo("applications", [pozycja("applications", 1, "Marta Demo", dniTemu(2))]),
      zrodlo("internship_entries", []),
      zrodlo("profiles", []),
    ]);
    render(<Sprawy />);
    await screen.findByText("Marta Demo");

    const naglowekListy = screen.getByRole("heading", { level: 2, name: "Sprawy" });
    expect(naglowekListy.parentElement?.className).toMatch(/ukryte/);
    expect(screen.getByRole("heading", { level: 1, name: "Sprawy do decyzji" }).parentElement?.className ?? "").not.toMatch(
      /ukryte/,
    );
  });

  it("także gdy lista się nie renderuje (komunikaty źródeł) i przy błędzie całej kolejki", async () => {
    pobierzKolejkeSpraw.mockResolvedValue([
      zrodlo("applications", []),
      { rodzaj: "internship_entries", pozycje: [], blad: "Zaplecze nieosiągalne.", kodBledu: null, liczbaCalkowita: 0 },
      zrodlo("profiles", []),
    ]);
    const { unmount } = render(<Sprawy />);
    await screen.findByText(/Źródło „Dyżur” nieosiągalne/);
    expect(screen.getByRole("heading", { level: 2, name: "Sprawy" }).parentElement?.className).toMatch(/dlaCzytnika/);
    unmount();

    pobierzKolejkeSpraw.mockRejectedValue(new Error("sieć nieosiągalna"));
    render(<Sprawy />);
    await screen.findByText(/Sprawy są chwilowo nieosiągalne/);
    expect(screen.getByRole("heading", { level: 2, name: "Sprawy" }).parentElement?.className).toMatch(/dlaCzytnika/);
  });
});
