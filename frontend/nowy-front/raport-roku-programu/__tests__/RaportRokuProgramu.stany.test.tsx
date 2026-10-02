import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { osoba, OSOBY, pustyRok, raport } from "./atrapy";

/**
 * Stany ekranu „Raport roku programu”: co osoba widzi (nagłówki, przyciski
 * i to, czy są czynne, zdania wyjaśniające, nazwy dostępne) i co może zrobić.
 * Żądania są atrapami modułu danych; odczyt kształtu odpowiedzi i rozpoznanie
 * błędów są prawdziwe.
 */

const pobierzRaport = vi.fn();
const pobierzZestawienie = vi.fn();
const pobierzLiczbyDlaGrantodawcy = vi.fn();
const back = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/nowy-front/admin/raport",
}));

// Odczyt konta wspólnego ekranu odmowy: bez sieci, ekran pomija wtedy zdanie o osobie.
vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: () => Promise.reject(new TypeError("Brak sieci w teście")),
}));

vi.mock("../dane", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("../dane")>();
  return {
    ...oryginal,
    pobierzRaport: (...args: unknown[]) => pobierzRaport(...args).then(oryginal.odczytajRaport),
    pobierzZestawienie: (...args: unknown[]) => pobierzZestawienie(...args),
    pobierzLiczbyDlaGrantodawcy: (...args: unknown[]) => pobierzLiczbyDlaGrantodawcy(...args),
  };
});

const { ApiError } = await import("@/lib/api/klient");
const { RaportRokuProgramu } = await import("../RaportRokuProgramu");

function zielone() {
  return screen
    .queryAllByRole("button")
    .filter((przycisk) => przycisk.className.split(/\s+/).some((klasa) => /(^|_)primary(_|$)/.test(klasa)));
}

function przyciskGlowny() {
  const lista = zielone();
  expect(lista).toHaveLength(1);
  return lista[0];
}

/** Wartość z listy opisów: `dd` przy danym `dt`. */
function wartosc(sekcja: HTMLElement, nazwa: string) {
  return within(sekcja).getByText(nazwa, { selector: "dt" }).nextElementSibling;
}

async function otworz(odpowiedz: unknown = raport()) {
  if (odpowiedz instanceof Error) pobierzRaport.mockRejectedValue(odpowiedz);
  else pobierzRaport.mockResolvedValue(odpowiedz);
  render(<RaportRokuProgramu />);
  await waitFor(() => expect(screen.queryByText("Wczytywanie raportu…")).toBeNull());
}

beforeEach(() => {
  pobierzRaport.mockReset();
  pobierzZestawienie.mockReset().mockResolvedValue(undefined);
  pobierzLiczbyDlaGrantodawcy.mockReset().mockResolvedValue(undefined);
  back.mockReset();
});

describe("ładowanie", () => {
  it("tytuł, zdanie stanu, daty i przycisk okresu nieczynne ze zdaniem dlaczego, bez zielonego przycisku", () => {
    pobierzRaport.mockReturnValue(new Promise(() => {}));
    render(<RaportRokuProgramu />);

    expect(screen.getByRole("heading", { level: 1, name: "Raport roku programu" })).toBeInTheDocument();
    expect(screen.getByText("Wczytywanie raportu…")).toHaveAttribute("role", "status");
    expect(screen.getByLabelText("Początek okresu")).toBeDisabled();
    const pokaz = screen.getByRole("button", { name: "Pokaż raport za ten okres" });
    expect(pokaz).toBeDisabled();
    expect(pokaz).toHaveAccessibleDescription("Trwa wczytywanie raportu — poczekaj chwilę.");
    expect(zielone()).toHaveLength(0);
  });
});

