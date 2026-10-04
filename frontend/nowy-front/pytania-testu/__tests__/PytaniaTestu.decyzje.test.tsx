import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ATRYBUT_OBSZARU } from "@/design-system/organizmy/Dialog/obszarOgloszen";
import { ID_TESTU, pytania } from "./atrapy";
import type { PytanieTestu } from "../dane";

/**
 * Decyzje przejęcia ekranu „Pytania testu”:
 *  - numer pytania na ekranie liczony po kolei (1, 2, 3), numer serwera jest wewnętrzny;
 *  - wiersz pokazuje pełną treść i wszystkie odpowiedzi z oznaczoną poprawną;
 *  - jeden zielony przycisk ekranu — w nagłówku; przyciski w treści są drugorzędne,
 *    a formularz pytania stoi we wspólnym oknie formularza;
 *  - usunięcie potwierdza wspólne okno w wariancie niebezpiecznym;
 *  - strzałki kolejności po lewej stronie wiersza, jak lekcje na ekranie kursu.
 */

const pobierzPytania = vi.fn();
const dodajPytanie = vi.fn();
const zapiszPytanie = vi.fn();
const usunPytanie = vi.fn();
const zapiszKolejnosc = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/testy/10/pytania",
}));

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: () => Promise.reject(new TypeError("Brak sieci w teście")),
}));

vi.mock("../dane", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../dane")>()),
  pobierzPytania: (...args: unknown[]) => pobierzPytania(...args),
  dodajPytanie: (...args: unknown[]) => dodajPytanie(...args),
  zapiszPytanie: (...args: unknown[]) => zapiszPytanie(...args),
  usunPytanie: (...args: unknown[]) => usunPytanie(...args),
  zapiszKolejnosc: (...args: unknown[]) => zapiszKolejnosc(...args),
}));

const { ApiError } = await import("@/lib/api/klient");
const { PytaniaTestu } = await import("../PytaniaTestu");
const { konfiguracjaRoli } = await import("@/nowy-front/rola-kursu/rola");

/** Numery serwera z lukami (po usunięciach): ekran i tak liczy 1, 2, 3. */
function zLukami(): PytanieTestu[] {
  const pozycje = [3, 7, 12];
  return pytania().map((pytanie, indeks) => ({ ...pytanie, sequence_order: pozycje[indeks] }));
}

const PIERWSZE = "Co jest pierwszym krokiem w rozmowie z osobą w kryzysie?";

function klasy(element: Element): string[] {
  return element.className.split(/\s+/);
}

function maKlase(element: Element, nazwa: string): boolean {
  return klasy(element).some((klasa) => new RegExp(`(^|_)${nazwa}(_|$)`).test(klasa));
}

/** Zielone przyciski poza oknami. */
function zielone() {
  return screen
    .queryAllByRole("button")
    .filter((przycisk) => przycisk.closest('[role="dialog"]') === null)
    .filter((przycisk) => maKlase(przycisk, "primary"));
}

async function otworz(lista: PytanieTestu[] = zLukami()) {
  pobierzPytania.mockResolvedValue(lista);
  const wynik = render(<PytaniaTestu idTestu={String(ID_TESTU)} panel="administracja" />);
  await waitFor(() => expect(screen.queryByText("Wczytywanie pytań…")).toBeNull());
  return wynik;
}

function wiersze() {
  return within(screen.getByRole("region", { name: "Pytania" })).getAllByRole("listitem").filter((li) => li.hasAttribute("data-ruch-klucz"));
}

function ogloszenie(): string {
  return document.querySelector(`[${ATRYBUT_OBSZARU}]`)?.textContent ?? "";
}

beforeEach(() => {
  for (const atrapa of [pobierzPytania, dodajPytanie, zapiszPytanie, usunPytanie, zapiszKolejnosc]) atrapa.mockReset();
});

