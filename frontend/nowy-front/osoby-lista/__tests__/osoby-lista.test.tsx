import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";
import { Button } from "@/design-system/atomy/Button/Button";

/**
 * Ekran listy osób w administracji (`GET /admin/users`, eksport
 * `GET /admin/users/export.csv`): każdy stan ma ten sam korzeń szablonu
 * (jeden `main`, `data-style-id`), filtr i stronicowanie biegną do zapytania,
 * eksport niesie bieżący filtr, odmowa roli i błąd sieci nie pokazują rekordów.
 */

const apiPaged = vi.fn();
const downloadFile = vi.fn();
const push = vi.fn();
const back = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, back, refresh: vi.fn(), replace: vi.fn() }),
}));

// Ekran bierze klienta z `@/lib/api/klient`; beczkę `@/lib/api` podmieniamy zapobiegawczo, żeby przyszły import z beczki nie poszedł do prawdziwego transportu.
vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  apiPaged: (...args: unknown[]) => apiPaged(...args),
}));

vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return { ...oryginal, apiPaged: (...args: unknown[]) => apiPaged(...args) };
});

vi.mock("@/lib/api/pliki", () => ({
  downloadFile: (...args: unknown[]) => downloadFile(...args),
}));

const { ApiError } = await import("@/lib/api/klient");
const { OsobyLista } = await import("../OsobyLista");

function osoba(id: number, nadpisania: Record<string, unknown> = {}) {
  return {
    id,
    first_name: "Marta",
    last_name: `Demo${id}`,
    email: `osoba${id}@demo.pl`,
    role: "volunteer",
    status: "active",
    product_group: "psychon",
    access_expires_at: "2027-02-01T00:00:00Z",
    program_completed_at: null,
    created_at: "2026-09-20T10:00:00Z",
    supervisor: null,
    ...nadpisania,
  };
}

function odpowiedz(dane: unknown[], meta: Record<string, unknown> = {}) {
  return { data: dane, meta: { current_page: 1, per_page: 25, total: dane.length, last_page: 1, ...meta } };
}

function odmowa(status: number) {
  return new ApiError({ status, code: status === 401 ? "unauthenticated" : "forbidden", message: "Odmowa." });
}

function sprawdzSzablon(container: HTMLElement) {
  expect(() => jedenMain(container)).not.toThrow();
  expect(container.querySelector("main")?.getAttribute("data-style-id")).toBe("szablon-lista");
}

function przyciskiGlowne(container: HTMLElement): number {
  return container.querySelectorAll("button[class*='primary']").length;
}

const ADRES_LISTY = "/admin/users?page=1&per_page=25";

/** Komórka wiersza pod nagłówkiem kolumny o podanej nazwie. */
function komorka(wiersz: HTMLElement, kolumna: string): HTMLElement {
  const naglowki = within(screen.getByRole("table", { name: "Lista osób" })).getAllByRole("columnheader");
  const indeks = naglowki.findIndex((naglowek) => naglowek.textContent === kolumna);
  expect(indeks, `kolumna „${kolumna}”`).toBeGreaterThanOrEqual(0);
  return within(wiersz).getAllByRole("cell")[indeks];
}

beforeEach(() => {
  apiPaged.mockReset();
  downloadFile.mockReset();
  push.mockReset();
  back.mockReset();
});