describe("błąd", () => {
  it("odpowiedź serwera z błędem: komunikat i zielony „Spróbuj ponownie”, który czyta raport od nowa", async () => {
    const uzytkownik = userEvent.setup();
    await otworz(new ApiError({ status: 500, code: "server_error", message: "Błąd." }));

    expect(screen.getByRole("alert")).toHaveTextContent("Nie udało się wczytać raportu");
    expect(screen.getByText("Serwer nie odpowiedział albo zwrócił błąd. Liczby nie są pokazywane bez danych.")).toBeInTheDocument();
    const przycisk = przyciskGlowny();
    expect(przycisk).toHaveTextContent("Spróbuj ponownie");
    expect(przycisk).toBeEnabled();
    expect(screen.queryByRole("heading", { name: "Od kiedy do kiedy" })).toBeNull();

    pobierzRaport.mockResolvedValue(raport());
    await uzytkownik.click(przycisk);
    expect(await screen.findByRole("heading", { level: 2, name: "Najważniejsze liczby" })).toBeInTheDocument();
    expect(pobierzRaport).toHaveBeenCalledTimes(2);
  });

  it("odpowiedź bez liczb roku programu (starsze zaplecze) też jest błędem, nie zerami", async () => {
    await otworz({ summary: {}, people: [] });
    expect(screen.getByRole("alert")).toHaveTextContent("Nie udało się wczytać raportu");
  });
});

describe("brak połączenia", () => {
  it("„Brak połączenia”, zdanie o internecie i zielony „Spróbuj ponownie”", async () => {
    await otworz(new TypeError("Failed to fetch"));
    expect(screen.getByRole("alert")).toHaveTextContent("Brak połączenia");
    expect(screen.getByText("Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie.")).toBeInTheDocument();
    expect(przyciskGlowny()).toHaveTextContent("Spróbuj ponownie");
  });
});

describe("brak dostępu — wspólny ekran odmowy", () => {
  it("nagłówek odmowy, dla kogo jest ekran i jeden przycisk powrotu; bez dat, liczb i plików", async () => {
    const uzytkownik = userEvent.setup();
    await otworz(new ApiError({ status: 403, code: "forbidden", message: "Nie masz dostępu do tego zasobu." }));

    expect(screen.getByRole("heading", { level: 2, name: "Nie masz dostępu do tego ekranu" })).toBeInTheDocument();
    expect(screen.getByText("Ten ekran jest dla administracji.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Od kiedy do kiedy" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Pobierz/ })).toBeNull();
    expect(zielone()).toHaveLength(0);
    await uzytkownik.click(screen.getByRole("button", { name: "Wróć" }));
    expect(back).toHaveBeenCalled();
  });
});

describe("rok bez osób", () => {
  it("zera, puste zestawienie ze zdaniem, „Pobierz zestawienie (Excel)” nieczynne ze zdaniem dlaczego", async () => {
    await otworz(pustyRok());

    const glowne = screen.getByRole("region", { name: "Najważniejsze liczby" });
    expect(wartosc(glowne, "W programie (konto aktywne)")).toHaveTextContent("0");
    expect(wartosc(glowne, "Osoby z zaliczonym testem")).toHaveTextContent("0 z 0");
    expect(wartosc(glowne, "Godziny dyżurów")).toHaveTextContent("0 godz.");

    const zestawienie = screen.getByRole("region", { name: "Zestawienie" });
    expect(within(zestawienie).getAllByText("W tym roku programu nie ma jeszcze osób, więc zestawienie jest puste.").length).toBeGreaterThan(0);
    expect(within(zestawienie).queryByRole("table")).toBeNull();
    const plik = within(zestawienie).getByRole("button", { name: "Pobierz zestawienie (Excel)" });
    expect(plik).toBeDisabled();
    expect(plik).toHaveAccessibleDescription("W tym roku programu nie ma jeszcze osób, więc zestawienie jest puste.");
    expect(przyciskGlowny()).toHaveTextContent("Pobierz liczby dla grantodawcy (bez nazwisk)");
    expect(przyciskGlowny()).not.toHaveAttribute("aria-disabled");
  });
});

