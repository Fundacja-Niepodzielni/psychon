import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { odbierzZapowiedzFokusu } from "../../wspolne/fokus-otwartej-sprawy";

/**
 * „Otwórz” w wierszu kolejki i „Otwórz najstarszą sprawę” prowadzą do jednej
 * sprawy i zapowiadają ekranowi docelowemu fokus na jej nagłówku. Kliknięcie
 * poza odnośnikiem sprawy niczego nie zapowiada. Nawigację przeglądarki
 * zatrzymuje test (jsdom jej nie wykonuje); adres docelowy ustawia `pushState`.
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

function wynik(rodzaj: "applications" | "internship_entries" | "profiles", pozycje: unknown[]) {
  return { rodzaj, pozycje, blad: null, kodBledu: null, liczbaCalkowita: pozycje.length };
}

const KOLEJKA = [
  wynik("applications", [
    {
      id: "applications-3",
      rodzaj: "applications",
      tytul: "Zgłoszenie rekrutacyjne — Marta Demo",
      osoba: "Marta Demo",
      podpowiedz: "Czeka od 20 września 2026",
      czekaOd: "2026-09-20T10:00:00Z",
      href: "/admin/nabor/3",
    },
  ]),
  wynik("internship_entries", [
    {
      id: "internship_entries-5",
      rodzaj: "internship_entries",
      tytul: "Dyżur — Ola Demo",
      osoba: "Ola Demo",
      podpowiedz: "Czeka od 22 września 2026",
      czekaOd: "2026-09-22T10:00:00Z",
      href: "/admin/staz?dyzur=5",
    },
  ]),
  wynik("profiles", []),
];

function zatrzymajNawigacje(zdarzenie: Event) {
  zdarzenie.preventDefault();
}

beforeEach(() => {
  pobierzKolejkeSpraw.mockReset();
  pobierzKolejkeSpraw.mockResolvedValue(KOLEJKA);
  pobierzSprawyProwadzacych.mockReset();
  pobierzSprawyProwadzacych.mockResolvedValue({ sprawy: [], blad: null, odmowa: false });
  push.mockReset();
  document.addEventListener("click", zatrzymajNawigacje);
});

afterEach(() => {
  document.removeEventListener("click", zatrzymajNawigacje);
  odbierzZapowiedzFokusu();
  window.history.pushState({}, "", "/");
});

describe("Sprawy — zapowiedź fokusu po „Otwórz”", () => {
  it("„Otwórz” zgłoszenia zapowiada fokus ekranowi /admin/nabor/3", async () => {
    render(<Sprawy />);
    const odnosnik = await screen.findByRole("link", { name: "Otwórz sprawę: Zgłoszenie rekrutacyjne — Marta Demo" });
    expect(odnosnik).toHaveAttribute("href", "/admin/nabor/3");
    fireEvent.click(odnosnik);

    window.history.pushState({}, "", "/admin/nabor/3");
    expect(odbierzZapowiedzFokusu()).toBe(true);
  });

  it("„Otwórz” dyżuru zapowiada fokus kolejce /admin/staz (parametr dyzur w adresie)", async () => {
    render(<Sprawy />);
    const odnosnik = await screen.findByRole("link", { name: "Otwórz sprawę: Dyżur — Ola Demo" });
    expect(odnosnik).toHaveAttribute("href", "/admin/staz?dyzur=5");
    fireEvent.click(odnosnik);

    window.history.pushState({}, "", "/admin/staz?dyzur=5");
    expect(odbierzZapowiedzFokusu()).toBe(true);
  });

  it("„Otwórz najstarszą sprawę” przechodzi do najstarszej sprawy i zapowiada fokus", async () => {
    render(<Sprawy />);
    fireEvent.click(await screen.findByRole("button", { name: "Otwórz najstarszą sprawę" }));
    expect(push).toHaveBeenCalledWith("/admin/nabor/3");

    window.history.pushState({}, "", "/admin/nabor/3");
    expect(odbierzZapowiedzFokusu()).toBe(true);
  });

  it("kliknięcie poza odnośnikiem sprawy niczego nie zapowiada", async () => {
    render(<Sprawy />);
    fireEvent.click(await screen.findByText("Marta Demo"));

    window.history.pushState({}, "", "/admin/nabor/3");
    expect(odbierzZapowiedzFokusu()).toBe(false);
  });
});