describe("Osoby — stany", () => {
  it("ładowanie: szkielet w szablonie, zero wierszy i brak przycisku tabeli", () => {
    apiPaged.mockReturnValue(new Promise(() => {}));
    const { container } = render(<OsobyLista />);

    sprawdzSzablon(container);
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(screen.queryByRole("link", { name: /^Otwórz kartę: / })).toBeNull();
    expect(screen.queryByRole("button", { name: "Pobierz tabelę (Excel)" })).toBeNull();
  });

  it("dane: wiersze z rolą po polsku, stanem konta i odnośnikiem do karty", async () => {
    apiPaged.mockResolvedValue(
      odpowiedz(
        [
          osoba(17, { supervisor: { id: 5, name: "Joanna Demo" } }),
          osoba(18, { role: "instructor", status: "blocked" }),
        ],
        { total: 2 },
      ),
    );
    const { container } = render(<OsobyLista />);

    await screen.findByText("Marta Demo17");
    sprawdzSzablon(container);

    const odnosniki = screen.getAllByRole("link", { name: /^Otwórz kartę: / });
    expect(odnosniki.map((a) => a.getAttribute("href"))).toEqual([
      "/admin/uczestniczki/17",
      "/admin/uczestniczki/18",
    ]);
    const tabela = screen.getByRole("table", { name: "Lista osób" });
    expect(within(tabela).getAllByRole("columnheader").map((naglowek) => naglowek.textContent)).toEqual([
      "Osoba",
      "Rola",
      "Prowadzący",
      "Stan",
      "Akcja",
    ]);
    const [pierwszy, drugi] = Array.from(tabela.querySelectorAll<HTMLElement>('[role="row"][data-wiersz]'));
    expect(komorka(pierwszy, "Osoba")).toHaveTextContent(/^Marta Demo17osoba17@demo\.pl$/);
    expect(komorka(pierwszy, "Rola")).toHaveTextContent(/^Rola\s*Wolontariusz$/);
    expect(komorka(pierwszy, "Prowadzący")).toHaveTextContent(/^Prowadzący\s*Joanna Demo$/);
    expect(komorka(pierwszy, "Stan")).toHaveTextContent(/^Stan\s*konto aktywne$/);
    expect(komorka(drugi, "Osoba")).toHaveTextContent(/^Marta Demo18osoba18@demo\.pl$/);
    expect(komorka(drugi, "Rola")).toHaveTextContent(/^Rola\s*Psycholog prowadzący$/);
    expect(komorka(drugi, "Prowadzący")).toHaveTextContent(/^Prowadzący\s*brak$/);
    expect(komorka(drugi, "Stan")).toHaveTextContent(/^Stan\s*konto zablokowane$/);
    // Wiersza opisowego „e-mail · rola” już nie ma.
    expect(screen.queryByText(/@demo\.pl · /)).toBeNull();
    expect(apiPaged).toHaveBeenCalledTimes(1);
    expect(screen.getByText("konto aktywne")).toBeInTheDocument();
    expect(screen.getByText("konto zablokowane")).toBeInTheDocument();
    expect(screen.queryByText("Konto aktywne")).toBeNull();
    expect(screen.queryByText("Konto zablokowane")).toBeNull();
    expect(container.textContent).not.toMatch(/\b(volunteer|student|instructor|project_manager|super_admin)\b/);
    expect(screen.getByText(/Razem osób: 2/)).toBeInTheDocument();
    expect(apiPaged).toHaveBeenCalledWith(ADRES_LISTY);
    expect(przyciskiGlowne(container)).toBe(0);
  });

  it("wiersz w kolumnach: nazwa pierwsza (przy wolontariuszu jako etykieta pola wyboru), „Otwórz” z pełną nazwą dla czytnika na końcu, lista na karcie", async () => {
    apiPaged.mockResolvedValue(odpowiedz([osoba(17), osoba(18, { role: "student" })], { total: 2 }));
    render(<OsobyLista />);

    // Wolontariusz: imię i nazwisko jest etykietą pola wyboru w pierwszej komórce.
    const pole = await screen.findByRole("checkbox", { name: "Marta Demo17" });
    const odnosnik = screen.getByRole("link", { name: "Otwórz kartę: Marta Demo17" });
    expect(odnosnik.textContent).toMatch(/^Otwórz\s*›$/);
    const wiersz = odnosnik.closest('[role="row"]') as HTMLElement;
    const komorki = within(wiersz).getAllByRole("cell");
    expect(komorki[0]).toContainElement(pole);
    expect(komorki.at(-1)).toContainElement(odnosnik);
    // Osoba spoza przypisania: nazwa to zwykły akapit, bez pola wyboru.
    const tytul = screen.getByText("Marta Demo18");
    expect(tytul.tagName).toBe("P");
    expect(screen.queryByRole("checkbox", { name: "Marta Demo18" })).toBeNull();
    // Lista stoi na białej karcie; wiersze mają wcięcie karty.
    expect(screen.getByRole("region", { name: "Lista osób" }).className).toMatch(/karta/);
    // Plakietka stanu małą literą stoi w wierszu (stan dobry w atomie Badge wygląda jak „neutral”, bez barwy).
    expect(within(wiersz).getByText("konto aktywne").className).toMatch(/neutral/);
    // Nagłówek listy zostaje w drzewie nagłówków (h2 bezpośrednio pod h1), wzrokowo go nie ma.
    const naglowekListy = screen.getByRole("heading", { level: 2, name: "Lista osób" });
    expect(naglowekListy.parentElement?.className).toMatch(/ukryte/);
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
  });

  it("akcje nagłówka: eksport jako akcja drugorzędna w nagłówku, odnośnik „Zgłoszenia rekrutacyjne” pod h1 jako zwykły link", async () => {
    apiPaged.mockResolvedValue(odpowiedz([osoba(17)]));
    const { container } = render(<OsobyLista />);
    await screen.findByText("Marta Demo17");

    const glowa = container.querySelector("[data-testid='pageheader-glowa']") as HTMLElement;
    const eksport = screen.getByRole("button", { name: "Pobierz tabelę (Excel)" });
    expect(glowa).toContainElement(eksport);
    expect(container.querySelector("[data-testid='pageheader-akcje']")).toContainElement(eksport);
    expect(eksport.className).not.toMatch(/primary/);
    // Eksport nie stoi już w treści pod nagłówkiem, a odnośnik do zgłoszeń to link w bloku tekstu pod h1.
    expect(screen.getAllByRole("button", { name: "Pobierz tabelę (Excel)" })).toHaveLength(1);
    const zgloszenia = screen.getByRole("link", { name: "Zgłoszenia rekrutacyjne" });
    expect(zgloszenia).toHaveAttribute("href", "/admin/nabor");
    expect(glowa).toContainElement(zgloszenia);
    expect(container.querySelector("[data-testid='pageheader-akcje']")).not.toContainElement(zgloszenia);
    expect(przyciskiGlowne(container)).toBe(0);
  });

  it("pusty bez filtra: tekst o braku osób w programie i przejście do zgłoszeń", async () => {
    const uzytkownik = userEvent.setup();
    apiPaged.mockResolvedValue(odpowiedz([]));
    const { container } = render(<OsobyLista />);

    await screen.findByText("Brak osób w programie");
    sprawdzSzablon(container);
    expect(screen.queryByText("Brak osób spełniających filtr")).toBeNull();
    expect(screen.queryByRole("button", { name: "Pobierz tabelę (Excel)" })).toBeNull();

    await uzytkownik.click(screen.getByRole("button", { name: "Przejdź do zgłoszeń" }));
    expect(push).toHaveBeenCalledWith("/admin/nabor");
  });

  it("pusty z filtrem: osobny tekst, a „Wyczyść filtr” wraca do zapytania bez filtra", async () => {
    const uzytkownik = userEvent.setup();
    apiPaged.mockResolvedValueOnce(odpowiedz([osoba(17)]));
    const { container } = render(<OsobyLista />);
    await screen.findByText("Marta Demo17");

    apiPaged.mockResolvedValueOnce(odpowiedz([]));
    await uzytkownik.type(screen.getByRole("textbox", { name: /Szukaj/ }), "zzz");
    await uzytkownik.click(screen.getByRole("button", { name: "Filtruj" }));

    await screen.findByText("Brak osób spełniających filtr");
    sprawdzSzablon(container);
    expect(screen.queryByText("Brak osób w programie")).toBeNull();

    apiPaged.mockResolvedValueOnce(odpowiedz([osoba(17)]));
    await uzytkownik.click(screen.getAllByRole("button", { name: "Wyczyść filtr" })[0]);
    await screen.findByText("Marta Demo17");
    expect(apiPaged).toHaveBeenLastCalledWith(ADRES_LISTY);
  });

  it("odmowa 403: wariant odmowy z rolą administracji, zero rekordów, szablon na miejscu", async () => {
    apiPaged.mockRejectedValue(odmowa(403));
    const { container } = render(<OsobyLista />);

    await screen.findByText(/administracji/);
    sprawdzSzablon(container);
    expect(container.textContent).toMatch(/tylko dla administracji/);
    expect(screen.queryByRole("link", { name: /^Otwórz kartę: / })).toBeNull();
    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.queryByRole("button", { name: "Pobierz tabelę (Excel)" })).toBeNull();
    expect(container.textContent).not.toMatch(/Brak dostępu|Nie masz uprawnień/);
  });

  it("odnośnik do zgłoszeń rekrutacyjnych: w nagłówku po odczycie listy, nie w ładowaniu ani przy odmowie", async () => {
    apiPaged.mockResolvedValue(odpowiedz([osoba(17)]));
    const zDanymi = render(<OsobyLista />);
    expect(screen.queryByRole("link", { name: "Zgłoszenia rekrutacyjne" })).toBeNull();
    const odnosnik = await screen.findByRole("link", { name: "Zgłoszenia rekrutacyjne" });
    expect(odnosnik.getAttribute("href")).toBe("/admin/nabor");
    expect(zDanymi.container.querySelector("header")).toContainElement(odnosnik);
    zDanymi.unmount();

    apiPaged.mockRejectedValue(odmowa(403));
    render(<OsobyLista />);
    await screen.findByText(/administracji/);
    expect(screen.queryByRole("link", { name: "Zgłoszenia rekrutacyjne" })).toBeNull();
  });

  it("odmowa 401: ten sam wariant odmowy i zero rekordów", async () => {
    apiPaged.mockRejectedValue(odmowa(401));
    const { container } = render(<OsobyLista />);

    await screen.findByText(/administracji/);
    sprawdzSzablon(container);
    expect(screen.queryByRole("link", { name: /^Otwórz kartę: / })).toBeNull();
  });

  it("błąd sieci: komunikat z „Spróbuj ponownie”, które wczytuje listę jeszcze raz", async () => {
    const uzytkownik = userEvent.setup();
    apiPaged.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    apiPaged.mockResolvedValue(odpowiedz([osoba(17)]));
    const { container } = render(<OsobyLista />);

    const komunikat = await screen.findByRole("alert");
    expect(within(komunikat).getByText("Nie udało się wczytać listy osób")).toBeInTheDocument();
    sprawdzSzablon(container);
    expect(screen.queryByRole("link", { name: /^Otwórz kartę: / })).toBeNull();

    await uzytkownik.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    await screen.findByText("Marta Demo17");
    expect(apiPaged).toHaveBeenCalledTimes(2);
  });

  it("błąd serwera 500 kończy się komunikatem z ponowieniem, nie odmową roli", async () => {
    apiPaged.mockRejectedValue(new ApiError({ status: 500, code: "server_error", message: "Błąd." }));
    const { container } = render(<OsobyLista />);

    await screen.findByRole("alert");
    sprawdzSzablon(container);
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeInTheDocument();
  });
});

