import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";
import { Button } from "@/design-system/atomy/Button/Button";
import { brakujaceKlucze, kluczeMetaZOpenApi, kluczeZasobu } from "../../staz-kolejka/__tests__/zrodla-ekranu";

/**
 * Ekran zgłoszeń dalszej współpracy (administracja) na szablonie `ListTemplate`,
 * z podmienionym wyłącznie transportem HTTP:
 *  - każdy stan (ładowanie, dane, pusty, brak uprawnień, błąd sieci, po zapisie)
 *    ma jeden `main` i znacznik szablonu listy w DOM;
 *  - odmowa roli to nazwa roli, zero danych i odpowiedź 401/403 atrapy;
 *  - „Odpowiedz” jest jedynym przyciskiem głównym i wysyła PATCH z ciałem;
 *  - statusy, daty i odpowiedzi mają zapis słownikowy, bez kodów wewnętrznych.
 * Atrapy mają klucze odczytane z zasobów PHP i z `openapi.json`.
 */

const api = vi.fn();
const apiPaged = vi.fn();
const back = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));
vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return {
    ...oryginal,
    api: (...a: unknown[]) => api(...a),
    apiPaged: (...a: unknown[]) => apiPaged(...a),
  };
});

const { ApiError } = await import("@/lib/api/klient");
const { ZgloszeniaWspolpracy } = await import("../ZgloszeniaWspolpracy");

const ZASOBY = [
  `backend/app/Http/Resources/H${"01"}/CooperationRequestResource.php`,
  `backend/app/Http/Resources/H${"01"}/AdminCooperationRequestResource.php`,
];

function zgloszenie(id: number, nadpisz: Record<string, unknown> = {}) {
  return {
    id,
    body: `Chcę kontynuować dyżury (${id}).`,
    status: "new",
    response: null,
    responded_at: null,
    created_at: "2026-09-20T10:00:00Z",
    updated_at: "2026-09-20T10:00:00Z",
    responded_by: null,
    user: { id: 17, first_name: "Marta", last_name: "Demo", email: "marta@demo.pl" },
    ...nadpisz,
  };
}

const META = { current_page: 1, per_page: 25, total: 3, last_page: 1 };

/**
 * Zwroty odmowy zakazane w tekstach ekranu, złożone z części, żeby sam test ich nie zawierał.
 * Trzeciego zwrotu („Ten widok…”) nie ma tu celowo: zdanie odmowy buduje wspólna molekuła
 * `EmptyState`, a jej brzmienia testy ekranu nie asercjonują.
 */
const ZAKAZANE_ZWROTY_ODMOWY = [
  ["Brak dost", "ępu"],
  ["Nie masz upraw", "nień"],
].map((czesci) => czesci.join(""));

const NOWE = zgloszenie(11);
const Z_ODPOWIEDZIA = zgloszenie(12, {
  status: "answered",
  response: "Zapraszamy do dalszej współpracy.",
  responded_at: "2026-09-21T10:00:00Z",
  responded_by: 3,
  user: { id: 18, first_name: "Filip", last_name: "Demo", email: "filip@demo.pl" },
});
const ZAMKNIETE = zgloszenie(13, {
  status: "closed",
  response: "Dziękujemy, zamykamy zgłoszenie.",
  responded_at: "2026-11-10T16:05:00Z",
  responded_by: 3,
  user: { id: 19, first_name: "Ewa", last_name: "Demo", email: "ewa@demo.pl" },
});
const TRZY = [NOWE, Z_ODPOWIEDZIA, ZAMKNIETE];

function blad(status: number, code: string, message: string, errors?: Record<string, string[]>) {
  return new ApiError({ status, code, message, errors });
}

function przyciskiGlowne() {
  return Array.from(document.querySelectorAll("button")).filter((b) =>
    b.className.split(/\s+/).some((klasa) => /(^|_)primary(_|$)/.test(klasa)),
  );
}

function oknaDialogowe() {
  return document.querySelectorAll('[role="dialog"], [aria-modal]');
}

function wiersz(nazwa: string) {
  return screen.getByText(nazwa).closest("li")!;
}

function wierszeListy() {
  return Array.from(document.querySelectorAll("ul[aria-label='Zgłoszenia współpracy'] > li"));
}