describe("numer pytania liczony po kolei", () => {
  it("serwer ma numery 3, 7, 12 — ekran pokazuje 1, 2, 3 w tytułach, numerach i nazwach przycisków", async () => {
    await otworz();
    const lista = wiersze();
    expect(lista).toHaveLength(3);
    lista.forEach((wiersz, indeks) => {
      const numer = indeks + 1;
      expect(within(wiersz).getByRole("heading", { level: 3, name: `Pytanie ${numer}` })).toBeInTheDocument();
      expect(wiersz.querySelector("[data-numer-kolejnosci]")).toHaveTextContent(String(numer));
      expect(within(wiersz).getByRole("button", { name: `Edytuj pytanie ${numer}` })).toBeInTheDocument();
      expect(within(wiersz).getByRole("button", { name: `Usuń pytanie ${numer}` })).toBeInTheDocument();
    });
    expect(screen.queryByText(/Pytanie (7|12)/)).toBeNull();
  });

  it("okna, powiadomienia i nowe pytanie też liczą po kolei", async () => {
    const uzytkownik = userEvent.setup({ delay: null });
    usunPytanie.mockResolvedValue({ id: 43, deleted: true });
    dodajPytanie.mockResolvedValue({
      id: 44,
      body: "Jak zakończyć rozmowę wspierającą?",
      sequence_order: 13,
      answers: [
        { id: 240, body: "Podsumować i ustalić dalszy krok", is_correct: true },
        { id: 241, body: "Przerwać bez słowa", is_correct: false },
      ],
    });
    await otworz();

    await uzytkownik.click(screen.getByRole("button", { name: "Usuń pytanie 3" }));
    const okno = screen.getByRole("dialog", { name: "Usunąć pytanie 3?" });
    await uzytkownik.click(within(okno).getByRole("button", { name: "Usuń pytanie" }));
    expect(await screen.findByText("Usunięto pytanie 3.")).toBeInTheDocument();

    await uzytkownik.click(zielone()[0]);
    const formularz = screen.getByRole("dialog", { name: "Nowe pytanie" });
    await uzytkownik.type(within(formularz).getByLabelText(/^Treść pytania/), "Jak zakończyć rozmowę wspierającą?");
    await uzytkownik.type(within(formularz).getByLabelText(/^Odpowiedź 1/), "Podsumować i ustalić dalszy krok");
    await uzytkownik.type(within(formularz).getByLabelText(/^Odpowiedź 2/), "Przerwać bez słowa");
    await uzytkownik.click(within(formularz).getByRole("button", { name: "Zapisz pytanie" }));

    expect(await screen.findByText("Dodano pytanie 3.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Pytanie 3" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Pytanie 13" })).toBeNull();
  });
});

describe("wiersz: pełna treść i odpowiedzi z oznaczoną poprawną", () => {
  it("długa treść nie jest ucinana; każda odpowiedź na liście, poprawna ze znacznikiem słownym", async () => {
    const dluga = `${"Jak rozpoznać, że rozmówca potrzebuje natychmiastowej pomocy specjalisty, ".repeat(3)}i co wtedy zrobić?`;
    const lista = zLukami();
    lista[0] = { ...lista[0], body: dluga };
    await otworz(lista);

    const [pierwszy, , trzeci] = wiersze();
    expect(within(pierwszy).getByText(dluga)).toBeInTheDocument();
    const odpowiedzi = within(trzeci).getByRole("list", { name: "Odpowiedzi do pytania 3" });
    const pozycje = within(odpowiedzi).getAllByRole("listitem");
    expect(pozycje).toHaveLength(3);
    expect(pozycje[0]).toHaveTextContent("Poprawna");
    expect(pozycje[0]).toHaveTextContent("Gdy zagrożone jest życie lub zdrowie");
    expect(pozycje[1]).not.toHaveTextContent("Poprawna");
    expect(pozycje[2]).toHaveTextContent("Tylko na prośbę rodziny");
  });
});

describe("jeden zielony przycisk — w nagłówku", () => {
  it("lista: jedyny zielony to „Dodaj pytanie” w nagłówku; „Edytuj” obrysowany, „Usuń” obrysowany w barwie niebezpiecznej", async () => {
    await otworz();
    const lista = zielone();
    expect(lista).toHaveLength(1);
    expect(lista[0]).toHaveTextContent("Dodaj pytanie");
    expect(lista[0].closest('[data-obszar="naglowek"]')).not.toBeNull();
    const edytuj = screen.getByRole("button", { name: "Edytuj pytanie 1" });
    expect(maKlase(edytuj, "outline")).toBe(true);
    const usun = screen.getByRole("button", { name: "Usuń pytanie 1" });
    expect(maKlase(usun, "outline")).toBe(true);
    expect(maKlase(usun, "niebezpieczny")).toBe(true);
  });

  it("formularz pytania stoi we wspólnym oknie formularza; nagłówek ekranu zostaje z tym samym zielonym przyciskiem", async () => {
    const uzytkownik = userEvent.setup({ delay: null });
    await otworz();
    await uzytkownik.click(screen.getByRole("button", { name: "Edytuj pytanie 2" }));

    const okno = screen.getByRole("dialog", { name: "Edycja pytania 2" });
    expect(okno).toHaveAttribute("data-wariant", "formularz");
    expect(within(okno).getByLabelText(/^Treść pytania/)).toHaveFocus();
    expect(within(okno).getByLabelText(/^Treść pytania/)).toHaveValue("Która postawa wspiera rozmowę, która nie ocenia?");
    expect(maKlase(within(okno).getByRole("button", { name: "Zapisz pytanie" }), "primary")).toBe(true);
    for (const nazwa of ["Dodaj odpowiedź", "Usuń odpowiedź 1"]) {
      const przycisk = within(okno).getByRole("button", { name: nazwa });
      expect(przycisk).toHaveAttribute("type", "button");
      expect(maKlase(przycisk, "primary")).toBe(false);
    }
    const lista = zielone();
    expect(lista).toHaveLength(1);
    expect(lista[0]).toHaveTextContent("Dodaj pytanie");
  });

  it("odmowa zapisu: podsumowanie błędów okna z odnośnikiem do pola i błąd przy polu", async () => {
    const uzytkownik = userEvent.setup({ delay: null });
    await otworz();
    await uzytkownik.click(zielone()[0]);
    const okno = screen.getByRole("dialog", { name: "Nowe pytanie" });
    await uzytkownik.click(within(okno).getByRole("button", { name: "Zapisz pytanie" }));

    const podsumowanie = within(okno).getByRole("group", { name: "Popraw dane w formularzu" });
    expect(podsumowanie).toHaveFocus();
    expect(within(podsumowanie).getByRole("link", { name: "Treść pytania nie może być pusta." })).toHaveAttribute("href", "#nowe-pytanie-tresc");
    expect(within(okno).getByLabelText(/^Treść pytania/)).toHaveAttribute("aria-invalid", "true");
    expect(dodajPytanie).not.toHaveBeenCalled();
  });

  it("błąd odczytu: „Spróbuj ponownie” jest obrysowany, zielonego przycisku nie ma", async () => {
    pobierzPytania.mockRejectedValue(new ApiError({ status: 500, code: "server_error", message: "Serwer chwilowo nie odpowiada." }));
    render(<PytaniaTestu idTestu={String(ID_TESTU)} panel="administracja" />);
    const ponow = await screen.findByRole("button", { name: "Spróbuj ponownie" });
    expect(maKlase(ponow, "outline")).toBe(true);
    expect(zielone()).toHaveLength(0);
  });
});

describe("usunięcie — wspólne okno w wariancie niebezpiecznym", () => {
  it("przycisk potwierdzenia ma barwę niebezpieczną", async () => {
    const uzytkownik = userEvent.setup({ delay: null });
    await otworz();
    await uzytkownik.click(screen.getByRole("button", { name: "Usuń pytanie 2" }));
    const okno = screen.getByRole("dialog", { name: "Usunąć pytanie 2?" });
    expect(maKlase(within(okno).getByRole("button", { name: "Usuń pytanie" }), "niebezpieczny")).toBe(true);
  });
});

describe("strzałki kolejności po lewej stronie wiersza", () => {
  it("strzałki stoją na początku wiersza; skrajne są wyłączone", async () => {
    await otworz();
    const lista = wiersze();
    for (const wiersz of lista) expect(wiersz.firstElementChild?.querySelector('[data-strzalka="wyzej"]')).not.toBeNull();
    expect(within(lista[0]).getByRole("button", { name: `Przenieś „${PIERWSZE}” wyżej` })).toHaveAttribute("aria-disabled", "true");
    expect(within(lista[0]).getByRole("button", { name: `Przenieś „${PIERWSZE}” niżej` })).not.toHaveAttribute("aria-disabled");
    expect(within(lista[2]).getByRole("button", { name: /niżej$/ })).toHaveAttribute("aria-disabled", "true");
  });

  it("„niżej”: wiersz od razu na nowym miejscu, zapis zamiany przez wolne miejsce, ogłoszenie, przyciski czekają na zapis", async () => {
    const uzytkownik = userEvent.setup({ delay: null });
    let potwierdz: () => void = () => {};
    zapiszKolejnosc.mockReturnValue(new Promise<void>((tak) => (potwierdz = tak)));
    await otworz();

    await uzytkownik.click(screen.getByRole("button", { name: `Przenieś „${PIERWSZE}” niżej` }));
    const lista = wiersze();
    expect(lista.map((wiersz) => wiersz.getAttribute("data-ruch-klucz"))).toEqual(["pytanie-42", "pytanie-41", "pytanie-43"]);
    expect(within(lista[1]).getByRole("heading", { level: 3, name: "Pytanie 2" })).toBeInTheDocument();
    expect(within(lista[1]).getByText(PIERWSZE)).toBeInTheDocument();
    expect(zapiszKolejnosc).toHaveBeenCalledWith("administracja", [
      { idPytania: 41, pozycja: 13 },
      { idPytania: 42, pozycja: 3 },
      { idPytania: 41, pozycja: 7 },
    ]);
    await waitFor(() => expect(ogloszenie()).toBe(`Przeniesiono „${PIERWSZE}” na miejsce 2 z 3.`));
    const edytuj = screen.getByRole("button", { name: "Edytuj pytanie 1" });
    expect(edytuj).toBeDisabled();
    expect(edytuj).toHaveAccessibleDescription("Zapisujemy kolejność. Poczekaj chwilę.");
    expect(within(lista[1]).getByRole("button", { name: /wyżej$/ })).toHaveAttribute("aria-disabled", "true");

    potwierdz();
    await waitFor(() => expect(screen.getByRole("button", { name: "Edytuj pytanie 1" })).toBeEnabled());
    expect(within(wiersze()[1]).getByRole("button", { name: /wyżej$/ })).not.toHaveAttribute("aria-disabled");
  });

  it("odmowa zapisu kolejności: komunikat i lista wczytana od nowa z serwera", async () => {
    const uzytkownik = userEvent.setup({ delay: null });
    zapiszKolejnosc.mockRejectedValue(new ApiError({ status: 500, code: "server_error", message: "" }));
    await otworz();
    pobierzPytania.mockResolvedValue(zLukami());

    await uzytkownik.click(screen.getByRole("button", { name: `Przenieś „${PIERWSZE}” niżej` }));
    expect(await screen.findByRole("heading", { name: "Nie udało się zapisać kolejności" })).toBeInTheDocument();
    await waitFor(() => expect(wiersze().map((wiersz) => wiersz.getAttribute("data-ruch-klucz"))).toEqual(["pytanie-41", "pytanie-42", "pytanie-43"]));
    expect(pobierzPytania).toHaveBeenCalledTimes(2);
  });
});

describe("telefon: przyciski w treści na pełną szerokość", () => {
  it("przyciski wiersza stoją w kontenerze, który na telefonie rozciąga je na całą szerokość", async () => {
    await otworz();
    for (const nazwa of ["Edytuj pytanie 1", "Usuń pytanie 1"]) {
      expect(maKlase(screen.getByRole("button", { name: nazwa }).parentElement as Element, "akcje")).toBe(true);
    }
  });
});

describe("adres ekranu z ekranu kursu niesie numer kursu", () => {
  it("oba panele dopisują parametr „kurs”", () => {
    expect(konfiguracjaRoli("admin").adresTestu(31, 4)).toBe("/admin/testy/31/pytania?kurs=4");
    expect(konfiguracjaRoli("instructor").adresTestu(31, 4)).toBe("/prowadzacy/testy/31/pytania?kurs=4");
  });

  it("oba panele mają wiersz testu w edytorze kursu: administracja i prowadzący", () => {
    expect(konfiguracjaRoli("admin").testKursu).toBe(true);
    expect(konfiguracjaRoli("instructor").testKursu).toBe(true);
  });
});