describe("raport z danymi", () => {
  it("nagłówek z rokiem programu raz, sekcje w kolejności, zdanie o datach i opis okresu", async () => {
    await otworz();

    expect(screen.getByText("Rok programu: Edycja 2026")).toBeInTheDocument();
    expect(screen.getAllByText(/Edycja 2026/)).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 2 }).map((naglowek) => naglowek.textContent)).toEqual([
      "Od kiedy do kiedy",
      "Najważniejsze liczby",
      "Dla grantodawcy",
      "Pozostałe liczby",
      "Zestawienie",
    ]);
    expect(
      screen.getByText("Daty zawężają tylko godziny dyżurów, średnią na wolontariusza i konsultacje, a pozostałe liczby i zestawienie pokazują stan na dziś."),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Liczby bez zawężenia dat.");
    expect(screen.getByLabelText("Początek okresu")).toBeEnabled();
    expect(screen.getByLabelText("Koniec okresu")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Pokaż raport za ten okres" })).toBeEnabled();
  });

  it("najważniejsze liczby jako lista opisów, godziny jako „godz.”, bez kafli z odnośnikami", async () => {
    await otworz();

    const glowne = screen.getByRole("region", { name: "Najważniejsze liczby" });
    expect(within(glowne).getAllByRole("term").map((dt) => dt.textContent)).toEqual([
      "W programie (konto aktywne)",
      "Ukończyli program",
      "Osoby z zaliczonym testem",
      "Certyfikaty wydane (bez unieważnionych)",
      "Godziny dyżurów",
      "Średnio na wolontariusza",
    ]);
    expect(wartosc(glowne, "W programie (konto aktywne)")).toHaveTextContent("3");
    expect(wartosc(glowne, "Osoby z zaliczonym testem")).toHaveTextContent("1 z 3");
    expect(wartosc(glowne, "Certyfikaty wydane (bez unieważnionych)")).toHaveTextContent("1");
    expect(wartosc(glowne, "Godziny dyżurów")).toHaveTextContent("21,5 godz.");
    expect(wartosc(glowne, "Średnio na wolontariusza")).toHaveTextContent("7,2 godz.");
    expect(within(glowne).queryByRole("link")).toBeNull();
    expect(glowne.textContent).not.toMatch(/\d\s?h\b/);
  });

  it("dla grantodawcy: jedno zdanie i jeden zielony przycisk, który pobiera plik z samymi liczbami", async () => {
    const uzytkownik = userEvent.setup();
    await otworz();

    const sekcja = screen.getByRole("region", { name: "Dla grantodawcy" });
    expect(within(sekcja).getByText("Grantodawca dostaje tylko liczby, bez nazwisk.")).toBeInTheDocument();
    const przycisk = przyciskGlowny();
    expect(sekcja).toContainElement(przycisk);
    expect(przycisk).toHaveAccessibleName("Pobierz liczby dla grantodawcy (bez nazwisk)");

    await uzytkownik.click(przycisk);
    expect(pobierzLiczbyDlaGrantodawcy).toHaveBeenCalledWith({});
    expect(await within(sekcja).findByText("Plik pobrany.")).toBeInTheDocument();
  });

  it("w czasie pobierania liczb dla grantodawcy przycisk jest nieczynny ze zdaniem dlaczego; błąd pobrania ma komunikat", async () => {
    const uzytkownik = userEvent.setup();
    let odrzuc: (powod: unknown) => void = () => {};
    pobierzLiczbyDlaGrantodawcy.mockReturnValue(new Promise((_, nie) => (odrzuc = nie)));
    await otworz();

    await uzytkownik.click(przyciskGlowny());
    const przycisk = przyciskGlowny();
    expect(przycisk).toHaveTextContent("Pobieranie…");
    expect(przycisk).toHaveAttribute("aria-disabled", "true");
    expect(przycisk).toHaveAccessibleDescription("Trwa pobieranie pliku — poczekaj chwilę.");
    await uzytkownik.click(przycisk);
    expect(pobierzLiczbyDlaGrantodawcy).toHaveBeenCalledTimes(1);

    odrzuc(new TypeError("Failed to fetch"));
    expect(await screen.findByRole("heading", { name: "Nie udało się pobrać liczb dla grantodawcy" })).toBeInTheDocument();
    expect(screen.getByText("Sprawdź połączenie z internetem i spróbuj jeszcze raz.")).toBeInTheDocument();
  });

  it("pozostałe liczby z jednym wierszem studentów", async () => {
    await otworz();
    const sekcja = screen.getByRole("region", { name: "Pozostałe liczby" });
    expect(wartosc(sekcja, "Przyjęci do programu (zgłoszenia przyjęte)")).toHaveTextContent("4");
    expect(wartosc(sekcja, "Konsultacje na dyżurach")).toHaveTextContent("15");
    expect(wartosc(sekcja, "Studenci")).toHaveTextContent("2 osoby z kontem aktywnym, ukończyli program: 1");
  });

  it("zestawienie w raporcie: nazwisko jako nagłówek wiersza, rola, kursy, staż, superwizje, warsztat i „Otwórz kartę” z nazwą osoby", async () => {
    await otworz();

    const sekcja = screen.getByRole("region", { name: "Zestawienie" });
    const tabela = within(sekcja).getByRole("table", { name: "Zestawienie osób roku programu" });
    expect(within(tabela).getAllByRole("columnheader").map((k) => k.textContent)).toEqual([
      "Osoba", "Rola", "Kursy", "Staż", "Superwizje", "Warsztat", "Karta osoby",
    ]);
    const wiersze = within(tabela).getAllByRole("row").slice(1);
    expect(wiersze).toHaveLength(4);

    const marta = wiersze[0];
    expect(within(marta).getByRole("rowheader")).toHaveTextContent("Marta Demo");
    expect(within(marta).getAllByRole("cell").map((k) => k.textContent)).toEqual([
      "Wolontariusz", "8 z 10", "41,5 z 72 godz.", "5 z 6", "nie zaliczony", "Otwórz kartę osoby: Marta Demo",
    ]);
    expect(within(marta).getByRole("link", { name: "Otwórz kartę osoby: Marta Demo" })).toHaveAttribute("href", "/admin/uczestniczki/101");

    expect(within(wiersze[1]).getAllByRole("cell")[4]).toHaveTextContent("zaliczony 18 września 2026");

    const filip = wiersze[3];
    expect(within(filip).getByRole("rowheader")).toHaveTextContent("Filip Demo");
    const komorki = within(filip).getAllByRole("cell").map((k) => k.textContent);
    expect(komorki[0]).toBe("Student");
    expect(komorki[2]).toBe("nie dotyczy");
    expect(komorki[3]).toBe("nie dotyczy");

    expect(within(sekcja).getByText("Wolontariusze i studenci roku programu: 4 osoby.")).toBeInTheDocument();
  });

  it("„Pobierz zestawienie (Excel)” z uwagą, że plik jest do użytku w Fundacji", async () => {
    const uzytkownik = userEvent.setup();
    await otworz();

    const plik = screen.getByRole("button", { name: "Pobierz zestawienie (Excel)" });
    expect(plik).toBeEnabled();
    expect(plik).toHaveAccessibleDescription("Do użytku w Fundacji. Nie przekazuj grantodawcy.");
    await uzytkownik.click(plik);
    expect(pobierzZestawienie).toHaveBeenCalledWith({});
  });

  it("stronicowanie zestawienia po 25 osób, fokus na nagłówku zestawienia po zmianie strony", async () => {
    const uzytkownik = userEvent.setup();
    const wiele = Array.from({ length: 30 }, (_, i) => osoba({ id: 200 + i, first_name: `Osoba${String(i + 1).padStart(2, "0")}` }));
    await otworz(raport({ people: wiele }));

    const tabela = screen.getByRole("table", { name: "Zestawienie osób roku programu" });
    expect(within(tabela).getAllByRole("row")).toHaveLength(26);
    expect(screen.getByText("Strona 1 z 2")).toBeInTheDocument();
    await uzytkownik.click(screen.getByRole("button", { name: "Następna" }));

    expect(screen.getByText("Strona 2 z 2")).toBeInTheDocument();
    const druga = screen.getByRole("table", { name: "Zestawienie osób roku programu" });
    expect(within(druga).getAllByRole("rowheader").map((k) => k.textContent)).toEqual([
      "Osoba26 Demo", "Osoba27 Demo", "Osoba28 Demo", "Osoba29 Demo", "Osoba30 Demo",
    ]);
    expect(screen.getByRole("heading", { level: 2, name: "Zestawienie" })).toHaveFocus();
  });

  it("jeden zielony przycisk na ekranie z danymi", async () => {
    await otworz();
    expect(przyciskGlowny()).toHaveTextContent("Pobierz liczby dla grantodawcy (bez nazwisk)");
  });
});

