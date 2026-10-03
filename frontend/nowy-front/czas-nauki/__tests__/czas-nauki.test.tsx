import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";
import { axeViolations } from "@/components/__tests__/axe-helper";

/**
 * Ekran „Czas nauki” (`GET /admin/reliability`, szczegóły
 * `GET /admin/reliability/{userId}`): każdy stan ma ten sam korzeń szablonu,
 * a w każdym sprawdzamy nagłówek, przycisk (czy jest i czy działa), zdanie
 * wyjaśniające oraz dostępne nazwy wszystkich odnośników i przycisków.
 * Widok osoby ma własne testy: dane z jednostkami „godz.” i „min”, błędy,
 * brak lekcji, „nie znaleziono osoby” i powrót do tej samej strony listy.
 * Widok osoby stoi w adresie tej samej strony (`?osoba=<numer>`): router
 * jest tu zastąpiony historią w pamięci (wpisy, bieżąca pozycja, „Wstecz”
 * i „Dalej” przeglądarki), z której czytają `useSearchParams`
 * i `usePathname` — tak sprawdzamy, że „Wstecz” wraca do listy.
 */

const apiPaged = vi.fn();
const api = vi.fn();
const push = vi.fn();
const replace = vi.fn();
const back = vi.fn();

const historia = vi.hoisted(() => {
  const BAZA = "/nowy-front/admin/czas-nauki";
  let wpisy: string[] = [BAZA];
  let indeks = 0;
  let opuszczono = 0;
  const sluchacze = new Set<() => void>();
  const powiadom = () => {
    for (const sluchacz of sluchacze) sluchacz();
  };
  return {
    BAZA,
    ustaw(adres: string) {
      wpisy = [adres];
      indeks = 0;
      opuszczono = 0;
      powiadom();
    },
    adres: () => wpisy[indeks],
    wpisy: () => [...wpisy],
    /** Ile razy „Wstecz” wyszło poza ten ekran (przed pierwszy wpis). */
    opuszczono: () => opuszczono,
    subskrybuj(sluchacz: () => void) {
      sluchacze.add(sluchacz);
      return () => {
        sluchacze.delete(sluchacz);
      };
    },
    push(adres: string) {
      wpisy = [...wpisy.slice(0, indeks + 1), adres];
      indeks += 1;
      powiadom();
    },
    replace(adres: string) {
      wpisy[indeks] = adres;
      powiadom();
    },
    wstecz() {
      if (indeks === 0) {
        opuszczono += 1;
        return;
      }
      indeks -= 1;
      powiadom();
    },
    dalej() {
      if (indeks >= wpisy.length - 1) return;
      indeks += 1;
      powiadom();
    },
  };
});

vi.mock("next/navigation", async () => {
  const { useMemo, useSyncExternalStore } = await import("react");
  const useAdres = () => useSyncExternalStore(historia.subskrybuj, historia.adres, historia.adres);
  return {
    useRouter: () => ({ push, back, replace, refresh: vi.fn() }),
    usePathname: () => useAdres().split("?")[0],
    useSearchParams: () => {
      const adres = useAdres();
      return useMemo(() => new URLSearchParams(adres.split("?")[1] ?? ""), [adres]);
    },
  };
});

vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return {
    ...oryginal,
    apiPaged: (...args: unknown[]) => apiPaged(...args),
    api: (...args: unknown[]) => api(...args),
  };
});

const { ApiError } = await import("@/lib/api/klient");
const { CzasNauki } = await import("../CzasNauki");
const { DostawcaRamki } = await import("@/design-system/szablony/KontekstRamki");

const ADRES_LISTY = "/admin/reliability?page=1&per_page=25";
const BAZA = historia.BAZA;

function osoba(id: number, nadpisania: Record<string, unknown> = {}) {
  return {
    id,
    first_name: "Marta",
    last_name: `Demo${id}`,
    email: `osoba${id}@demo.pl`,
    reliability_percent: "85",
    below_threshold: false,
    ...nadpisania,
  };
}

function lekcja(id: number, nadpisania: Record<string, unknown> = {}) {
  return {
    id,
    title: `Wprowadzenie do wywiadu ${id}`,
    active_seconds: 270,
    duration_seconds: 1800,
    open_count: 2,
    last_activity_at: "2026-10-03T12:30:00Z",
    below_threshold: true,
    ...nadpisania,
  };
}

function szczegoly(id: number, lekcje: unknown[]) {
  return { ...osoba(id), lessons: lekcje };
}

function odpowiedz(dane: unknown[], meta: Record<string, unknown> = {}) {
  return { data: dane, meta: { current_page: 1, per_page: 25, total: dane.length, last_page: 1, ...meta } };
}