describe("Osoby — filtr i stronicowanie", () => {
  it("rola i przycięta fraza trafiają do zapytania, strona wraca na pierwszą", async () => {
    const uzytkownik = userEvent.setup();
    apiPaged.mockResolvedValue(odpowiedz([osoba(17)]));
    render(<OsobyLista />);
    await screen.findByText("Marta Demo17");

    await uzytkownik.click(screen.getByRole("combobox", { name: /^Rola/ }));
    await uzytkownik.click(screen.getByRole("option", { name: "Wolontariusz" }));
    await uzytkownik.type(screen.getByRole("textbox", { name: /Szukaj/ }), "  kowal ");
    await uzytkownik.click(screen.getByRole("button", { name: "Filtruj" }));

    await waitFor(() =>
      expect(apiPaged).toHaveBeenLastCalledWith("/admin/users?role=volunteer&search=kowal&page=1&per_page=25"),
    );
  });

  it("lista ról w filtrze to etykiety polskie, bez surowych kodów", async () => {
    const uzytkownik = userEvent.setup();
    apiPaged.mockResolvedValue(odpowiedz([osoba(17)]));
    render(<OsobyLista />);
    await screen.findByText("Marta Demo17");

    await uzytkownik.click(screen.getByRole("combobox", { name: /^Rola/ }));
    const opcje = screen.getAllByRole("option").map((o) => o.textContent);
    expect(opcje).toEqual([
      "Wszystkie role",
      "Super Admin",
      "Opiekun Projektu",
      "Psycholog prowadzący",
      "Wolontariusz",
      "Student",
    ]);
  });

  it("stronicowanie: „Następna” i „Poprzednia” zmieniają page; na pierwszej stronie „Poprzednia” jest nieaktywna", async () => {
    const uzytkownik = userEvent.setup();
    apiPaged.mockResolvedValueOnce(odpowiedz([osoba(17)], { current_page: 1, last_page: 3, total: 60 }));
    render(<OsobyLista />);
    await screen.findByText("Strona 1 z 3");
    expect(screen.getByRole("button", { name: "Poprzednia" })).toBeDisabled();

    apiPaged.mockResolvedValueOnce(odpowiedz([osoba(42)], { current_page: 2, last_page: 3, total: 60 }));
    await uzytkownik.click(screen.getByRole("button", { name: "Następna" }));
    await screen.findByText("Strona 2 z 3");
    expect(apiPaged).toHaveBeenLastCalledWith("/admin/users?page=2&per_page=25");

    apiPaged.mockResolvedValueOnce(odpowiedz([osoba(17)], { current_page: 1, last_page: 3, total: 60 }));
    await uzytkownik.click(screen.getByRole("button", { name: "Poprzednia" }));
    await screen.findByText("Strona 1 z 3");
    expect(apiPaged).toHaveBeenLastCalledWith("/admin/users?page=1&per_page=25");
  });

  it("jedna strona: bez paska stronicowania", async () => {
    apiPaged.mockResolvedValue(odpowiedz([osoba(17)]));
    render(<OsobyLista />);
    await screen.findByText("Marta Demo17");
    expect(screen.queryByRole("navigation", { name: "Stronicowanie" })).toBeNull();
  });
});