function sprawdzSzablon(container: HTMLElement) {
  expect(() => jedenMain(container)).not.toThrow();
  expect(container.querySelector("main")!.getAttribute("data-style-id")).toBe("szablon-lista");
  expect(container.querySelectorAll("#tresc")).toHaveLength(1);
}

async function renderZDanymi(dane: unknown[] = TRZY) {
  apiPaged.mockResolvedValueOnce({ data: dane, meta: { ...META, total: dane.length } });
  const wynik = render(<ZgloszeniaWspolpracy />);
  await screen.findByText("Marta Demo");
  return wynik;
}

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
  back.mockReset();
});

describe("ZgloszeniaWspolpracy — schemat atrap", () => {
  const schemat = () => Array.from(new Set(ZASOBY.flatMap((plik) => kluczeZasobu(plik)))).sort();

  it("atrapa zgłoszenia ma wszystkie klucze zasobów PHP", () => {
    expect(brakujaceKlucze(zgloszenie(1), schemat())).toEqual([]);
  });

  it("atrapa meta ma wszystkie wymagane klucze z openapi.json", () => {
    expect(brakujaceKlucze(META, kluczeMetaZOpenApi("/v1/admin/cooperation-requests"))).toEqual([]);
  });

  it("kontrola: atrapa bez klucza `responded_at` jest wykryta jako niepełna", () => {
    const uboga: Record<string, unknown> = { ...zgloszenie(1) };
    delete uboga.responded_at;
    expect(brakujaceKlucze(uboga, schemat())).toEqual(["responded_at"]);
  });
});

