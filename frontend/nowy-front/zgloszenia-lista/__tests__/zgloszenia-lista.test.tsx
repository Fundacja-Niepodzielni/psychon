import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";
import { naruszeniaSeparatora } from "@/design-system/molekuly/ListRow/__tests__/separator-linii";
import { Button } from "@/design-system/atomy/Button/Button";

/**
 * Ekran listy zgłoszeń rekrutacyjnych (`GET /admin/applications`): każdy stan
 * ma ten sam korzeń szablonu (jeden `main`, `data-style-id`), filtr i
 * stronicowanie biegną do zapytania, odmowa roli i błąd sieci nie pokazują
 * żadnych rekordów.
 */

const apiPaged = vi.fn();
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

const { ApiError } = await import("@/lib/api/klient");
const { ZgloszeniaLista } = await import("../ZgloszeniaLista");

function zgloszenie(id: number, nadpisania: Record<string, unknown> = {}) {
  return {
    id,
    edition_id: 1,
    first_name: "Anna",
    last_name: `Kandydat${id}`,
    email: `kandydat${id}@demo.pl`,
    phone: null,
    source: null,
    role: "volunteer",
    payload: null,
    university: null,
    graduation_year: null,
    consent_regulamin_at: null,
    consent_polityka_at: null,
    status: "new",
    rejection_reason: null,
    decided_by: null,
    decided_at: null,
    user_id: null,
    has_diploma_scan: false,
    diploma_scan_url: null,
    created_at: "2026-09-20T10:00:00Z",
    updated_at: "2026-09-20T10:00:00Z",
    ...nadpisania,
  };
}