describe("Osoby — pobranie tabeli", () => {
  it("bez filtra: pobiera export.csv jako osoby.csv, potem pokazuje potwierdzenie", async () => {
    const uzytkownik = userEvent.setup();
    apiPaged.mockResolvedValue(odpowiedz([osoba(17)]));
    downloadFile.mockResolvedValue(undefined);
    render(<OsobyLista />);
    await screen.findByText("Marta Demo17");

    await uzytkownik.click(screen.getByRole("button", { name: "Pobierz tabelę (Excel)" }));

    await screen.findByText("Tabela pobrana");
    expect(downloadFile).toHaveBeenCalledTimes(1);
    const [adres, nazwa] = downloadFile.mock.calls[0];
    expect(String(adres)).toMatch(/\/api\/v1\/admin\/users\/export\.csv$/);
    expect(nazwa).toBe("osoby.csv");
  });

  it("z zastosowanym filtrem: adres niesie rolę i frazę, bez stronicowania", async () => {
    const uzytkownik = userEvent.setup();
    apiPaged.mockResolvedValue(odpowiedz([osoba(17)]));
    downloadFile.mockResolvedValue(undefined);
    render(<OsobyLista />);
    await screen.findByText("Marta Demo17");

    await uzytkownik.click(screen.getByRole("combobox", { name: /^Rola/ }));
    await uzytkownik.click(screen.getByRole("option", { name: "Student" }));
    await uzytkownik.type(screen.getByRole("textbox", { name: /Szukaj/ }), "kowal");
    await uzytkownik.click(screen.getByRole("button", { name: "Filtruj" }));
    await waitFor(() => expect(apiPaged).toHaveBeenCalledTimes(2));
    await screen.findByText("Marta Demo17");

    await uzytkownik.click(screen.getByRole("button", { name: "Pobierz tabelę (Excel)" }));
    await waitFor(() => expect(downloadFile).toHaveBeenCalledTimes(1));
    expect(String(downloadFile.mock.calls[0][0])).toMatch(/\/admin\/users\/export\.csv\?role=student&search=kowal$/);
  });

  it("błąd pobrania: komunikat, lista zostaje na ekranie", async () => {
    const uzytkownik = userEvent.setup();
    apiPaged.mockResolvedValue(odpowiedz([osoba(17)]));
    downloadFile.mockRejectedValue(new ApiError({ status: 403, code: "forbidden", message: "Brak zgody na pobranie." }));
    const { container } = render(<OsobyLista />);
    await screen.findByText("Marta Demo17");

    await uzytkownik.click(screen.getByRole("button", { name: "Pobierz tabelę (Excel)" }));

    const komunikat = await screen.findByRole("alert");
    expect(within(komunikat).getByText("Nie udało się pobrać tabeli")).toBeInTheDocument();
    expect(within(komunikat).getByText("Brak zgody na pobranie.")).toBeInTheDocument();
    expect(screen.getByText("Marta Demo17")).toBeInTheDocument();
    sprawdzSzablon(container);
  });

  it("w trakcie pobierania przycisk jest nieaktywny i nazywa stan", async () => {
    const uzytkownik = userEvent.setup();
    apiPaged.mockResolvedValue(odpowiedz([osoba(17)]));
    downloadFile.mockReturnValue(new Promise(() => {}));
    render(<OsobyLista />);
    await screen.findByText("Marta Demo17");

    await uzytkownik.click(screen.getByRole("button", { name: "Pobierz tabelę (Excel)" }));

    const przycisk = await screen.findByRole("button", { name: "Pobieranie…" });
    expect(przycisk).toBeDisabled();
  });
});

describe("Osoby — kontrola dodatnia pomiaru przycisków głównych", () => {
  it("licznik widzi przycisk główny, gdy taki jest w drzewie", () => {
    const { container } = render(<Button poziom="primary">Główny</Button>);
    expect(przyciskiGlowne(container)).toBe(1);
  });
});
