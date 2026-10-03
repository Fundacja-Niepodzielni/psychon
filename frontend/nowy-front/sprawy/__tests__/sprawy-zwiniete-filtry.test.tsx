import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

/**
 * Sprawy: na telefonie (poniżej 600 px) filtr rodzaju to wiersz
 * „Rodzaj: <wybrany> (N) · Zmień” z listą rodzajów (zaznaczony ma ✓) w panelu;
 * wybór rodzaju zwija panel i oddaje fokus na wiersz. Od 600 px zostaje
 * dotychczasowy zwijany filtr „Filtr: …”. Szerokość ekranu to atrapa
 * `matchMedia`, bo jsdom nie liczy CSS.
 */

const pobierzKolejkeSpraw = vi.fn();
const pobierzSprawyProwadzacych = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
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

function pozycja(rodzaj: "applications" | "internship_entries" | "profiles", id: number, osoba: string, dni: number) {
  const etykieta = {
    applications: "Zgłoszenie rekrutacyjne",
    internship_entries: "Dyżur",
    profiles: "Wniosek o profil psychologa",
  }[rodzaj];
  return {
    id: `${rodzaj}-${id}`,
    idLiczbowe: id,
    rodzaj,
    tytul: `${etykieta} — ${osoba}`,
    osoba,
    nazwisko: osoba.split(" ").slice(1).join(" "),
    podpowiedz: "Czeka od 26 września 2026",
    czekaOd: new Date(TERAZ.getTime() - dni * DOBA).toISOString(),
    href: `/sprawa/${rodzaj}/${id}`,
  };
}

function zrodlo(rodzaj: "applications" | "internship_entries" | "profiles", pozycje: ReturnType<typeof pozycja>[]) {
  return { rodzaj, pozycje, blad: null, kodBledu: null, liczbaCalkowita: pozycje.length };
}

const dane = () => [
  zrodlo("applications", [pozycja("applications", 1, "Marta Demo", 2)]),
  zrodlo("internship_entries", [pozycja("internship_entries", 9, "Filip Demo", 6), pozycja("internship_entries", 10, "Ola Demo", 1)]),
  zrodlo("profiles", [pozycja("profiles", 4, "Joanna Lis", 3)]),
];

function ustawSzerokosc(telefon: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (zapytanie: string) => ({
      matches: telefon && zapytanie.includes("max-width: 599px"),
      media: zapytanie,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(TERAZ);
  pobierzKolejkeSpraw.mockReset();
  pobierzSprawyProwadzacych.mockReset();
  pobierzSprawyProwadzacych.mockResolvedValue({ sprawy: [], blad: null, odmowa: false });
  pobierzKolejkeSpraw.mockResolvedValue(dane());
});

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(window, "matchMedia");
});

describe("Sprawy — zwinięty filtr na telefonie", () => {
  it("wiersz „Rodzaj: Wszystkie (4) Zmień” jest zwinięty, a lista rodzajów z ✓ stoi w jego panelu", async () => {
    ustawSzerokosc(true);
    render(<Sprawy />);
    await screen.findByText("Filip Demo");

    const wiersz = screen.getByRole("button", { name: /^Rodzaj:/ });
    expect(wiersz).toHaveAccessibleName("Rodzaj: Wszystkie (4) Zmień");
    expect(wiersz).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: /^Filtr:/ })).toBeNull();

    const panel = document.getElementById(wiersz.getAttribute("aria-controls") ?? "") as HTMLElement;
    const grupa = within(panel).getByRole("group", { name: "Rodzaj sprawy" });
    expect(within(grupa).getByRole("button", { name: "Wszystkie (4)" })).toHaveAttribute("aria-pressed", "true");
    expect(within(grupa).getByRole("button", { name: "Wszystkie (4)" }).textContent).toContain("✓");
    expect(within(grupa).getByRole("button", { name: "Wnioski o profil psychologa (1)" }).textContent).not.toContain("✓");
  });

  it("wybór rodzaju zawęża listę, zwija panel i oddaje fokus na wiersz z nowym rodzajem", async () => {
    ustawSzerokosc(true);
    render(<Sprawy />);
    await screen.findByText("Filip Demo");

    fireEvent.click(screen.getByRole("button", { name: /^Rodzaj:/ }));
    expect(screen.getByRole("button", { name: /^Rodzaj:/ })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "Wnioski o profil psychologa (1)" }));

    const po = screen.getByRole("button", { name: /^Rodzaj:/ });
    expect(po).toHaveAccessibleName("Rodzaj: Wnioski o profil psychologa (1) Zmień");
    expect(po).toHaveAttribute("aria-expanded", "false");
    expect(po).toHaveFocus();
    expect(screen.queryByText("Marta Demo")).toBeNull();
    expect(screen.getByText("Joanna Lis")).toBeInTheDocument();
  });

  it("od 600 px zostaje dotychczasowy filtr „Filtr: …” bez wiersza „Rodzaj”", async () => {
    ustawSzerokosc(false);
    render(<Sprawy />);
    await screen.findByText("Filip Demo");

    expect(screen.getByRole("button", { name: "Filtr: Wszystkie (4)" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Rodzaj:/ })).toBeNull();
  });
});