function odpowiedz(dane: unknown[], meta: Record<string, unknown> = {}) {
  return {
    data: dane,
    meta: { current_page: 1, per_page: 25, total: dane.length, last_page: 1, edition_id: 1, ...meta },
  };
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

beforeEach(() => {
  apiPaged.mockReset();
  push.mockReset();
  back.mockReset();
});

describe("Zgłoszenia rekrutacyjne — stany", () => {
  it("ładowanie: szkielet w szablonie, zero wierszy", () => {
    apiPaged.mockReturnValue(new Promise(() => {}));
    const { container } = render(<ZgloszeniaLista />);

    sprawdzSzablon(container);
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(screen.queryByRole("link", { name: /^Otwórz zgłoszenie: / })).toBeNull();
  });

  it("dane: wiersze z rolą po polsku, stanem i odnośnikiem do szczegółu", async () => {
    apiPaged.mockResolvedValue(
      odpowiedz([zgloszenie(11), zgloszenie(12, { role: "student", status: "accepted" })], { total: 2 }),
    );
    const { container } = render(<ZgloszeniaLista />);

    await screen.findByText("Anna Kandydat11");
    sprawdzSzablon(container);

    const odnosniki = screen.getAllByRole("link", { name: /^Otwórz zgłoszenie: / });
    expect(odnosniki.map((a) => a.getAttribute("href"))).toEqual([
      "/admin/nabor/11",
      "/admin/nabor/12",
    ]);
    expect(screen.getByText(/kandydat11@demo\.pl · proponowana rola: Wolontariusz · zgłoszono 20\.09\.2026/)).toBeInTheDocument();
    expect(screen.getByText(/proponowana rola: Student/)).toBeInTheDocument();
    expect(screen.getByText("czeka na decyzję")).toBeInTheDocument();
    expect(screen.getByText("zatwierdzone")).toBeInTheDocument();
    expect(screen.queryByText("Czeka na decyzję")).toBeNull();
    expect(container.textContent).not.toMatch(/\b(volunteer|student|instructor)\b/);
    expect(screen.getByText(/Razem zgłoszeń: 2/)).toBeInTheDocument();
    // Jedyny przycisk w kolorze to „Dodaj zgłoszenie” w nagłówku (wiersze mają tylko odnośniki).
    expect(przyciskiGlowne(container)).toBe(1);
    expect(container.querySelector("button[class*='primary']")?.textContent).toBe("Dodaj zgłoszenie");
    expect(container.querySelector("[data-testid='pageheader-glowa']")).toContainElement(
      container.querySelector("button[class*='primary']") as HTMLElement,
    );
  });

  it("wiersz jak wiersz Spraw: pogrubione imię i nazwisko, meta po „·”, „Otwórz” z pełną nazwą dla czytnika, tekst równo z h1", async () => {
    apiPaged.mockResolvedValue(odpowiedz([zgloszenie(11)], { total: 1 }));
    render(<ZgloszeniaLista />);

    const tytul = await screen.findByText("Anna Kandydat11");
    expect(tytul.tagName).toBe("P");
    expect(tytul.parentElement?.className).toMatch(/pogrubiony/);
    const odnosnik = screen.getByRole("link", { name: "Otwórz zgłoszenie: Anna Kandydat11" });
    expect(odnosnik.textContent).toMatch(/^Otwórz\s*›$/);
    expect(odnosnik).toHaveAttribute("href", "/admin/nabor/11");
    const wiersz = odnosnik.closest("[data-wariant]") as HTMLElement;
    expect(wiersz.className).toMatch(/bezWciecia/);
    expect(naruszeniaSeparatora(tytul.parentElement as HTMLElement)).toEqual([]);
    const naglowekListy = screen.getByRole("heading", { level: 2, name: "Lista zgłoszeń" });
    expect(naglowekListy.parentElement?.className).toMatch(/ukryte/);
  });

  it("akcje nagłówka: „Dodaj zgłoszenie” (główna) i „Importuj z pliku CSV” (drugorzędna) obok siebie w nagłówku, każda raz", async () => {
    apiPaged.mockResolvedValue(odpowiedz([zgloszenie(11)]));
    const { container } = render(<ZgloszeniaLista />);
    await screen.findByText("Anna Kandydat11");

    const akcje = container.querySelector("[data-testid='pageheader-przycisk-glowny']") as HTMLElement;
    const dodaj = screen.getAllByRole("button", { name: "Dodaj zgłoszenie" });
    const importuj = screen.getAllByRole("button", { name: "Importuj z pliku CSV" });
    expect(dodaj).toHaveLength(1);
    expect(importuj).toHaveLength(1);
    expect(akcje).toContainElement(dodaj[0]);
    expect(akcje).toContainElement(importuj[0]);
    expect(importuj[0].className).not.toMatch(/primary/);
    expect(dodaj[0].className).toMatch(/primary/);
    // Drugorzędna stoi przed główną (po jej lewej stronie od 768 px), obie w jednym kontenerze akcji.
    expect(Array.from(akcje.querySelectorAll("button"))).toEqual([importuj[0], dodaj[0]]);
  });

  it("pusty bez filtra: tekst o braku zgłoszeń w roku programu i otwarcie wczytania z pliku na tym samym ekranie", async () => {
    const uzytkownik = userEvent.setup();
    apiPaged.mockResolvedValue(odpowiedz([]));
    const { container } = render(<ZgloszeniaLista />);

    await screen.findByText("Brak zgłoszeń w tym roku programu");
    sprawdzSzablon(container);
    expect(screen.queryByText("Brak zgłoszeń spełniających filtr")).toBeNull();

    await uzytkownik.click(screen.getByRole("button", { name: "Wczytaj zgłoszenia z pliku" }));
    expect(screen.getByRole("heading", { level: 2, name: "Importuj z pliku CSV" })).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("pusty z filtrem: osobny tekst, a „Wyczyść filtr” wraca do zapytania bez filtra", async () => {
    const uzytkownik = userEvent.setup();
    apiPaged.mockResolvedValue(odpowiedz([]));
    const { container } = render(<ZgloszeniaLista />);
    await screen.findByText("Brak zgłoszeń w tym roku programu");

    await uzytkownik.type(screen.getByRole("textbox", { name: /Szukaj/ }), "zzz");
    await uzytkownik.click(screen.getByRole("button", { name: "Filtruj" }));

    await screen.findByText("Brak zgłoszeń spełniających filtr");
    sprawdzSzablon(container);
    expect(screen.queryByText("Brak zgłoszeń w tym roku programu")).toBeNull();

    const liczbaWywolan = apiPaged.mock.calls.length;
    await uzytkownik.click(screen.getAllByRole("button", { name: "Wyczyść filtr" })[0]);
    await waitFor(() => expect(apiPaged.mock.calls.length).toBe(liczbaWywolan + 1));
    expect(apiPaged).toHaveBeenLastCalledWith("/admin/applications?page=1&per_page=25");
  });

  it("odmowa 403: wariant odmowy z rolą administracji, zero rekordów, szablon na miejscu", async () => {
    apiPaged.mockRejectedValue(odmowa(403));
    const { container } = render(<ZgloszeniaLista />);

    await screen.findByText(/administracji/);
    sprawdzSzablon(container);
    expect(container.textContent).toMatch(/tylko dla administracji/);
    expect(screen.queryByRole("link", { name: /^Otwórz zgłoszenie: / })).toBeNull();
    expect(screen.queryByRole("form")).toBeNull();
    expect(container.textContent).not.toMatch(/Brak dostępu|Nie masz uprawnień/);
  });

  it("odmowa 401: ten sam wariant odmowy i zero rekordów", async () => {
    apiPaged.mockRejectedValue(odmowa(401));
    const { container } = render(<ZgloszeniaLista />);

    await screen.findByText(/administracji/);
    sprawdzSzablon(container);
    expect(screen.queryByRole("link", { name: /^Otwórz zgłoszenie: / })).toBeNull();
  });

  it("błąd sieci: komunikat z „Spróbuj ponownie”, które wczytuje listę jeszcze raz", async () => {
    const uzytkownik = userEvent.setup();
    apiPaged.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    apiPaged.mockResolvedValue(odpowiedz([zgloszenie(11)]));
    const { container } = render(<ZgloszeniaLista />);

    const komunikat = await screen.findByRole("alert");
    expect(within(komunikat).getByText("Nie udało się wczytać zgłoszeń")).toBeInTheDocument();
    sprawdzSzablon(container);
    expect(screen.queryByRole("link", { name: /^Otwórz zgłoszenie: / })).toBeNull();

    await uzytkownik.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    await screen.findByText("Anna Kandydat11");
    expect(apiPaged).toHaveBeenCalledTimes(2);
  });

  it("błąd serwera 500 też kończy się komunikatem z ponowieniem, nie odmową roli", async () => {
    apiPaged.mockRejectedValue(new ApiError({ status: 500, code: "server_error", message: "Błąd." }));
    const { container } = render(<ZgloszeniaLista />);

    await screen.findByRole("alert");
    sprawdzSzablon(container);
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeInTheDocument();
  });
});

describe("Zgłoszenia rekrutacyjne — filtr i stronicowanie", () => {
  it("stan i fraza trafiają do zapytania, strona wraca na pierwszą", async () => {
    const uzytkownik = userEvent.setup();
    apiPaged.mockResolvedValue(odpowiedz([zgloszenie(11)]));
    render(<ZgloszeniaLista />);
    await screen.findByText("Anna Kandydat11");
    expect(apiPaged).toHaveBeenLastCalledWith("/admin/applications?page=1&per_page=25");

    await uzytkownik.click(screen.getByRole("combobox", { name: /^Stan/ }));
    await uzytkownik.click(screen.getByRole("option", { name: "Czeka na decyzję" }));
    await uzytkownik.type(screen.getByRole("textbox", { name: /Szukaj/ }), "  kowal ");
    await uzytkownik.click(screen.getByRole("button", { name: "Filtruj" }));

    await waitFor(() =>
      expect(apiPaged).toHaveBeenLastCalledWith("/admin/applications?page=1&per_page=25&status=new&search=kowal"),
    );
  });

  it("Enter w polu szukania stosuje filtr", async () => {
    const uzytkownik = userEvent.setup();
    apiPaged.mockResolvedValue(odpowiedz([zgloszenie(11)]));
    render(<ZgloszeniaLista />);
    await screen.findByText("Anna Kandydat11");

    await uzytkownik.type(screen.getByRole("textbox", { name: /Szukaj/ }), "demo{Enter}");
    await waitFor(() =>
      expect(apiPaged).toHaveBeenLastCalledWith("/admin/applications?page=1&per_page=25&search=demo"),
    );
  });

  it("stronicowanie: „Następna” i „Poprzednia” zmieniają page; na pierwszej stronie „Poprzednia” jest nieaktywna", async () => {
    const uzytkownik = userEvent.setup();
    apiPaged.mockResolvedValueOnce(
      odpowiedz([zgloszenie(11)], { current_page: 1, last_page: 3, total: 60 }),
    );
    render(<ZgloszeniaLista />);
    await screen.findByText("Strona 1 z 3");
    expect(screen.getByRole("button", { name: "Poprzednia" })).toBeDisabled();

    apiPaged.mockResolvedValueOnce(
      odpowiedz([zgloszenie(36)], { current_page: 2, last_page: 3, total: 60 }),
    );
    await uzytkownik.click(screen.getByRole("button", { name: "Następna" }));
    await screen.findByText("Strona 2 z 3");
    expect(apiPaged).toHaveBeenLastCalledWith("/admin/applications?page=2&per_page=25");

    apiPaged.mockResolvedValueOnce(
      odpowiedz([zgloszenie(11)], { current_page: 1, last_page: 3, total: 60 }),
    );
    await uzytkownik.click(screen.getByRole("button", { name: "Poprzednia" }));
    await screen.findByText("Strona 1 z 3");
    expect(apiPaged).toHaveBeenLastCalledWith("/admin/applications?page=1&per_page=25");
  });

  it("jedna strona: bez paska stronicowania", async () => {
    apiPaged.mockResolvedValue(odpowiedz([zgloszenie(11)]));
    render(<ZgloszeniaLista />);
    await screen.findByText("Anna Kandydat11");
    expect(screen.queryByRole("navigation", { name: "Stronicowanie" })).toBeNull();
  });
});

describe("Zgłoszenia rekrutacyjne — kontrola dodatnia pomiaru przycisków głównych", () => {
  it("licznik widzi przycisk główny, gdy taki jest w drzewie", () => {
    const { container } = render(<Button poziom="primary">Główny</Button>);
    expect(przyciskiGlowne(container)).toBe(1);
  });
});