function odmowa(status: number) {
  return new ApiError({ status, code: status === 401 ? "unauthenticated" : "forbidden", message: "Odmowa." });
}

function bladSerwera() {
  return new ApiError({ status: 500, code: "server_error", message: "Coś poszło nie tak. Spróbuj ponownie za chwilę." });
}

function nieznanaOsoba() {
  return new ApiError({ status: 404, code: "not_found", message: "Nie znaleziono osoby." });
}

/** Odczyt konta (dla ekranu odmowy) i szczegóły osoby wołane przez `api`. */
function ustawApi(szczegolyOsoby: (sciezka: string) => Promise<unknown> = () => new Promise(() => {})) {
  api.mockImplementation((sciezka: string) =>
    sciezka === "/me" ? Promise.resolve({ first_name: "Ola", role: "project_manager" }) : szczegolyOsoby(sciezka),
  );
}

function sprawdzSzablon(container: HTMLElement) {
  expect(() => jedenMain(container)).not.toThrow();
  expect(container.querySelector("main")?.getAttribute("data-style-id")).toBe("szablon-lista");
}

function przyciskiGlowne(container: HTMLElement): number {
  return container.querySelectorAll("button[class*='primary']").length;
}

function nazwa(element: Element): string {
  return element.getAttribute("aria-label") ?? element.textContent?.trim() ?? "";
}

const nazwyPrzyciskow = () => screen.queryAllByRole("button").map(nazwa);
const nazwyOdnosnikow = () => screen.queryAllByRole("link").map(nazwa);
const tekst = (container: HTMLElement) => container.textContent ?? "";

function wywolaniaSzczegolow(): string[] {
  return api.mock.calls.map(([sciezka]) => String(sciezka)).filter((sciezka) => sciezka.startsWith("/admin/reliability/"));
}

beforeEach(() => {
  apiPaged.mockReset();
  api.mockReset();
  historia.ustaw(BAZA);
  push.mockReset().mockImplementation((adres: string) => historia.push(adres));
  replace.mockReset().mockImplementation((adres: string) => historia.replace(adres));
  back.mockReset().mockImplementation(() => historia.wstecz());
  ustawApi();
});

