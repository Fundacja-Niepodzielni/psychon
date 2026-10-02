import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ApiError } from "@/lib/api/klient";
import { saPowodyPytania } from "@/design-system/szablony/NiezapisaneZmiany";
import { WATEK, WATEK_BEZ_WIADOMOSCI, WIADOMOSC_1, WIADOMOSC_2, WIADOMOSC_BEZ_AUTORA, meta } from "./atrapy";
import { etykietyPol, nazwyDzialan, przyciskiGlowne, szablonListy } from "./kontrole-ekranu";

/**
 * Ekran „Wątek grupowy”: ładowanie · błąd · brak połączenia · brak dostępu · nie znaleziono · brak wątku ·
 * lista wątków · wątek bez wiadomości · wątek z wiadomościami · wysyłanie (zapisywanie, wysłano, błąd serwera) ·
 * skład wątku. W każdym stanie: jeden korzeń szablonu, jeden `h1`, najwyżej jeden przycisk główny. Każdy stan
 * sprawdza nagłówek, przycisk główny i to, czy działa, zdania wyjaśniające i nazwy wszystkich przycisków i
 * odnośników. Każdy pomiar ma kontrolę dodatnią: zmianę danych wejścia, która MUSI zmienić to, co widać.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push, replace: vi.fn(), refresh: vi.fn() }),
}));

const api = vi.fn();
vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
}));

const pobierzWatki = vi.fn();
const zalozWatek = vi.fn();
const pobierzWiadomosci = vi.fn();
const wyslijWiadomosc = vi.fn();
const dodajOsobe = vi.fn();
const usunOsobe = vi.fn();
vi.mock("../dane", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../dane")>()),
  pobierzWatki: (...args: unknown[]) => pobierzWatki(...args),
  zalozWatek: (...args: unknown[]) => zalozWatek(...args),
  pobierzWiadomosci: (...args: unknown[]) => pobierzWiadomosci(...args),
  wyslijWiadomosc: (...args: unknown[]) => wyslijWiadomosc(...args),
  dodajOsobe: (...args: unknown[]) => dodajOsobe(...args),
  usunOsobe: (...args: unknown[]) => usunOsobe(...args),
}));

const { WatekGrupowy } = await import("../WatekGrupowy");

function blad(status: number, code: string, message = "komunikat serwera") {
  return new ApiError({ status, code, message });
}

async function pokaz() {
  let wynik: ReturnType<typeof render> | undefined;
  await act(async () => {
    wynik = render(<WatekGrupowy />);
  });
  return wynik!;
}

async function pokazListe(watki: unknown = [WATEK]) {
  pobierzWatki.mockResolvedValue(watki);
  const wynik = await pokaz();
  await screen.findByRole("heading", { level: 2, name: "Wątki grupowe" });
  return wynik;
}

/** Wątek otwarty przyciskiem „Otwórz wątek”; wiadomości już wczytane. */
async function otworzWatek(wiadomosci: unknown[] = [WIADOMOSC_1, WIADOMOSC_2], metaOdpowiedzi = meta({ total: wiadomosci.length })) {
  pobierzWiadomosci.mockResolvedValue({ data: wiadomosci, meta: metaOdpowiedzi });
  const wynik = await pokazListe();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Otwórz wątek grupowy" }));
  });
  await screen.findByRole("form", { name: "Nowa wiadomość" });
  return wynik;
}

function glowny(container: HTMLElement): HTMLButtonElement {
  const [przycisk, ...reszta] = przyciskiGlowne(container);
  expect(reszta).toHaveLength(0);
  return przycisk;
}