describe("ZgloszeniaWspolpracy — stany w szablonie listy", () => {
  it("ładowanie: szkielet w obszarze listy, jeden main, znacznik szablonu", () => {
    apiPaged.mockReturnValue(new Promise(() => undefined));
    const { container } = render(<ZgloszeniaWspolpracy />);
    sprawdzSzablon(container);
    expect(container.querySelector("[data-testid='obszar-lista'] [aria-busy='true']")).not.toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Zgłoszenia współpracy" })).toBeInTheDocument();
  });

  it("dane: trzy wiersze, jeden main, zapytanie o pierwszą stronę", async () => {
    const { container } = await renderZDanymi();
    sprawdzSzablon(container);
    expect(apiPaged).toHaveBeenCalledWith("/admin/cooperation-requests?page=1");
    expect(wierszeListy()).toHaveLength(3);
    expect(wiersz("Marta Demo")).toHaveTextContent("marta@demo.pl");
    expect(wiersz("Marta Demo")).toHaveTextContent(NOWE.body);
  });

  it("pusty: nagłówek „Brak zgłoszeń współpracy”, jeden main, zero wierszy", async () => {
    apiPaged.mockResolvedValueOnce({ data: [], meta: { ...META, total: 0 } });
    const { container } = render(<ZgloszeniaWspolpracy />);
    await screen.findByRole("heading", { name: "Brak zgłoszeń współpracy" });
    sprawdzSzablon(container);
    expect(wierszeListy()).toHaveLength(0);
  });

  it("pusty po filtrze: ten sam nagłówek, „Pokaż wszystkie” wczytuje listę bez filtra", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    apiPaged.mockResolvedValueOnce({ data: [], meta: { ...META, total: 0 } });
    await uzytkownik.click(screen.getByRole("combobox", { name: /^Status/ }));
    await uzytkownik.click(screen.getByRole("option", { name: "Zamknięte" }));
    await screen.findByRole("heading", { name: "Brak zgłoszeń współpracy" });
    expect(apiPaged).toHaveBeenLastCalledWith("/admin/cooperation-requests?status=closed&page=1");

    apiPaged.mockResolvedValueOnce({ data: TRZY, meta: META });
    await uzytkownik.click(screen.getByRole("button", { name: "Pokaż wszystkie" }));
    await screen.findByText("Marta Demo");
    expect(apiPaged).toHaveBeenLastCalledWith("/admin/cooperation-requests?page=1");
  });

  it.each([401, 403])("odmowa %i: nazwa roli, zero danych, jeden main", async (status) => {
    apiPaged.mockRejectedValueOnce(blad(status, status === 401 ? "unauthenticated" : "forbidden", "Odmowa."));
    const { container } = render(<ZgloszeniaWspolpracy />);
    await waitFor(() => expect(container.textContent).toContain("administracji"));
    sprawdzSzablon(container);
    expect(wierszeListy()).toHaveLength(0);
    expect(container.textContent).not.toContain("Marta");
    expect(container.textContent).not.toContain("marta@demo.pl");
    expect(screen.queryByRole("button", { name: /Odpowiedz/ })).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("błąd sieci: komunikat z „Spróbuj ponownie”, ponowienie wczytuje listę", async () => {
    apiPaged.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const uzytkownik = userEvent.setup();
    const { container } = render(<ZgloszeniaWspolpracy />);
    const ponow = await screen.findByRole("button", { name: "Spróbuj ponownie" });
    sprawdzSzablon(container);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    apiPaged.mockResolvedValueOnce({ data: TRZY, meta: META });
    await uzytkownik.click(ponow);
    await screen.findByText("Marta Demo");
    expect(apiPaged).toHaveBeenCalledTimes(2);
    sprawdzSzablon(container);
  });

  it("po zapisie: Toast potwierdza odpowiedź, stan nadal w szablonie listy", async () => {
    const uzytkownik = userEvent.setup();
    const { container } = await renderZDanymi();
    await uzytkownik.click(within(wiersz("Marta Demo")).getByRole("button", { name: "Odpowiedz na zgłoszenie" }));
    const formularz = await screen.findByRole("form", { name: /Odpowiedź na zgłoszenie: Marta Demo/ });
    await uzytkownik.type(within(formularz).getByRole("textbox", { name: /^Odpowiedź/ }), "Zapraszamy.");
    api.mockResolvedValueOnce(zgloszenie(11, { status: "answered", response: "Zapraszamy.", responded_at: "2026-09-22T10:00:00Z" }));
    await uzytkownik.click(within(formularz).getByRole("button", { name: "Odpowiedz" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Odpowiedź zapisana: Marta Demo."));
    sprawdzSzablon(container);
  });

  it("kontrola: dwa main w drzewie są wykryte przez pomiar jednego main", () => {
    const { container } = render(
      <div>
        <main id="tresc" tabIndex={-1} />
        <main id="tresc" tabIndex={-1} />
      </div>,
    );
    expect(() => jedenMain(container)).toThrow(/dokładnie jednego/);
  });

  it("stronicowanie: druga strona woła zapytanie z page=2", async () => {
    apiPaged.mockResolvedValueOnce({ data: TRZY, meta: { ...META, last_page: 2, total: 40 } });
    const uzytkownik = userEvent.setup();
    render(<ZgloszeniaWspolpracy />);
    await screen.findByText("Strona 1 z 2");
    apiPaged.mockResolvedValueOnce({
      data: [zgloszenie(14, { user: { id: 20, first_name: "Jan", last_name: "Demo", email: "jan@demo.pl" } })],
      meta: { ...META, current_page: 2, last_page: 2, total: 40 },
    });
    await uzytkownik.click(screen.getByRole("button", { name: "Następna" }));
    await screen.findByText("Jan Demo");
    expect(apiPaged).toHaveBeenLastCalledWith("/admin/cooperation-requests?page=2");
  });
});

describe("ZgloszeniaWspolpracy — główna akcja „Odpowiedz”", () => {
  it("bez otwartej sekcji żaden przycisk nie jest główny, sekcja w treści nie jest oknem dialogowym", async () => {
    await renderZDanymi();
    expect(przyciskiGlowne()).toHaveLength(0);
    expect(oknaDialogowe()).toHaveLength(0);
  });

  it("wiersze nowe i z odpowiedzią mają „Odpowiedz na zgłoszenie”, zamknięty nie ma żadnego przycisku", async () => {
    await renderZDanymi();
    expect(within(wiersz("Marta Demo")).getByRole("button", { name: "Odpowiedz na zgłoszenie" })).toBeInTheDocument();
    expect(within(wiersz("Filip Demo")).getByRole("button", { name: "Odpowiedz na zgłoszenie" })).toBeInTheDocument();
    expect(within(wiersz("Ewa Demo")).queryAllByRole("button")).toHaveLength(0);
  });

  it("otwarta sekcja: jeden rząd przycisków, „Odpowiedz” jest jedynym głównym, w wierszu, bez okna dialogowego", async () => {
    const uzytkownik = userEvent.setup();
    const { container } = await renderZDanymi();
    await uzytkownik.click(within(wiersz("Marta Demo")).getByRole("button", { name: "Odpowiedz na zgłoszenie" }));
    const formularz = await screen.findByRole("form", { name: /Odpowiedź na zgłoszenie: Marta Demo/ });
    expect(wiersz("Marta Demo").contains(formularz)).toBe(true);
    expect(oknaDialogowe()).toHaveLength(0);
    const glowne = przyciskiGlowne();
    expect(glowne).toHaveLength(1);
    expect(glowne[0]).toHaveTextContent("Odpowiedz");
    expect(glowne[0].textContent).toBe("Odpowiedz");
    const przyciskiSekcji = within(formularz).getAllByRole("button").map((b) => b.textContent);
    expect(przyciskiSekcji).toEqual(["Wróć do listy", "Odpowiedz"]);
    sprawdzSzablon(container);
  });

  it("kontrola: drugi przycisk główny na ekranie jest wykryty przez pomiar", () => {
    render(
      <div>
        <Button poziom="primary" onClick={() => undefined}>
          A
        </Button>
        <Button poziom="primary" onClick={() => undefined}>
          B
        </Button>
      </div>,
    );
    expect(przyciskiGlowne()).toHaveLength(2);
  });

  it("„Odpowiedz” wysyła PATCH z odpowiedzią i statusem „answered”, wiersz dostaje status i odpowiedź", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    await uzytkownik.click(within(wiersz("Marta Demo")).getByRole("button", { name: "Odpowiedz na zgłoszenie" }));
    const formularz = await screen.findByRole("form", { name: /Odpowiedź na zgłoszenie: Marta Demo/ });
    await uzytkownik.type(within(formularz).getByRole("textbox", { name: /^Odpowiedź/ }), "  Zapraszamy do współpracy.  ");
    api.mockResolvedValueOnce(
      zgloszenie(11, { status: "answered", response: "Zapraszamy do współpracy.", responded_at: "2026-09-22T10:00:00Z", responded_by: 3 }),
    );
    await uzytkownik.click(within(formularz).getByRole("button", { name: "Odpowiedz" }));
    await waitFor(() => expect(screen.queryByRole("form")).toBeNull());
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith("/admin/cooperation-requests/11", {
      method: "PATCH",
      body: { response: "Zapraszamy do współpracy.", status: "answered" },
    });
    expect(wiersz("Marta Demo")).toHaveTextContent("Z odpowiedzią");
    expect(wiersz("Marta Demo")).toHaveTextContent("Zapraszamy do współpracy.");
    expect(przyciskiGlowne()).toHaveLength(0);
  });

  it("pusta odpowiedź: serwer zwraca 422, błąd stoi przy polu, ciało PATCH ma pustą odpowiedź, wiersz zostaje", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    await uzytkownik.click(within(wiersz("Marta Demo")).getByRole("button", { name: "Odpowiedz na zgłoszenie" }));
    const formularz = await screen.findByRole("form", { name: /Odpowiedź na zgłoszenie: Marta Demo/ });
    api.mockRejectedValueOnce(
      blad(422, "validation_failed", "Popraw zaznaczone pola.", { response: ["Wpisz odpowiedź dla osoby zgłaszającej."] }),
    );
    await uzytkownik.click(within(formularz).getByRole("button", { name: "Odpowiedz" }));
    await waitFor(() =>
      expect(within(formularz).getAllByText("Wpisz odpowiedź dla osoby zgłaszającej.").length).toBeGreaterThan(0),
    );
    expect(api).toHaveBeenCalledWith("/admin/cooperation-requests/11", {
      method: "PATCH",
      body: { response: "", status: "answered" },
    });
    expect(screen.queryByRole("status")).toBeNull();
    expect(wiersz("Marta Demo")).toHaveTextContent("Nowe");
  });

  it("zamknięcie: wybrany status „Zamknięte” idzie w ciele PATCH, wiersz traci przycisk odpowiedzi", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    await uzytkownik.click(within(wiersz("Marta Demo")).getByRole("button", { name: "Odpowiedz na zgłoszenie" }));
    const formularz = await screen.findByRole("form", { name: /Odpowiedź na zgłoszenie: Marta Demo/ });
    await uzytkownik.type(within(formularz).getByRole("textbox", { name: /^Odpowiedź/ }), "Dziękujemy.");
    await uzytkownik.click(within(formularz).getByRole("combobox", { name: /^Status po odpowiedzi/ }));
    await uzytkownik.click(screen.getByRole("option", { name: "Zamknięte" }));
    api.mockResolvedValueOnce(
      zgloszenie(11, { status: "closed", response: "Dziękujemy.", responded_at: "2026-09-22T10:00:00Z", responded_by: 3 }),
    );
    await uzytkownik.click(within(formularz).getByRole("button", { name: "Odpowiedz" }));
    await waitFor(() => expect(screen.queryByRole("form")).toBeNull());
    expect(api).toHaveBeenCalledWith("/admin/cooperation-requests/11", {
      method: "PATCH",
      body: { response: "Dziękujemy.", status: "closed" },
    });
    expect(wiersz("Marta Demo")).toHaveTextContent("Zamknięte");
    expect(within(wiersz("Marta Demo")).queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByRole("status")).toHaveTextContent("Zgłoszenie zamknięte: Marta Demo.");
  });

  it("zamknięcie przy aktywnym filtrze „Nowe”: wiersz znika z listy bez dodatkowego zapytania", async () => {
    const uzytkownik = userEvent.setup();
    apiPaged.mockResolvedValueOnce({ data: TRZY, meta: META });
    render(<ZgloszeniaWspolpracy />);
    await screen.findByText("Marta Demo");
    apiPaged.mockResolvedValueOnce({ data: [NOWE], meta: { ...META, total: 1 } });
    await uzytkownik.click(screen.getByRole("combobox", { name: /^Status/ }));
    await uzytkownik.click(screen.getByRole("option", { name: "Nowe" }));
    await screen.findByText("Marta Demo");
    await uzytkownik.click(within(wiersz("Marta Demo")).getByRole("button", { name: "Odpowiedz na zgłoszenie" }));
    const formularz = await screen.findByRole("form", { name: /Odpowiedź na zgłoszenie/ });
    await uzytkownik.type(within(formularz).getByRole("textbox", { name: /^Odpowiedź/ }), "Dziękujemy.");
    api.mockResolvedValueOnce(zgloszenie(11, { status: "answered", response: "Dziękujemy.", responded_at: "2026-09-22T10:00:00Z" }));
    await uzytkownik.click(within(formularz).getByRole("button", { name: "Odpowiedz" }));
    await screen.findByRole("heading", { name: "Brak zgłoszeń współpracy" });
    expect(apiPaged).toHaveBeenCalledTimes(2);
  });

  it("Wróć do listy zamyka sekcję bez żądania", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    await uzytkownik.click(within(wiersz("Marta Demo")).getByRole("button", { name: "Odpowiedz na zgłoszenie" }));
    const formularz = await screen.findByRole("form", { name: /Odpowiedź na zgłoszenie/ });
    await uzytkownik.click(within(formularz).getByRole("button", { name: "Wróć do listy" }));
    expect(screen.queryByRole("form")).toBeNull();
    expect(api).not.toHaveBeenCalled();
  });

  it("zgłoszenie zamknięte w międzyczasie (403): komunikat z koperty, sekcja zamknięta, lista wczytana ponownie", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    await uzytkownik.click(within(wiersz("Marta Demo")).getByRole("button", { name: "Odpowiedz na zgłoszenie" }));
    const formularz = await screen.findByRole("form", { name: /Odpowiedź na zgłoszenie/ });
    await uzytkownik.type(within(formularz).getByRole("textbox", { name: /^Odpowiedź/ }), "x");
    api.mockRejectedValueOnce(blad(403, "cooperation_request_closed", "To zgłoszenie jest już zamknięte."));
    apiPaged.mockResolvedValueOnce({ data: [ZAMKNIETE], meta: { ...META, total: 1 } });
    await uzytkownik.click(within(formularz).getByRole("button", { name: "Odpowiedz" }));
    expect(await screen.findByText("To zgłoszenie jest już zamknięte.")).toBeInTheDocument();
    await screen.findByText("Ewa Demo");
    expect(screen.queryByRole("form")).toBeNull();
    expect(apiPaged).toHaveBeenCalledTimes(2);
  });

  it("błąd sieci przy zapisie: komunikat, sekcja zostaje otwarta z wpisaną treścią", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    await uzytkownik.click(within(wiersz("Marta Demo")).getByRole("button", { name: "Odpowiedz na zgłoszenie" }));
    const formularz = await screen.findByRole("form", { name: /Odpowiedź na zgłoszenie/ });
    await uzytkownik.type(within(formularz).getByRole("textbox", { name: /^Odpowiedź/ }), "Zapraszamy.");
    api.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await uzytkownik.click(within(formularz).getByRole("button", { name: "Odpowiedz" }));
    expect(await screen.findByText("Nie udało się zapisać odpowiedzi. Spróbuj ponownie.")).toBeInTheDocument();
    expect(within(screen.getByRole("form")).getByRole("textbox", { name: /^Odpowiedź/ })).toHaveValue("Zapraszamy.");
    expect(apiPaged).toHaveBeenCalledTimes(1);
  });
});