describe("okres bez zdarzeń", () => {
  it("wybrane daty idą do raportu i do plików; zera godzin ze zdaniem, stan dziś bez zmian", async () => {
    const uzytkownik = userEvent.setup();
    await otworz();

    pobierzRaport.mockResolvedValue(
      raport({
        period: { from: "2025-01-01", to: "2025-01-31" },
        program: { ...raport().program, hours_accepted_total: "0", hours_accepted_average: "0", consultations_total: 0 },
        people: OSOBY,
      }),
    );
    await uzytkownik.type(screen.getByLabelText("Początek okresu"), "2025-01-01");
    await uzytkownik.type(screen.getByLabelText("Koniec okresu"), "2025-01-31");
    await uzytkownik.click(screen.getByRole("button", { name: "Pokaż raport za ten okres" }));

    expect(pobierzRaport).toHaveBeenLastCalledWith({ from: "2025-01-01", to: "2025-01-31" });
    expect(await screen.findByText("W wybranym okresie nie ma zaakceptowanych dyżurów, więc godziny i konsultacje wynoszą zero.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Liczby za okres od 1 stycznia 2025 do 31 stycznia 2025.");
    const glowne = screen.getByRole("region", { name: "Najważniejsze liczby" });
    expect(wartosc(glowne, "Godziny dyżurów")).toHaveTextContent("0 godz.");
    expect(wartosc(glowne, "W programie (konto aktywne)")).toHaveTextContent("3");

    await uzytkownik.click(przyciskGlowny());
    expect(pobierzLiczbyDlaGrantodawcy).toHaveBeenCalledWith({ from: "2025-01-01", to: "2025-01-31" });
    await uzytkownik.click(screen.getByRole("button", { name: "Pobierz zestawienie (Excel)" }));
    expect(pobierzZestawienie).toHaveBeenCalledWith({ from: "2025-01-01", to: "2025-01-31" });
  });
});

describe("zły zakres dat", () => {
  it("koniec przed początkiem: błąd przy polu „Koniec okresu”, bez żądania, liczby zostają", async () => {
    const uzytkownik = userEvent.setup();
    await otworz();

    await uzytkownik.type(screen.getByLabelText("Początek okresu"), "2026-03-31");
    await uzytkownik.type(screen.getByLabelText("Koniec okresu"), "2026-03-01");
    await uzytkownik.click(screen.getByRole("button", { name: "Pokaż raport za ten okres" }));

    const koniec = screen.getByLabelText("Koniec okresu");
    expect(koniec).toHaveAttribute("aria-invalid", "true");
    expect(koniec).toHaveAccessibleDescription("Data końca nie może być wcześniejsza niż data początku.");
    expect(pobierzRaport).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("region", { name: "Najważniejsze liczby" })).toBeInTheDocument();
  });

  it("odmowa serwera dla okresu (422): ten sam błąd przy polu i ostatnio pokazane liczby", async () => {
    const uzytkownik = userEvent.setup();
    await otworz();

    pobierzRaport.mockRejectedValue(
      new ApiError({ status: 422, code: "validation_failed", message: "Popraw zaznaczone pola.", errors: { to: ["Data końca nie może być wcześniejsza niż data początku."] } }),
    );
    await uzytkownik.type(screen.getByLabelText("Początek okresu"), "2026-03-01");
    await uzytkownik.click(screen.getByRole("button", { name: "Pokaż raport za ten okres" }));

    expect(await screen.findByRole("region", { name: "Najważniejsze liczby" })).toBeInTheDocument();
    expect(screen.getByLabelText("Koniec okresu")).toHaveAccessibleDescription("Data końca nie może być wcześniejsza niż data początku.");
    expect(screen.getByRole("status")).toHaveTextContent("Liczby bez zawężenia dat.");
  });
});