beforeEach(() => {
  push.mockReset();
  api.mockReset();
  api.mockResolvedValue({ first_name: "Anna", role: "instructor" });
  for (const mock of [pobierzWatki, zalozWatek, pobierzWiadomosci, wyslijWiadomosc, dodajOsobe, usunOsobe]) mock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("Wątek grupowy — stany bez danych", () => {
  it("ładowanie: nagłówek, zdanie stanu, brak przycisku głównego", async () => {
    pobierzWatki.mockReturnValue(new Promise(() => {}));
    const { container } = await pokaz();

    szablonListy(container);
    expect(screen.getByRole("heading", { level: 1, name: "Wątek grupowy" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Wczytywanie wątku grupowego…");
    expect(przyciskiGlowne(container)).toHaveLength(0);
    expect(nazwyDzialan(container)).toEqual(["Wstecz"]);
  });

  it("błąd: komunikat serwera i ponowienie, które czyta listę jeszcze raz", async () => {
    pobierzWatki.mockRejectedValue(blad(500, "server_error", "Serwer nie odpowiada."));
    const { container } = await pokaz();

    expect(screen.getByRole("alert")).toHaveTextContent("Nie udało się wczytać wątku grupowego");
    expect(screen.getByRole("alert")).toHaveTextContent("Serwer nie odpowiada.");
    expect(nazwyDzialan(container)).toEqual(["Wstecz", "Spróbuj ponownie"]);

    pobierzWatki.mockResolvedValue([WATEK]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    });
    expect(pobierzWatki).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole("heading", { level: 2, name: "Wątki grupowe" })).toBeInTheDocument();
  });

  it("brak połączenia: osobny komunikat", async () => {
    pobierzWatki.mockRejectedValue(new TypeError("Failed to fetch"));
    const { container } = await pokaz();

    expect(screen.getByRole("alert")).toHaveTextContent("Brak połączenia");
    expect(screen.getByRole("alert")).toHaveTextContent("Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie.");
    expect(nazwyDzialan(container)).toEqual(["Wstecz", "Spróbuj ponownie"]);
  });

  it.each([403, 401])("brak dostępu (%i): wspólny ekran odmowy z jednym przyciskiem prowadzącym do pulpitu prowadzącego", async (status) => {
    pobierzWatki.mockRejectedValue(blad(status, "forbidden"));
    const { container } = await pokaz();

    szablonListy(container);
    expect(screen.getByRole("heading", { level: 2, name: "Nie masz dostępu do tego ekranu" })).toBeInTheDocument();
    expect(await screen.findByText(/Ten ekran jest dla osób prowadzących\./)).toBeInTheDocument();
    expect(nazwyDzialan(container)).toEqual(["Wstecz", "Wróć do pulpitu"]);
    expect(przyciskiGlowne(container)).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Wróć do pulpitu" }));
    expect(push).toHaveBeenCalledWith("/prowadzacy");
  });

  it("nie znaleziono (404): wspólny ekran z przyciskiem „Odśwież”", async () => {
    pobierzWatki.mockRejectedValue(blad(404, "not_found"));
    const { container } = await pokaz();
    expect(screen.getByRole("heading", { level: 2, name: "Nie znaleziono wątku grupowego" })).toBeInTheDocument();
    expect(nazwyDzialan(container)).toEqual(["Wstecz", "Odśwież"]);
  });
});

describe("Wątek grupowy — brak wątku", () => {
  it("zdanie wyjaśniające i jeden zielony, aktywny przycisk „Załóż wątek grupowy” w nagłówku", async () => {
    pobierzWatki.mockResolvedValue([]);
    const { container } = await pokaz();
    await screen.findByRole("heading", { level: 2, name: "Nie masz jeszcze wątku grupowego" });

    szablonListy(container);
    expect(screen.getByRole("heading", { level: 1, name: "Wątek grupowy" })).toBeInTheDocument();
    expect(screen.getByText(/Załóż go przyciskiem „Załóż wątek grupowy” u góry strony, żeby pisać do całej grupy\./)).toBeInTheDocument();
    const przycisk = glowny(container);
    expect(przycisk).toHaveTextContent("Załóż wątek grupowy");
    expect(przycisk).not.toHaveAttribute("aria-disabled");
    expect(nazwyDzialan(container)).toEqual(["Wstecz", "Załóż wątek grupowy"]);
  });

  it("założenie: jedno żądanie, ponowny odczyt listy i wątek na liście", async () => {
    pobierzWatki.mockResolvedValueOnce([]).mockResolvedValue([WATEK]);
    zalozWatek.mockResolvedValue(WATEK);
    const { container } = await pokaz();
    await screen.findByRole("heading", { level: 2, name: "Nie masz jeszcze wątku grupowego" });

    await act(async () => {
      fireEvent.click(glowny(container));
    });

    expect(zalozWatek).toHaveBeenCalledTimes(1);
    expect(pobierzWatki).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole("heading", { level: 2, name: "Wątki grupowe" })).toBeInTheDocument();
    expect(przyciskiGlowne(container)).toHaveLength(0);
  });

  it("błąd założenia: komunikat serwera albo zdanie zastępcze; przycisk zostaje; w trakcie napis „Zakładanie…”", async () => {
    pobierzWatki.mockResolvedValue([]);
    zalozWatek.mockRejectedValue(blad(403, "forbidden", "Brak uprawnień do założenia wątku."));
    const { container } = await pokaz();
    await screen.findByRole("heading", { level: 2, name: "Nie masz jeszcze wątku grupowego" });

    await act(async () => {
      fireEvent.click(glowny(container));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Nie udało się założyć wątku");
    expect(screen.getByRole("alert")).toHaveTextContent("Brak uprawnień do założenia wątku.");

    let zakoncz: (wartosc: unknown) => void = () => {};
    zalozWatek.mockReturnValue(new Promise((rozwiaz) => (zakoncz = rozwiaz)));
    await act(async () => {
      fireEvent.click(glowny(container));
    });
    expect(glowny(container)).toHaveTextContent("Zakładanie…");
    fireEvent.click(glowny(container));
    expect(zalozWatek).toHaveBeenCalledTimes(2);
    await act(async () => zakoncz(null));
  });
});

describe("Wątek grupowy — lista wątków", () => {
  it("wiersz z plakietką „Grupa”, datą ostatniej wiadomości i przyciskiem otwarcia; żadnego przycisku głównego", async () => {
    const { container } = await pokazListe();

    szablonListy(container);
    expect(screen.getByRole("heading", { level: 1, name: "Wątek grupowy" })).toBeInTheDocument();
    expect(screen.getByText("Rozmowa z całą grupą: wiadomości do wszystkich osób, które masz w grupie.")).toBeInTheDocument();
    expect(screen.getByText("Grupa")).toBeInTheDocument();
    expect(screen.getByText("Ostatnia wiadomość: 1 października 2026, 12:30")).toBeInTheDocument();
    expect(przyciskiGlowne(container)).toHaveLength(0);
    expect(nazwyDzialan(container)).toEqual(["Wstecz", "Otwórz wątek grupowy"]);
    expect(pobierzWiadomosci).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Wiadomości" })).not.toBeInTheDocument();
  });

  it("kontrola dodatnia: wątek bez wiadomości mówi „Brak wiadomości”", async () => {
    await pokazListe([WATEK_BEZ_WIADOMOSCI]);
    expect(screen.getByText("Brak wiadomości")).toBeInTheDocument();
  });
});

describe("Wątek grupowy — otwarty wątek", () => {
  it("otwarcie: najpierw wczytywanie, fokus na nagłówku „Wiadomości”, nigdy na przycisku akcji", async () => {
    let zakoncz: (odpowiedz: unknown) => void = () => {};
    pobierzWiadomosci.mockReturnValue(new Promise((rozwiaz) => (zakoncz = rozwiaz)));
    await pokazListe();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Otwórz wątek grupowy" }));
    });

    expect(pobierzWiadomosci).toHaveBeenCalledWith(5, 1);
    expect(screen.getByText("Wczytywanie wiadomości…")).toBeInTheDocument();
    const naglowek = screen.getByRole("heading", { level: 2, name: "Wiadomości" });
    expect(document.activeElement).toBe(naglowek);
    await act(async () => zakoncz({ data: [], meta: meta({ total: 0 }) }));
    expect(document.activeElement).toBe(naglowek);
  });

  it("wątek bez wiadomości: zdanie wyjaśniające, pole z licznikiem, niedostępny przycisk główny z powodem, skład wątku", async () => {
    const { container } = await otworzWatek([]);

    szablonListy(container);
    expect(screen.getByText("Nie ma jeszcze żadnych wiadomości w tym wątku.")).toBeInTheDocument();
    expect(etykietyPol(container)).toEqual(["Wiadomość do grupy", "Numer osoby"]);
    expect(screen.getByText("0/5000 znaków")).toBeInTheDocument();
    const przycisk = glowny(container);
    expect(przycisk).toHaveTextContent("Wyślij wiadomość");
    expect(przycisk).toHaveAttribute("aria-disabled", "true");
    expect(przycisk).toHaveAccessibleDescription("Wpisz treść wiadomości.");
    expect(nazwyDzialan(container)).toEqual(["Wstecz", "Otwórz wątek grupowy", "Wyślij wiadomość", "Dodaj do wątku", "Usuń z wątku"]);
    expect(screen.getByRole("heading", { level: 2, name: "Skład wątku" })).toBeInTheDocument();
  });

  it("wątek z wiadomościami: kolejność z serwera, autor i czytelna data, podział wierszy zachowany", async () => {
    await otworzWatek();

    const elementy = screen.getAllByText(/Wolna · |Prowadząca · /);
    expect(elementy.map((n) => n.textContent)).toEqual(["Kasia Wolna · 1 października 2026, 12:00", "Anna Prowadząca · 1 października 2026, 12:30"]);
    expect(screen.getByText("Cześć grupo!")).toBeInTheDocument();
    expect(screen.getByText(/Dzień dobry\./).textContent).toBe("Dzień dobry.\nSpotykamy się w środę.");
    expect(screen.queryByText("Nie ma jeszcze żadnych wiadomości w tym wątku.")).not.toBeInTheDocument();
  });

  it("treść jest zwykłym tekstem, a wiadomość bez autora i daty mówi „Nieznany nadawca”", async () => {
    const { container } = await otworzWatek([WIADOMOSC_BEZ_AUTORA]);

    expect(screen.getByText("Nieznany nadawca")).toBeInTheDocument();
    expect(screen.getByText("<b>wiadomość</b>")).toBeInTheDocument();
    expect(container.querySelector("li b")).toBeNull();
  });

  it("wątek bez pojęcia zamknięcia: pole pisania jest zawsze, a zdania o zamknięciu nie ma", async () => {
    const { container } = await otworzWatek();
    expect(screen.getByLabelText(/Wiadomość do grupy/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/zamknięt/i);
  });

  it("stronicowanie: zdanie o stronie, przyciski i żądanie następnej strony", async () => {
    const { container } = await otworzWatek([WIADOMOSC_1, WIADOMOSC_2], meta({ total: 61, last_page: 3 }));

    expect(screen.getByText("Na tej stronie: 2 z 61 wiadomości.")).toBeInTheDocument();
    expect(screen.getByText("Strona 1 z 3")).toBeInTheDocument();
    expect(nazwyDzialan(container)).toContain("Poprzednia");
    expect(screen.getByRole("button", { name: "Poprzednia" })).toBeDisabled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Następna" }));
    });
    expect(pobierzWiadomosci).toHaveBeenLastCalledWith(5, 2);
  });

  it("błędy wiadomości: 403, błąd z ponowieniem i zdanie zastępcze", async () => {
    pobierzWiadomosci.mockRejectedValue(blad(403, "forbidden"));
    await pokazListe();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Otwórz wątek grupowy" }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Nie masz uprawnień do wyświetlenia tego wątku.");
    expect(screen.queryByRole("form", { name: "Nowa wiadomość" })).not.toBeInTheDocument();

    pobierzWiadomosci.mockRejectedValue(blad(404, "not_found", "Nie znaleziono wątku."));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Otwórz wątek grupowy" }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Nie udało się wczytać wiadomości");
    expect(screen.getByRole("alert")).toHaveTextContent("Nie znaleziono wątku.");
    expect(screen.queryByRole("heading", { name: "Skład wątku" })).not.toBeInTheDocument();

    pobierzWiadomosci.mockResolvedValue({ data: [WIADOMOSC_1], meta: meta({ total: 1 }) });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    });
    expect(await screen.findByText("Cześć grupo!")).toBeInTheDocument();

    pobierzWiadomosci.mockRejectedValue(new TypeError("Failed to fetch"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Otwórz wątek grupowy" }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Nie udało się wczytać wiadomości. Spróbuj ponownie.");
  });
});