describe("Czas nauki — stany listy", () => {
  it("ładowanie: szkielet w szablonie, nagłówek strony, zero wierszy", () => {
    apiPaged.mockReturnValue(new Promise(() => {}));
    const { container } = render(<CzasNauki />);

    sprawdzSzablon(container);
    expect(screen.getByRole("heading", { level: 1, name: "Czas nauki" })).toBeInTheDocument();
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    expect(nazwyPrzyciskow()).toEqual(["Wstecz"]);
    expect(nazwyOdnosnikow()).toEqual([]);
    expect(przyciskiGlowne(container)).toBe(0);
    expect(tekst(container)).toContain("Osoby od najniższej rzetelności.");
  });

  it("błąd odpowiedzi serwera: tytuł, zdanie serwera (jak na starym ekranie), przycisk „Spróbuj ponownie” i ponowny odczyt", async () => {
    apiPaged.mockRejectedValueOnce(bladSerwera()).mockResolvedValue(odpowiedz([osoba(17)]));
    const { container } = render(<CzasNauki />);

    expect(await screen.findByRole("heading", { level: 3, name: "Nie udało się wczytać listy" })).toBeInTheDocument();
    sprawdzSzablon(container);
    expect(screen.getByRole("alert")).toHaveTextContent("Coś poszło nie tak. Spróbuj ponownie za chwilę.");
    expect(screen.getByRole("alert")).not.toHaveTextContent("Serwer nie odpowiedział poprawnie.");
    expect(screen.queryByRole("table")).toBeNull();
    expect(nazwyPrzyciskow()).toEqual(["Wstecz", "Spróbuj ponownie"]);
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeEnabled();
    expect(przyciskiGlowne(container)).toBe(0);

    await userEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    await screen.findByText("Marta Demo17");
    expect(apiPaged).toHaveBeenCalledTimes(2);
    expect(apiPaged).toHaveBeenLastCalledWith(ADRES_LISTY);
  });

  it("błąd odpowiedzi serwera bez zdania: zdanie zastępcze ekranu", async () => {
    apiPaged.mockRejectedValue(new ApiError({ status: 502, code: "bad_gateway", message: "" }));
    render(<CzasNauki />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Serwer nie odpowiedział poprawnie. Spróbuj ponownie za chwilę.");
  });

  it("brak połączenia: osobny tytuł i zdanie o internecie", async () => {
    apiPaged.mockRejectedValue(new TypeError("Failed to fetch"));
    const { container } = render(<CzasNauki />);

    expect(await screen.findByRole("heading", { level: 3, name: "Brak połączenia z serwerem" })).toBeInTheDocument();
    sprawdzSzablon(container);
    expect(screen.getByRole("alert")).toHaveTextContent("Sprawdź połączenie z internetem i spróbuj jeszcze raz.");
    expect(nazwyPrzyciskow()).toEqual(["Wstecz", "Spróbuj ponownie"]);
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeEnabled();
  });

  it.each([401, 403])("brak dostępu (%i): wspólny ekran odmowy z jednym przyciskiem „Wróć”, zero rekordów", async (status) => {
    apiPaged.mockRejectedValue(odmowa(status));
    const { container } = render(<CzasNauki />);

    expect(await screen.findByRole("heading", { level: 2, name: "Nie masz dostępu do tego ekranu" })).toBeInTheDocument();
    sprawdzSzablon(container);
    await waitFor(() => expect(tekst(container)).toContain("Twoja rola: Opiekun Projektu."));
    expect(tekst(container)).toContain("Ten ekran jest dla administracji.");
    expect(screen.queryByRole("table")).toBeNull();
    expect(nazwyPrzyciskow()).toEqual(["Wstecz", "Wróć"]);
    expect(nazwyOdnosnikow()).toEqual([]);
    expect(przyciskiGlowne(container)).toBe(0);
    expect(screen.getByRole("button", { name: "Wróć" })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Wróć" }));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("pusta lista: nagłówek, zdanie z „rokiem programu” i przycisk ponownego wczytania", async () => {
    apiPaged.mockResolvedValue(odpowiedz([]));
    const { container } = render(<CzasNauki />);

    expect(await screen.findByRole("heading", { level: 2, name: "Brak osób z danymi do wyświetlenia" })).toBeInTheDocument();
    sprawdzSzablon(container);
    expect(tekst(container)).toContain("Dane pojawią się, gdy osoby zaczną kończyć lekcje w bieżącym roku programu.");
    expect(tekst(container)).toContain("Razem: 0 osób.");
    expect(tekst(container)).not.toMatch(/edycj/i);
    expect(screen.queryByRole("table")).toBeNull();
    expect(nazwyPrzyciskow()).toEqual(["Wstecz", "Wczytaj listę ponownie"]);
    expect(screen.getByRole("button", { name: "Wczytaj listę ponownie" })).toBeEnabled();
    expect(przyciskiGlowne(container)).toBe(0);
  });

  it("lista: nazwa jako odnośnik do karty osoby, e-mail pod nią, rzetelność i stan słowami, przycisk „Szczegóły” przy osobie", async () => {
    apiPaged.mockResolvedValue(
      odpowiedz(
        [
          osoba(17, { reliability_percent: "15", below_threshold: true }),
          osoba(18),
          osoba(19, { reliability_percent: "85.5" }),
          osoba(20, { reliability_percent: null }),
        ],
        { total: 4 },
      ),
    );
    const { container } = render(<CzasNauki />);

    await screen.findByText("Marta Demo17");
    sprawdzSzablon(container);
    expect(screen.getByRole("table", { name: "Lista osób" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Lista osób" })).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map((naglowek) => naglowek.textContent)).toEqual([
      "Osoba",
      "Rzetelność",
      "Stan",
      "Akcje",
    ]);
    expect(screen.getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Marta Demo17", "/admin/uczestniczki/17"],
      ["Marta Demo18", "/admin/uczestniczki/18"],
      ["Marta Demo19", "/admin/uczestniczki/19"],
      ["Marta Demo20", "/admin/uczestniczki/20"],
    ]);

    const wiersze = Array.from(container.querySelectorAll<HTMLElement>('[role="row"][data-wiersz]'));
    expect(wiersze[0]).toHaveTextContent("osoba17@demo.pl");
    expect(wiersze[0]).toHaveTextContent("15%");
    expect(wiersze[0]).toHaveTextContent("poniżej progu");
    expect(wiersze[1]).toHaveTextContent("85%");
    expect(wiersze[1]).toHaveTextContent("w normie");
    expect(wiersze[2]).toHaveTextContent("85,5%");
    expect(wiersze[3]).toHaveTextContent("brak danych");
    expect(wiersze[3]).not.toHaveTextContent(/%/);
    expect(tekst(container)).toContain("Razem: 4 osoby.");
    expect(tekst(container)).not.toMatch(/\bnull\b|undefined/);

    expect(nazwyPrzyciskow()).toEqual([
      "Wstecz",
      "Szczegóły czasu nauki: Marta Demo17",
      "Szczegóły czasu nauki: Marta Demo18",
      "Szczegóły czasu nauki: Marta Demo19",
      "Szczegóły czasu nauki: Marta Demo20",
    ]);
    expect(przyciskiGlowne(container)).toBe(0);
    expect(apiPaged).toHaveBeenCalledTimes(1);
    expect(apiPaged).toHaveBeenCalledWith(ADRES_LISTY);
  });

  it("licznik w nagłówku odmienia „osoba” po liczbie", async () => {
    for (const [liczba, zdanie] of [
      [1, "Razem: 1 osoba."],
      [3, "Razem: 3 osoby."],
      [5, "Razem: 5 osób."],
      [14, "Razem: 14 osób."],
      [22, "Razem: 22 osoby."],
    ] as const) {
      apiPaged.mockResolvedValue(odpowiedz([osoba(17)], { total: liczba }));
      const { container, unmount } = render(<CzasNauki />);
      await screen.findByText("Marta Demo17");
      expect(tekst(container)).toContain(zdanie);
      unmount();
    }
  });

  it("kilka stron: „Strona 1 z 3”, „Poprzednia” wyłączona, „Następna” prosi o drugą stronę", async () => {
    apiPaged.mockResolvedValue(odpowiedz([osoba(17)], { total: 60, last_page: 3 }));
    render(<CzasNauki />);

    await screen.findByText("Marta Demo17");
    const stronicowanie = screen.getByRole("navigation", { name: "Stronicowanie" });
    expect(within(stronicowanie).getByText("Strona 1 z 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Poprzednia" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Następna" })).toBeEnabled();

    apiPaged.mockResolvedValue(odpowiedz([osoba(18)], { total: 60, last_page: 3, current_page: 2 }));
    await userEvent.click(screen.getByRole("button", { name: "Następna" }));
    await screen.findByText("Marta Demo18");
    expect(apiPaged).toHaveBeenLastCalledWith("/admin/reliability?page=2&per_page=25");
    expect(screen.getByText("Strona 2 z 3")).toBeInTheDocument();
  });

  it("jedna strona: stronicowania nie ma", async () => {
    apiPaged.mockResolvedValue(odpowiedz([osoba(17)]));
    render(<CzasNauki />);
    await screen.findByText("Marta Demo17");
    expect(screen.queryByRole("navigation", { name: "Stronicowanie" })).toBeNull();
  });

  it("filtra nie ma: trasa listy nie przyjmuje żadnych parametrów poza stroną", async () => {
    apiPaged.mockResolvedValue(odpowiedz([osoba(17)]));
    render(<CzasNauki />);
    await screen.findByText("Marta Demo17");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.queryByRole("button", { name: /Filtruj|Wyczyść filtr/ })).toBeNull();
  });
});

describe("Czas nauki — widok osoby", () => {
  async function otworzOsobe(id = 17, nadpisania: Record<string, unknown> = {}) {
    apiPaged.mockResolvedValue(odpowiedz([osoba(id, nadpisania)], { total: 1 }));
    const wynik = render(<CzasNauki />);
    await screen.findByText(`Marta Demo${id}`);
    const przycisk = screen.getByRole("button", { name: `Szczegóły czasu nauki: Marta Demo${id}` });
    await userEvent.click(przycisk);
    return { ...wynik, przycisk };
  }

  it("ładowanie szczegółów: nagłówek osoby z fokusem, szkielet, przycisk powrotu i odnośnik do karty", async () => {
    const { container } = await otworzOsobe(17, { reliability_percent: "15", below_threshold: true });

    sprawdzSzablon(container);
    const naglowek = screen.getByRole("heading", { level: 1, name: "Marta Demo17" });
    expect(document.activeElement).toBe(naglowek);
    expect(tekst(container)).toContain("osoba17@demo.pl. Rzetelność: 15%.");
    expect(tekst(container)).toContain("poniżej progu");
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    expect(nazwyPrzyciskow()).toEqual(["Wróć do listy"]);
    expect(screen.getByRole("button", { name: "Wróć do listy" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Otwórz kartę osoby" })).toHaveAttribute("href", "/admin/uczestniczki/17");
    expect(przyciskiGlowne(container)).toBe(0);
    expect(wywolaniaSzczegolow()).toEqual(["/admin/reliability/17"]);
  });

  it("dane: lekcje z czasem w „godz.” i „min”, liczbą otwarć, datą po polsku i stanem słowami", async () => {
    ustawApi(() =>
      Promise.resolve(
        szczegoly(17, [
          lekcja(21),
          lekcja(22, { active_seconds: 5400, duration_seconds: 7200, open_count: 1, below_threshold: false, last_activity_at: null }),
          lekcja(23, { active_seconds: 4500, duration_seconds: 3600 }),
        ]),
      ),
    );
    const { container } = await otworzOsobe();

    expect(await screen.findByRole("table", { name: "Ukończone lekcje" })).toBeInTheDocument();
    sprawdzSzablon(container);
    expect(screen.getByRole("heading", { level: 2, name: "Ukończone lekcje" })).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map((naglowek) => naglowek.textContent)).toEqual([
      "Lekcja",
      "Czas aktywny",
      "Czas lekcji",
      "Liczba otwarć",
      "Ostatnia aktywność",
      "Stan",
    ]);
    const [pierwsza, druga, trzecia] = Array.from(container.querySelectorAll<HTMLElement>('[role="row"][data-wiersz]'));
    expect(pierwsza).toHaveTextContent("Wprowadzenie do wywiadu 21");
    expect(pierwsza).toHaveTextContent("Czas aktywny5 min");
    expect(pierwsza).toHaveTextContent("Czas lekcji30 min");
    expect(pierwsza).toHaveTextContent("Liczba otwarć2");
    expect(pierwsza).toHaveTextContent("Ostatnia aktywność3 października 2026, 14:30");
    expect(pierwsza).toHaveTextContent("poniżej progu");
    expect(druga).toHaveTextContent("Czas aktywny1 godz. 30 min");
    expect(druga).toHaveTextContent("Czas lekcji2 godz.");
    expect(druga).toHaveTextContent("Ostatnia aktywnośćbrak danych");
    expect(druga).toHaveTextContent("w normie");
    expect(trzecia).toHaveTextContent("Czas aktywny1 godz. 15 min");
    expect(trzecia).toHaveTextContent("Czas lekcji1 godz.");
    // Ani sekund, ani technicznego zapisu daty.
    expect(tekst(container)).not.toMatch(/\d\s?s\b|2026-10-03T/);
    expect(nazwyPrzyciskow()).toEqual(["Wróć do listy"]);
    expect(nazwyOdnosnikow()).toEqual(["Otwórz kartę osoby"]);
  });

  it("osoba bez wyniku: w nagłówku „brak danych”, bez znaku procentu", async () => {
    ustawApi(() => Promise.resolve(szczegoly(17, [])));
    const { container } = await otworzOsobe(17, { reliability_percent: null });

    expect(await screen.findByRole("heading", { level: 2, name: "Brak ukończonych lekcji z pomiarem czasu" })).toBeInTheDocument();
    expect(tekst(container)).toContain("osoba17@demo.pl. Rzetelność: brak danych.");
    expect(tekst(container)).not.toContain("%");
  });

  it("bez lekcji: nagłówek, zdanie wyjaśniające i przycisk powrotu do listy", async () => {
    ustawApi(() => Promise.resolve(szczegoly(17, [])));
    const { container } = await otworzOsobe();

    expect(await screen.findByRole("heading", { level: 2, name: "Brak ukończonych lekcji z pomiarem czasu" })).toBeInTheDocument();
    sprawdzSzablon(container);
    expect(tekst(container)).toContain("Czas nauki pojawi się tu, gdy osoba ukończy lekcję z nagraniem.");
    expect(screen.queryByRole("table")).toBeNull();
    expect(nazwyPrzyciskow()).toEqual(["Wróć do listy", "Wróć do listy"]);
    expect(przyciskiGlowne(container)).toBe(0);
  });

  it("błąd szczegółów: zdanie serwera, przycisk „Spróbuj ponownie” i ponowny odczyt tej samej osoby", async () => {
    let proba = 0;
    ustawApi(() => (++proba === 1 ? Promise.reject(bladSerwera()) : Promise.resolve(szczegoly(17, [lekcja(21)]))));
    const { container } = await otworzOsobe();

    expect(await screen.findByRole("heading", { level: 3, name: "Nie udało się wczytać szczegółów osoby" })).toBeInTheDocument();
    sprawdzSzablon(container);
    expect(screen.getByRole("alert")).toHaveTextContent("Coś poszło nie tak. Spróbuj ponownie za chwilę.");
    expect(nazwyPrzyciskow()).toEqual(["Wróć do listy", "Spróbuj ponownie"]);
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    await screen.findByText("Wprowadzenie do wywiadu 21");
    expect(wywolaniaSzczegolow()).toEqual(["/admin/reliability/17", "/admin/reliability/17"]);
  });

  it("brak połączenia przy szczegółach: zdanie o internecie i ponowienie", async () => {
    ustawApi(() => Promise.reject(new TypeError("Failed to fetch")));
    await otworzOsobe();

    expect(await screen.findByRole("heading", { level: 3, name: "Brak połączenia z serwerem" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Sprawdź połączenie z internetem i spróbuj jeszcze raz.");
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeEnabled();
  });

  it("nie znaleziono osoby: wspólny ekran „nie znaleziono”, jeden przycisk powrotu", async () => {
    ustawApi(() => Promise.reject(nieznanaOsoba()));
    const { container } = await otworzOsobe();

    expect(await screen.findByRole("heading", { level: 2, name: "Nie znaleziono osoby" })).toBeInTheDocument();
    sprawdzSzablon(container);
    expect(tekst(container)).toContain("Osoby nie ma na liście albo nie należy do bieżącego roku programu.");
    expect(screen.queryByRole("table")).toBeNull();
    expect(nazwyPrzyciskow()).toEqual(["Wróć do listy", "Wróć do listy"]);
    for (const przycisk of screen.getAllByRole("button", { name: "Wróć do listy" })) expect(przycisk).toBeEnabled();
    expect(przyciskiGlowne(container)).toBe(0);

    await userEvent.click(screen.getAllByRole("button", { name: "Wróć do listy" })[1]);
    expect(screen.getByRole("heading", { level: 1, name: "Czas nauki" })).toBeInTheDocument();
  });

  it("brak dostępu do szczegółów: wspólny ekran odmowy z przyciskiem powrotu do listy", async () => {
    ustawApi((sciezka) => Promise.reject(sciezka.startsWith("/admin/reliability/") ? odmowa(403) : new Error("x")));
    const { container } = await otworzOsobe();

    expect(await screen.findByRole("heading", { level: 2, name: "Nie masz dostępu do tego ekranu" })).toBeInTheDocument();
    sprawdzSzablon(container);
    expect(tekst(container)).toContain("Ten ekran jest dla administracji.");
    expect(screen.queryByRole("table")).toBeNull();
    expect(nazwyPrzyciskow()).toEqual(["Wróć do listy", "Wróć do listy"]);
  });

  it("powrót wraca na tę samą stronę listy bez nowego odczytu listy, a fokus na przycisk, który widok otworzył", async () => {
    ustawApi(() => Promise.resolve(szczegoly(18, [lekcja(21)])));
    apiPaged.mockResolvedValueOnce(odpowiedz([osoba(17)], { total: 60, last_page: 3 }));
    render(<CzasNauki />);
    await screen.findByText("Marta Demo17");
    apiPaged.mockResolvedValueOnce(odpowiedz([osoba(18)], { total: 60, last_page: 3, current_page: 2 }));
    await userEvent.click(screen.getByRole("button", { name: "Następna" }));
    await screen.findByText("Marta Demo18");
    expect(apiPaged).toHaveBeenCalledTimes(2);

    const przycisk = screen.getByRole("button", { name: "Szczegóły czasu nauki: Marta Demo18" });
    await userEvent.click(przycisk);
    await screen.findByText("Wprowadzenie do wywiadu 21");
    await userEvent.click(screen.getByRole("button", { name: "Wróć do listy" }));

    expect(screen.getByRole("heading", { level: 1, name: "Czas nauki" })).toBeInTheDocument();
    expect(screen.getByText("Strona 2 z 3")).toBeInTheDocument();
    expect(screen.getByText("Marta Demo18")).toBeInTheDocument();
    expect(apiPaged).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Szczegóły czasu nauki: Marta Demo18" }));
  });

  it("ponowne otwarcie tej samej osoby bierze szczegóły z pamięci ekranu, bez nowego żądania", async () => {
    ustawApi(() => Promise.resolve(szczegoly(17, [lekcja(21)])));
    await otworzOsobe();
    await screen.findByText("Wprowadzenie do wywiadu 21");

    await userEvent.click(screen.getByRole("button", { name: "Wróć do listy" }));
    await userEvent.click(screen.getByRole("button", { name: "Szczegóły czasu nauki: Marta Demo17" }));

    expect(await screen.findByText("Wprowadzenie do wywiadu 21")).toBeInTheDocument();
    expect(wywolaniaSzczegolow()).toEqual(["/admin/reliability/17"]);
  });

  it("w nowej ramce panelu (nagłówek bez przycisku powrotu) przycisk „Wróć do listy” stoi w treści, dokładnie raz", async () => {
    ustawApi(() => Promise.resolve(szczegoly(17, [lekcja(21)])));
    apiPaged.mockResolvedValue(odpowiedz([osoba(17)], { total: 1 }));
    render(
      <DostawcaRamki>
        <CzasNauki />
      </DostawcaRamki>,
    );
    await screen.findByText("Marta Demo17");
    await userEvent.click(screen.getByRole("button", { name: "Szczegóły czasu nauki: Marta Demo17" }));
    await screen.findByText("Wprowadzenie do wywiadu 21");

    expect(screen.getAllByRole("button", { name: "Wróć do listy" })).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Wróć do listy" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Czas nauki/);
  });
});

describe("Czas nauki — widok osoby w adresie strony (?osoba=<numer>)", () => {
  it("„Szczegóły” dopisuje ?osoba=<numer> do adresu tej samej strony jako nowy wpis historii", async () => {
    apiPaged.mockResolvedValue(odpowiedz([osoba(17)]));
    render(<CzasNauki />);
    await screen.findByText("Marta Demo17");

    await userEvent.click(screen.getByRole("button", { name: "Szczegóły czasu nauki: Marta Demo17" }));

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(`${BAZA}?osoba=17`);
    expect(historia.wpisy()).toEqual([BAZA, `${BAZA}?osoba=17`]);
    expect(screen.getByRole("heading", { level: 1, name: "Marta Demo17" })).toBeInTheDocument();
  });

  it("„Wstecz” przeglądarki z widoku osoby wraca do listy na tej samej stronie, bez nowego odczytu listy, z fokusem na „Szczegóły” tej osoby", async () => {
    ustawApi(() => Promise.resolve(szczegoly(18, [lekcja(21)])));
    apiPaged.mockResolvedValueOnce(odpowiedz([osoba(17)], { total: 60, last_page: 3 }));
    render(<CzasNauki />);
    await screen.findByText("Marta Demo17");
    apiPaged.mockResolvedValueOnce(odpowiedz([osoba(18)], { total: 60, last_page: 3, current_page: 2 }));
    await userEvent.click(screen.getByRole("button", { name: "Następna" }));
    await screen.findByText("Marta Demo18");
    await userEvent.click(screen.getByRole("button", { name: "Szczegóły czasu nauki: Marta Demo18" }));
    await screen.findByText("Wprowadzenie do wywiadu 21");

    act(() => historia.wstecz());

    expect(historia.adres()).toBe(BAZA);
    expect(historia.opuszczono()).toBe(0);
    expect(screen.getByRole("heading", { level: 1, name: "Czas nauki" })).toBeInTheDocument();
    expect(screen.getByText("Strona 2 z 3")).toBeInTheDocument();
    expect(screen.getByText("Marta Demo18")).toBeInTheDocument();
    expect(apiPaged).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Szczegóły czasu nauki: Marta Demo18" }));
  });

  it("„Dalej” przeglądarki po „Wstecz” otwiera ten sam widok osoby z pamięci ekranu, bez nowego żądania", async () => {
    ustawApi(() => Promise.resolve(szczegoly(17, [lekcja(21)])));
    apiPaged.mockResolvedValue(odpowiedz([osoba(17)]));
    render(<CzasNauki />);
    await screen.findByText("Marta Demo17");
    await userEvent.click(screen.getByRole("button", { name: "Szczegóły czasu nauki: Marta Demo17" }));
    await screen.findByText("Wprowadzenie do wywiadu 21");

    act(() => historia.wstecz());
    act(() => historia.dalej());

    const naglowek = screen.getByRole("heading", { level: 1, name: "Marta Demo17" });
    expect(document.activeElement).toBe(naglowek);
    expect(screen.getByText("Wprowadzenie do wywiadu 21")).toBeInTheDocument();
    expect(wywolaniaSzczegolow()).toEqual(["/admin/reliability/17"]);
    expect(apiPaged).toHaveBeenCalledTimes(1);
  });

  it("„Wróć do listy” po otwarciu z listy zdejmuje wpis osoby, więc następne „Wstecz” opuszcza ekran zamiast wracać do osoby", async () => {
    ustawApi(() => Promise.resolve(szczegoly(17, [lekcja(21)])));
    apiPaged.mockResolvedValue(odpowiedz([osoba(17)]));
    render(<CzasNauki />);
    await screen.findByText("Marta Demo17");
    await userEvent.click(screen.getByRole("button", { name: "Szczegóły czasu nauki: Marta Demo17" }));
    await screen.findByText("Wprowadzenie do wywiadu 21");

    await userEvent.click(screen.getByRole("button", { name: "Wróć do listy" }));
    expect(back).toHaveBeenCalledTimes(1);
    expect(historia.adres()).toBe(BAZA);
    expect(screen.getByRole("heading", { level: 1, name: "Czas nauki" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Wstecz" }));
    expect(historia.opuszczono()).toBe(1);
  });

  it("wejście wprost z ?osoba=17: nagłówek i rzetelność z odpowiedzi szczegółów, lekcje; „Wróć do listy” przechodzi do listy nowym wpisem", async () => {
    historia.ustaw(`${BAZA}?osoba=17`);
    ustawApi(() => Promise.resolve(szczegoly(17, [lekcja(21)])));
    apiPaged.mockResolvedValue(odpowiedz([osoba(30)]));
    const { container } = render(<CzasNauki />);

    expect(await screen.findByRole("heading", { level: 1, name: "Marta Demo17" })).toBeInTheDocument();
    await screen.findByText("Wprowadzenie do wywiadu 21");
    sprawdzSzablon(container);
    expect(tekst(container)).toContain("osoba17@demo.pl. Rzetelność: 85%.");
    expect(tekst(container)).toContain("w normie");
    expect(screen.getByRole("link", { name: "Otwórz kartę osoby" })).toHaveAttribute("href", "/admin/uczestniczki/17");
    expect(wywolaniaSzczegolow()).toEqual(["/admin/reliability/17"]);

    await userEvent.click(screen.getByRole("button", { name: "Wróć do listy" }));
    expect(back).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith(BAZA);
    expect(historia.wpisy()).toEqual([`${BAZA}?osoba=17`, BAZA]);
    expect(await screen.findByText("Marta Demo30")).toBeInTheDocument();
  });

  it("wejście wprost, zanim przyjdą szczegóły: nagłówek „Czas nauki osoby”, szkielet, przycisk powrotu i odnośnik do karty", async () => {
    historia.ustaw(`${BAZA}?osoba=17`);
    apiPaged.mockResolvedValue(odpowiedz([osoba(30)]));
    const { container } = render(<CzasNauki />);
    await waitFor(() => expect(apiPaged).toHaveBeenCalledTimes(1));

    sprawdzSzablon(container);
    expect(screen.getByRole("heading", { level: 1, name: "Czas nauki osoby" })).toBeInTheDocument();
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(nazwyPrzyciskow()).toEqual(["Wróć do listy"]);
    expect(screen.getByRole("link", { name: "Otwórz kartę osoby" })).toHaveAttribute("href", "/admin/uczestniczki/17");
    expect(tekst(container)).not.toMatch(/\bnull\b|undefined|NaN/);
  });

  it("wejście wprost z nieznaną osobą: wspólny ekran „nie znaleziono”", async () => {
    historia.ustaw(`${BAZA}?osoba=999`);
    ustawApi(() => Promise.reject(nieznanaOsoba()));
    apiPaged.mockResolvedValue(odpowiedz([osoba(17)]));
    const { container } = render(<CzasNauki />);

    expect(await screen.findByRole("heading", { level: 2, name: "Nie znaleziono osoby" })).toBeInTheDocument();
    sprawdzSzablon(container);
    expect(screen.getByRole("heading", { level: 1, name: "Czas nauki osoby" })).toBeInTheDocument();
    expect(wywolaniaSzczegolow()).toEqual(["/admin/reliability/999"]);
  });

  it.each(["abc", "0", "-3", "1.5"])("parametr ?osoba=%s, który nie jest numerem osoby, pokazuje listę bez żądania szczegółów", async (wartosc) => {
    historia.ustaw(`${BAZA}?osoba=${wartosc}`);
    apiPaged.mockResolvedValue(odpowiedz([osoba(17)]));
    render(<CzasNauki />);

    await screen.findByText("Marta Demo17");
    expect(screen.getByRole("heading", { level: 1, name: "Czas nauki" })).toBeInTheDocument();
    expect(wywolaniaSzczegolow()).toEqual([]);
  });
});

describe("Czas nauki — automatyczna kontrola dostępności", () => {
  it("lista i widok osoby z lekcjami nie mają naruszeń axe", async () => {
    ustawApi(() => Promise.resolve(szczegoly(17, [lekcja(21), lekcja(22, { last_activity_at: null, below_threshold: false })])));
    apiPaged.mockResolvedValue(odpowiedz([osoba(17), osoba(18, { reliability_percent: null })], { total: 2, last_page: 2 }));
    const { container } = render(<CzasNauki />);
    await screen.findByText("Marta Demo17");
    expect((await axeViolations(container)).map((naruszenie) => naruszenie.id)).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "Szczegóły czasu nauki: Marta Demo17" }));
    await screen.findByText("Wprowadzenie do wywiadu 21");
    expect((await axeViolations(container)).map((naruszenie) => naruszenie.id)).toEqual([]);
  });

  it("widok osoby bez znalezienia osoby nie ma naruszeń axe", async () => {
    ustawApi(() => Promise.reject(nieznanaOsoba()));
    apiPaged.mockResolvedValue(odpowiedz([osoba(17)]));
    const { container } = render(<CzasNauki />);
    await screen.findByText("Marta Demo17");
    await userEvent.click(screen.getByRole("button", { name: "Szczegóły czasu nauki: Marta Demo17" }));
    await screen.findByRole("heading", { level: 2, name: "Nie znaleziono osoby" });

    expect((await axeViolations(container)).map((naruszenie) => naruszenie.id)).toEqual([]);
  });
});