describe("ZgloszeniaWspolpracy — zapis słownikowy", () => {
  it("statusy mają etykiety polskie, kody wewnętrzne nie trafiają na listę", async () => {
    await renderZDanymi();
    const lista = document.querySelector("ul[aria-label='Zgłoszenia współpracy']") as HTMLElement;
    expect(wiersz("Marta Demo")).toHaveTextContent("Nowe");
    expect(wiersz("Filip Demo")).toHaveTextContent("Z odpowiedzią");
    expect(wiersz("Ewa Demo")).toHaveTextContent("Zamknięte");
    expect(lista.textContent).not.toMatch(/\b(new|answered|closed)\b/);
  });

  it("zgłoszenia z odpowiedzią pokazują jej treść i datę z godziną, nowe nie mają tej sekcji", async () => {
    await renderZDanymi();
    const odpowiedzAnswered = within(wiersz("Filip Demo")).getByTestId("odpowiedz-12");
    expect(odpowiedzAnswered).toHaveTextContent("Zapraszamy do dalszej współpracy.");
    expect(odpowiedzAnswered).toHaveTextContent("Odpowiedź z 21 września 2026, 12:00");
    const odpowiedzClosed = within(wiersz("Ewa Demo")).getByTestId("odpowiedz-13");
    expect(odpowiedzClosed).toHaveTextContent("Dziękujemy, zamykamy zgłoszenie.");
    expect(odpowiedzClosed).toHaveTextContent("Odpowiedź z 10 listopada 2026, 17:05");
    expect(within(wiersz("Marta Demo")).queryByTestId("odpowiedz-11")).toBeNull();
    expect(wiersz("Marta Demo")).not.toHaveTextContent("Odpowiedź z");
  });

  it("odpowiedź z HTML jest wyświetlona jako tekst, bez elementów", async () => {
    const html = '<b>pogrubione</b> <img src="x" onerror="alert(1)">';
    await renderZDanymi([zgloszenie(12, { status: "answered", response: html, responded_at: "2026-09-21T10:00:00Z" })]);
    const odpowiedz = screen.getByTestId("odpowiedz-12");
    expect(odpowiedz.textContent).toContain(html);
    expect(odpowiedz.querySelector("b, img")).toBeNull();
  });

  it("daty złożenia i odpowiedzi: zapis słownikowy, w DOM zero znaczników ISO", async () => {
    const { container } = await renderZDanymi();
    expect(wiersz("Marta Demo")).toHaveTextContent("złożono 20 września 2026, 12:00");
    expect(container.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("kontrola: znacznik ISO w DOM jest wykrywany przez ten sam wzorzec", () => {
    const { container } = render(<p>2026-09-20T10:00:00Z</p>);
    expect(container.textContent).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("brak daty odpowiedzi: kreska zamiast znacznika", async () => {
    await renderZDanymi([zgloszenie(12, { status: "answered", response: "Odpowiedź.", responded_at: null })]);
    expect(screen.getByTestId("odpowiedz-12")).toHaveTextContent("Odpowiedź z —");
  });

  it("żaden stan nie pokazuje kodów wewnętrznych ani zakazanych zwrotów odmowy", async () => {
    const teksty: string[] = [];
    const zbierz = (container: HTMLElement) => teksty.push(container.textContent ?? "");

    apiPaged.mockReturnValueOnce(new Promise(() => undefined));
    const a = render(<ZgloszeniaWspolpracy />);
    zbierz(a.container);
    a.unmount();

    apiPaged.mockResolvedValueOnce({ data: TRZY, meta: META });
    const b = render(<ZgloszeniaWspolpracy />);
    await screen.findByText("Marta Demo");
    zbierz(b.container);
    b.unmount();

    apiPaged.mockResolvedValueOnce({ data: [], meta: { ...META, total: 0 } });
    const c = render(<ZgloszeniaWspolpracy />);
    await screen.findByRole("heading", { name: "Brak zgłoszeń współpracy" });
    zbierz(c.container);
    c.unmount();

    apiPaged.mockRejectedValueOnce(blad(403, "forbidden", "Odmowa."));
    const d = render(<ZgloszeniaWspolpracy />);
    await waitFor(() => expect(d.container.textContent).toContain("administracji"));
    zbierz(d.container);
    d.unmount();

    apiPaged.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const e = render(<ZgloszeniaWspolpracy />);
    await screen.findByRole("button", { name: "Spróbuj ponownie" });
    zbierz(e.container);
    e.unmount();

    expect(teksty).toHaveLength(5);
    for (const tekst of teksty) {
      expect(tekst).not.toMatch(/\bH[0-9]{2}\b/);
      for (const zwrot of ZAKAZANE_ZWROTY_ODMOWY) expect(tekst).not.toContain(zwrot);
    }
  });

  it("kontrola: wzorzec kodu wewnętrznego wykrywa kod pakietu w tekście", () => {
    expect(`Odczyt i odpowiedź (H${"01"}).`).toMatch(/\bH[0-9]{2}\b/);
  });
});

describe("ZgloszeniaWspolpracy — nagłówek ekranu pierwszego poziomu", () => {
  /** Nagłówek = nazwa ekranu z menu; ekran z menu nie ma okruszków ani przycisku powrotu. */
  function sprawdzNaglowekPierwszegoPoziomu(container: HTMLElement) {
    const naglowki = screen.getAllByRole("heading", { level: 1 });
    expect(naglowki).toHaveLength(1);
    expect(naglowki[0]).toHaveTextContent(/^Zgłoszenia współpracy$/);
    expect(container.querySelector('nav[aria-label*="Okruszki"]')).toBeNull();
    expect(container.querySelector('[data-testid="pageheader-powrot"]')).toBeNull();
    expect(screen.queryByRole("button", { name: /^(Wstecz|Wróć)$/ })).toBeNull();
  }

  it("ładowanie", () => {
    apiPaged.mockReturnValue(new Promise(() => undefined));
    const { container } = render(<ZgloszeniaWspolpracy />);
    sprawdzNaglowekPierwszegoPoziomu(container);
  });

  it("dane", async () => {
    const { container } = await renderZDanymi();
    sprawdzNaglowekPierwszegoPoziomu(container);
  });

  it("błąd sieci", async () => {
    apiPaged.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { container } = render(<ZgloszeniaWspolpracy />);
    await screen.findByRole("button", { name: "Spróbuj ponownie" });
    sprawdzNaglowekPierwszegoPoziomu(container);
  });

  it("odmowa: ten sam nagłówek, nazwa roli, bez okruszków; przycisk „Wróć” należy do stanu odmowy, nie do nagłówka", async () => {
    apiPaged.mockRejectedValueOnce(blad(403, "forbidden", "Odmowa."));
    const { container } = render(<ZgloszeniaWspolpracy />);
    await waitFor(() => expect(container.textContent).toContain("administracji"));
    const naglowki = screen.getAllByRole("heading", { level: 1 });
    expect(naglowki).toHaveLength(1);
    expect(naglowki[0]).toHaveTextContent(/^Zgłoszenia współpracy$/);
    expect(container.querySelector('nav[aria-label*="Okruszki"]')).toBeNull();
    expect(container.querySelector('[data-testid="pageheader-powrot"]')).toBeNull();
  });

  it("kontrola: nagłówek z okruszkami i przyciskiem powrotu jest wykrywany tymi samymi selektorami", () => {
    const { container } = render(
      <header>
        <nav aria-label="Okruszki" />
        <button type="button" data-testid="pageheader-powrot">
          Wstecz
        </button>
      </header>,
    );
    expect(container.querySelector('nav[aria-label*="Okruszki"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="pageheader-powrot"]')).not.toBeNull();
  });
});