describe("Wątek grupowy — wysyłanie wiadomości", () => {
  function wpisz(tekst: string) {
    fireEvent.change(screen.getByLabelText(/Wiadomość do grupy/), { target: { value: tekst } });
  }

  it("wpisanie tekstu włącza przycisk, zgłasza niezapisaną pracę i pokazuje licznik znaków", async () => {
    const { container } = await otworzWatek();
    expect(saPowodyPytania()).toBe(false);

    wpisz("Cześć");

    const przycisk = glowny(container);
    expect(przycisk).not.toHaveAttribute("aria-disabled");
    expect(przycisk).not.toHaveAttribute("aria-describedby");
    expect(screen.getByText("5/5000 znaków")).toBeInTheDocument();
    expect(saPowodyPytania()).toBe(true);

    wpisz("   ");
    expect(glowny(container)).toHaveAttribute("aria-disabled", "true");
    expect(saPowodyPytania()).toBe(false);
  });

  it("limit z serwera: tekst ponad 5000 znaków jest ucinany do limitu", async () => {
    await otworzWatek();
    wpisz("x".repeat(5200));
    expect(screen.getByLabelText(/Wiadomość do grupy/)).toHaveValue("x".repeat(5000));
    expect(screen.getByText("5000/5000 znaków")).toBeInTheDocument();
  });

  it("wysłano: jedno żądanie, wiadomość na końcu listy, pole puste, potwierdzenie", async () => {
    const nowa = { ...WIADOMOSC_2, id: 110, body: "Do zobaczenia!", created_at: "2026-10-02T09:00:00Z" };
    wyslijWiadomosc.mockResolvedValue(nowa);
    const { container } = await otworzWatek();
    wpisz("Do zobaczenia!");

    await act(async () => {
      fireEvent.click(glowny(container));
    });

    expect(wyslijWiadomosc).toHaveBeenCalledTimes(1);
    expect(wyslijWiadomosc).toHaveBeenCalledWith(5, "Do zobaczenia!");
    expect(screen.getByText("Do zobaczenia!")).toBeInTheDocument();
    expect(screen.getByText("Anna Prowadząca · 2 października 2026, 11:00")).toBeInTheDocument();
    expect(screen.getByLabelText(/Wiadomość do grupy/)).toHaveValue("");
    expect(screen.getByText("Wiadomość została wysłana.")).toBeInTheDocument();
    expect(saPowodyPytania()).toBe(false);
  });

  it("zapisywanie: napis przycisku się zmienia, drugie kliknięcie niczego nie wysyła", async () => {
    let zakoncz: (wiadomosc: unknown) => void = () => {};
    wyslijWiadomosc.mockReturnValue(new Promise((rozwiaz) => (zakoncz = rozwiaz)));
    const { container } = await otworzWatek();
    wpisz("Cześć");

    await act(async () => {
      fireEvent.click(glowny(container));
    });
    expect(glowny(container)).toHaveTextContent("Wysyłanie…");
    fireEvent.click(glowny(container));
    expect(wyslijWiadomosc).toHaveBeenCalledTimes(1);

    await act(async () => zakoncz(WIADOMOSC_2));
    expect(glowny(container)).toHaveTextContent("Wyślij wiadomość");
  });

  it("błąd serwera: komunikat serwera albo zdanie zastępcze, wpisany tekst zostaje", async () => {
    wyslijWiadomosc.mockRejectedValue(blad(422, "validation_failed", "Wiadomość jest za długa (maksymalnie 5000 znaków)."));
    const { container } = await otworzWatek();
    wpisz("Cześć");

    await act(async () => {
      fireEvent.click(glowny(container));
    });
    expect(screen.getByText("Nie udało się wysłać wiadomości").closest("[role='alert']")).toHaveTextContent(
      "Wiadomość jest za długa (maksymalnie 5000 znaków).",
    );
    expect(screen.getByLabelText(/Wiadomość do grupy/)).toHaveValue("Cześć");

    wyslijWiadomosc.mockRejectedValue(new TypeError("Failed to fetch"));
    await act(async () => {
      fireEvent.click(glowny(container));
    });
    expect(screen.getByText("Nie udało się wysłać wiadomości").closest("[role='alert']")).toHaveTextContent(
      "Nie udało się wysłać wiadomości. Spróbuj ponownie.",
    );
  });

  it("pełna ostatnia strona: po wysłaniu ekran czyta stronę, na której wylądowała nowa wiadomość", async () => {
    wyslijWiadomosc.mockResolvedValue(WIADOMOSC_2);
    const pelna = Array.from({ length: 25 }, (_, i) => ({ ...WIADOMOSC_1, id: 200 + i }));
    const { container } = await otworzWatek(pelna, meta({ total: 25, per_page: 25 }));
    pobierzWiadomosci.mockClear();
    wpisz("Cześć");

    await act(async () => {
      fireEvent.click(glowny(container));
    });

    expect(pobierzWiadomosci).toHaveBeenCalledWith(5, 2);
  });
});

describe("Wątek grupowy — skład wątku", () => {
  async function otworz() {
    const wynik = await otworzWatek();
    return wynik;
  }

  it("bez numeru oba przyciski są nieaktywne i mówią, dlaczego; z numerem — aktywne", async () => {
    await otworz();

    for (const nazwa of ["Dodaj do wątku", "Usuń z wątku"]) {
      const przycisk = screen.getByRole("button", { name: nazwa });
      expect(przycisk).toBeDisabled();
      expect(przycisk).toHaveAccessibleDescription("Wpisz numer osoby: liczbę całkowitą większą od zera.");
    }
    fireEvent.change(screen.getByLabelText("Numer osoby"), { target: { value: "12" } });
    expect(screen.getByRole("button", { name: "Dodaj do wątku" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Usuń z wątku" })).toBeEnabled();

    fireEvent.change(screen.getByLabelText("Numer osoby"), { target: { value: "2.5" } });
    expect(screen.getByRole("button", { name: "Dodaj do wątku" })).toBeDisabled();
  });

  it("dodanie: żądanie z numerem osoby, potwierdzenie, pole puste", async () => {
    dodajOsobe.mockResolvedValue({});
    await otworz();
    fireEvent.change(screen.getByLabelText("Numer osoby"), { target: { value: "12" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Dodaj do wątku" }));
    });

    expect(dodajOsobe).toHaveBeenCalledTimes(1);
    expect(dodajOsobe).toHaveBeenCalledWith(5, 12);
    expect(screen.getByText("Osoba dodana do składu wątku.")).toBeInTheDocument();
    expect(screen.getByLabelText("Numer osoby")).toHaveValue(null);
  });

  it("usunięcie: jedno kliknięcie, bez pytania o potwierdzenie — tak jak na starym ekranie", async () => {
    usunOsobe.mockResolvedValue(null);
    await otworz();
    fireEvent.change(screen.getByLabelText("Numer osoby"), { target: { value: "12" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Usuń z wątku" }));
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(usunOsobe).toHaveBeenCalledTimes(1);
    expect(usunOsobe).toHaveBeenCalledWith(5, 12);
    expect(screen.getByText("Osoba usunięta ze składu wątku.")).toBeInTheDocument();
  });

  it("błędy: komunikat serwera (np. 409) albo zdanie zastępcze; numer zostaje", async () => {
    dodajOsobe.mockRejectedValue(blad(409, "volunteer_already_assigned", "Ta osoba jest już przypisana do innego prowadzącego."));
    await otworz();
    fireEvent.change(screen.getByLabelText("Numer osoby"), { target: { value: "12" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Dodaj do wątku" }));
    });
    expect(screen.getByText("Nie udało się zmienić składu").closest("[role='alert']")).toHaveTextContent(
      "Ta osoba jest już przypisana do innego prowadzącego.",
    );
    expect(screen.getByLabelText("Numer osoby")).toHaveValue(12);

    usunOsobe.mockRejectedValue(new TypeError("Failed to fetch"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Usuń z wątku" }));
    });
    expect(screen.getByText("Nie udało się zmienić składu").closest("[role='alert']")).toHaveTextContent(
      "Nie udało się usunąć osoby z wątku. Spróbuj ponownie.",
    );
  });
});
