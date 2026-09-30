import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";
import { expectLabelledControlsAndImages } from "@/app/(uczestnik)/panel/__tests__/a11y-smoke";
import {
  brakujaceKlucze,
  kluczeMetaZOpenApi,
  kluczeZasobu,
  tresc as trescPliku,
  KORZEN,
} from "../../staz-kolejka/__tests__/zrodla-ekranu";

/**
 * Ekran „Po programie” (uczestnik) na szablonie `DetailTemplate`, z
 * podmienionym wyłącznie transportem HTTP:
 *  - każdy stan (ładowanie, dane, program nieukończony, brak uprawnień, błąd
 *    sieci, po zapisie) ma jeden `main` i znacznik szablonu szczegółu w DOM;
 *  - osoba bez prawa do zgłoszenia nie widzi obietnicy wysyłki ani przycisku
 *    „Odśwież” i nie wysyła zapytania o własne zgłoszenia;
 *  - karta „Program ukończony” niesie odnośniki, a certyfikat tylko wolontariusz;
 *  - historia pokazuje status po polsku, daty w zapisie słownikowym i odpowiedź.
 * Atrapy mają klucze odczytane z zasobów PHP i z `openapi.json`.
 */

const api = vi.fn();
const apiPaged = vi.fn();
const back = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, push, refresh: vi.fn(), replace: vi.fn() }),
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
const { PoProgramieWspolpraca } = await import("../PoProgramieWspolpraca");

const ZASOB_ZGLOSZENIA = `backend/app/Http/Resources/H${"01"}/CooperationRequestResource.php`;
const ZASOB_PROFILU = "backend/app/Http/Resources/ProfileResource.php";

const META = { current_page: 1, per_page: 25, total: 2, last_page: 1 };

function ja(nadpisz: Record<string, unknown> = {}) {
  return { role: "volunteer", program_completed_at: "2026-09-20T10:00:00Z", ...nadpisz };
}

function zgloszenie(id: number, nadpisz: Record<string, unknown> = {}) {
  return {
    id,
    body: `Chcę kontynuować współpracę (${id}).`,
    status: "new",
    response: null,
    responded_at: null,
    created_at: "2026-09-20T10:00:00Z",
    updated_at: "2026-09-20T10:00:00Z",
    ...nadpisz,
  };
}

const NOWE = zgloszenie(5);
const Z_ODPOWIEDZIA = zgloszenie(4, {
  body: "Zgłoszenie sprzed miesiąca.",
  status: "answered",
  response: "Zapraszamy do dalszej współpracy od nowej edycji.",
  responded_at: "2026-09-15T09:00:00Z",
  created_at: "2026-08-20T10:00:00Z",
});
const ZAMKNIETE = zgloszenie(3, {
  body: "Starsze zgłoszenie.",
  status: "closed",
  response: "Dziękujemy.",
  responded_at: "2026-11-10T16:05:00Z",
  created_at: "2026-11-01T10:00:00Z",
});

function blad(status: number, code: string, message: string, errors?: Record<string, string[]>) {
  return new ApiError({ status, code, message, errors });
}

/** Zapytania o własne zgłoszenia, które wyszły przez transport. */
function zapytaniaOMine() {
  return apiPaged.mock.calls.filter((wywolanie) => String(wywolanie[0]).startsWith("/cooperation-requests/mine"));
}

function przyciskiGlowne() {
  return Array.from(document.querySelectorAll("button")).filter((b) =>
    b.className.split(/\s+/).some((klasa) => /(^|_)primary(_|$)/.test(klasa)),
  );
}

function oknaDialogowe() {
  return document.querySelectorAll('[role="dialog"], [aria-modal]');
}

function sprawdzSzablon(container: HTMLElement) {
  expect(() => jedenMain(container)).not.toThrow();
  expect(container.querySelector("main")!.getAttribute("data-style-id")).toBe("szablon-szczegol");
  expect(container.querySelectorAll("#tresc")).toHaveLength(1);
}

async function renderUkonczony(zgloszenia: unknown[] = [], nadpiszJa: Record<string, unknown> = {}) {
  api.mockResolvedValueOnce(ja(nadpiszJa));
  apiPaged.mockResolvedValueOnce({ data: zgloszenia, meta: { ...META, total: zgloszenia.length } });
  const wynik = render(<PoProgramieWspolpraca />);
  await screen.findByRole("form", { name: /Zgłoszenie dalszej współpracy/ }).catch(() => undefined);
  await screen.findByRole("heading", { name: "Moje zgłoszenia" });
  return wynik;
}

async function renderPrzedUkonczeniem(nadpiszJa: Record<string, unknown> = {}) {
  api.mockResolvedValueOnce(ja({ program_completed_at: null, ...nadpiszJa }));
  const wynik = render(<PoProgramieWspolpraca />);
  await screen.findByRole("heading", { name: "Ten ekran otworzy się po ukończeniu programu" });
  return wynik;
}

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
  back.mockReset();
  push.mockReset();
});

describe("PoProgramieWspolpraca — schemat atrap", () => {
  it("atrapa zgłoszenia ma wszystkie klucze zasobu PHP", () => {
    expect(brakujaceKlucze(zgloszenie(1), kluczeZasobu(ZASOB_ZGLOSZENIA))).toEqual([]);
  });

  it("atrapa meta ma wszystkie wymagane klucze z openapi.json", () => {
    expect(brakujaceKlucze(META, kluczeMetaZOpenApi("/v1/cooperation-requests/mine"))).toEqual([]);
  });

  it("atrapa profilu niesie pola, które ekran czyta, i oba są w zasobie PHP", () => {
    const klucze = kluczeZasobu(ZASOB_PROFILU);
    for (const klucz of Object.keys(ja())) expect(klucze).toContain(klucz);
  });

  it("kontrola: atrapa bez klucza `response` jest wykryta jako niepełna", () => {
    const uboga: Record<string, unknown> = { ...zgloszenie(1) };
    delete uboga.response;
    expect(brakujaceKlucze(uboga, kluczeZasobu(ZASOB_ZGLOSZENIA))).toEqual(["response"]);
  });
});

describe("PoProgramieWspolpraca — stany w szablonie szczegółu", () => {
  it("ładowanie: szkielet, jeden main, znacznik szablonu, nagłówek ekranu", () => {
    api.mockReturnValue(new Promise(() => undefined));
    const { container } = render(<PoProgramieWspolpraca />);
    sprawdzSzablon(container);
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Po programie" })).toBeInTheDocument();
  });

  it("dane: karta, formularz i historia, jeden main, pytania o /me i własne zgłoszenia", async () => {
    const { container } = await renderUkonczony([Z_ODPOWIEDZIA]);
    sprawdzSzablon(container);
    expect(api).toHaveBeenCalledWith("/me");
    expect(apiPaged).toHaveBeenCalledWith("/cooperation-requests/mine?page=1");
    expect(screen.getByRole("heading", { name: "Program ukończony" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /^Treść zgłoszenia/ })).toBeInTheDocument();
    expect(screen.getByText(Z_ODPOWIEDZIA.body)).toBeInTheDocument();
  });

  it("dane, pusta historia: zdanie o pierwszym zgłoszeniu, jeden main", async () => {
    const { container } = await renderUkonczony([]);
    sprawdzSzablon(container);
    expect(screen.getByText(/po wysłaniu/)).toBeInTheDocument();
  });

  it("program nieukończony: tekst ekranu, jeden main, znacznik szablonu", async () => {
    const { container } = await renderPrzedUkonczeniem();
    sprawdzSzablon(container);
    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Program ukończony" })).toBeNull();
  });

  it.each([401, 403])("odmowa %i przy /me: nazwa roli, zero danych, jeden main", async (status) => {
    api.mockRejectedValueOnce(blad(status, status === 401 ? "unauthenticated" : "forbidden", "Odmowa."));
    const { container } = render(<PoProgramieWspolpraca />);
    await waitFor(() => expect(container.textContent).toContain("uczestników"));
    sprawdzSzablon(container);
    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Moje zgłoszenia" })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(zapytaniaOMine()).toHaveLength(0);
  });

  it("odmowa 403 przy własnych zgłoszeniach (token bez roli uczestnika): nazwa roli, zero danych", async () => {
    api.mockResolvedValueOnce(ja());
    apiPaged.mockRejectedValueOnce(blad(403, "forbidden", "Odmowa."));
    const { container } = render(<PoProgramieWspolpraca />);
    await waitFor(() => expect(container.textContent).toContain("uczestników"));
    sprawdzSzablon(container);
    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Moje zgłoszenia" })).toBeNull();
  });

  it("inna rola w profilu: odmowa z nazwą roli, zero zapytań o własne zgłoszenia", async () => {
    api.mockResolvedValueOnce(ja({ role: "instructor" }));
    const { container } = render(<PoProgramieWspolpraca />);
    await waitFor(() => expect(container.textContent).toContain("uczestników"));
    sprawdzSzablon(container);
    expect(zapytaniaOMine()).toHaveLength(0);
    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.queryByRole("button", { name: "Wyślij zgłoszenie" })).toBeNull();
  });

  it("błąd sieci: komunikat z „Spróbuj ponownie”, ponowienie wczytuje ekran", async () => {
    api.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const uzytkownik = userEvent.setup();
    const { container } = render(<PoProgramieWspolpraca />);
    const ponow = await screen.findByRole("button", { name: "Spróbuj ponownie" });
    sprawdzSzablon(container);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    api.mockResolvedValueOnce(ja());
    apiPaged.mockResolvedValueOnce({ data: [], meta: { ...META, total: 0 } });
    await uzytkownik.click(ponow);
    await screen.findByRole("heading", { name: "Program ukończony" });
    expect(api).toHaveBeenCalledTimes(2);
    sprawdzSzablon(container);
  });

  it("błąd sieci przy własnych zgłoszeniach: ten sam stan błędu", async () => {
    api.mockResolvedValueOnce(ja());
    apiPaged.mockRejectedValueOnce(blad(500, "server_error", "Błąd."));
    const { container } = render(<PoProgramieWspolpraca />);
    await screen.findByRole("button", { name: "Spróbuj ponownie" });
    sprawdzSzablon(container);
  });

  it("po zapisie: Toast potwierdza wysłanie, zgłoszenie na górze historii, jeden main", async () => {
    const uzytkownik = userEvent.setup();
    const { container } = await renderUkonczony([]);
    await uzytkownik.type(screen.getByRole("textbox", { name: /^Treść zgłoszenia/ }), NOWE.body);
    api.mockResolvedValueOnce(NOWE);
    await uzytkownik.click(screen.getByRole("button", { name: "Wyślij zgłoszenie" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Zgłoszenie zostało wysłane."));
    expect(screen.getByText("Masz otwarte zgłoszenie. Poczekaj na odpowiedź.")).toBeInTheDocument();
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
});

describe("PoProgramieWspolpraca — osoba bez prawa do zgłoszenia nie widzi obietnicy wysyłki", () => {
  function sprawdzBezObietnicy(container: HTMLElement) {
    expect(container.textContent).not.toMatch(/po wysłaniu/);
    expect(screen.queryByRole("button", { name: /Odśwież/ })).toBeNull();
    expect(container.textContent).not.toMatch(/Odśwież/);
    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.queryByRole("button", { name: "Wyślij zgłoszenie" })).toBeNull();
  }

  it("program nieukończony w profilu: zero tekstu „po wysłaniu”, zero „Odśwież”, zero zapytań o własne zgłoszenia, historia ukryta", async () => {
    const { container } = await renderPrzedUkonczeniem();
    sprawdzBezObietnicy(container);
    expect(zapytaniaOMine()).toHaveLength(0);
    expect(apiPaged).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Moje zgłoszenia" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Moje zgłoszenia" })).toBeNull();
  });

  it("403 program_not_completed przy wysyłce, pusta historia: zero obietnicy, zero „Odśwież”, historia ukryta, zero nowych zapytań o własne zgłoszenia", async () => {
    const uzytkownik = userEvent.setup();
    const { container } = await renderUkonczony([]);
    expect(zapytaniaOMine()).toHaveLength(1);
    await uzytkownik.type(screen.getByRole("textbox", { name: /^Treść zgłoszenia/ }), "Chcę kontynuować.");
    api.mockRejectedValueOnce(
      blad(403, "program_not_completed", "Zgłoszenie współpracy jest dostępne po zakończeniu programu."),
    );
    await uzytkownik.click(screen.getByRole("button", { name: "Wyślij zgłoszenie" }));
    await screen.findByRole("heading", { name: "Ten ekran otworzy się po ukończeniu programu" });
    sprawdzBezObietnicy(container);
    expect(screen.queryByRole("heading", { name: "Moje zgłoszenia" })).toBeNull();
    expect(zapytaniaOMine()).toHaveLength(1);
    sprawdzSzablon(container);
  });

  it("403 program_not_completed przy wysyłce, osoba ma zgłoszenia: lista zostaje, bez zdania z obietnicą i bez „Odśwież”", async () => {
    const uzytkownik = userEvent.setup();
    const { container } = await renderUkonczony([Z_ODPOWIEDZIA]);
    await uzytkownik.type(screen.getByRole("textbox", { name: /^Treść zgłoszenia/ }), "Chcę kontynuować.");
    api.mockRejectedValueOnce(blad(403, "program_not_completed", "Zgłoszenie współpracy jest niedostępne."));
    await uzytkownik.click(screen.getByRole("button", { name: "Wyślij zgłoszenie" }));
    await screen.findByRole("heading", { name: "Ten ekran otworzy się po ukończeniu programu" });
    sprawdzBezObietnicy(container);
    expect(screen.getByRole("heading", { name: "Moje zgłoszenia" })).toBeInTheDocument();
    expect(screen.getByText(Z_ODPOWIEDZIA.body)).toBeInTheDocument();
    expect(zapytaniaOMine()).toHaveLength(1);
  });

  it("uprawniona osoba z pustą historią nie ma przycisku „Odśwież” (nie ma go w słowniku)", async () => {
    const { container } = await renderUkonczony([]);
    expect(container.textContent).not.toMatch(/Odśwież/);
    expect(screen.queryByRole("button", { name: /Odśwież/ })).toBeNull();
  });

  it("kontrola: zdanie z obietnicą w DOM jest wykrywane przez ten sam wzorzec", async () => {
    await renderUkonczony([]);
    expect(document.body.textContent).toMatch(/po wysłaniu/);
  });
});

describe("PoProgramieWspolpraca — wysyłka zgłoszenia", () => {
  it("„Wyślij zgłoszenie” jest jedynym przyciskiem głównym; formularz w treści, bez okna dialogowego", async () => {
    await renderUkonczony([]);
    const glowne = przyciskiGlowne();
    expect(glowne).toHaveLength(1);
    expect(glowne[0].textContent).toBe("Wyślij zgłoszenie");
    expect(oknaDialogowe()).toHaveLength(0);
  });

  it("wysyłka: POST z ciałem {body}, po 201 wiersz „Nowe” na górze, formularz zastąpiony informacją", async () => {
    const uzytkownik = userEvent.setup();
    await renderUkonczony([Z_ODPOWIEDZIA]);
    await uzytkownik.type(screen.getByRole("textbox", { name: /^Treść zgłoszenia/ }), `  ${NOWE.body}  `);
    api.mockResolvedValueOnce(NOWE);
    await uzytkownik.click(screen.getByRole("button", { name: "Wyślij zgłoszenie" }));
    await waitFor(() => expect(screen.getByText("Masz otwarte zgłoszenie. Poczekaj na odpowiedź.")).toBeInTheDocument());
    expect(api).toHaveBeenCalledWith("/cooperation-requests", { method: "POST", body: { body: NOWE.body } });
    const pozycje = Array.from(document.querySelectorAll("section[aria-label='Moje zgłoszenia'] ul > li"));
    expect(pozycje).toHaveLength(2);
    expect(pozycje[0]).toHaveTextContent("Nowe");
    expect(pozycje[0]).toHaveTextContent(NOWE.body);
    expect(screen.queryByRole("button", { name: "Wyślij zgłoszenie" })).toBeNull();
    expect(przyciskiGlowne()).toHaveLength(0);
  });

  it("422: błąd stoi przy polu, ciało POST ma pustą treść, lista nie rośnie", async () => {
    const uzytkownik = userEvent.setup();
    await renderUkonczony([]);
    api.mockRejectedValueOnce(
      blad(422, "validation_failed", "Popraw zaznaczone pola.", { body: ["Napisz, jakiej współpracy dotyczy zgłoszenie."] }),
    );
    await uzytkownik.click(screen.getByRole("button", { name: "Wyślij zgłoszenie" }));
    await waitFor(() =>
      expect(screen.getAllByText("Napisz, jakiej współpracy dotyczy zgłoszenie.").length).toBeGreaterThan(0),
    );
    expect(api).toHaveBeenCalledWith("/cooperation-requests", { method: "POST", body: { body: "" } });
    expect(document.querySelectorAll("section[aria-label='Moje zgłoszenia'] ul > li")).toHaveLength(0);
  });

  it("409 cooperation_request_open: komunikat z koperty, historia wczytana ponownie, formularz zastąpiony informacją", async () => {
    const uzytkownik = userEvent.setup();
    await renderUkonczony([]);
    await uzytkownik.type(screen.getByRole("textbox", { name: /^Treść zgłoszenia/ }), "Jeszcze jedno.");
    api.mockRejectedValueOnce(
      blad(409, "cooperation_request_open", "Masz już otwarte zgłoszenie współpracy. Poczekaj na odpowiedź."),
    );
    apiPaged.mockResolvedValueOnce({ data: [NOWE], meta: { ...META, total: 1 } });
    await uzytkownik.click(screen.getByRole("button", { name: "Wyślij zgłoszenie" }));
    expect(
      await screen.findByText("Masz już otwarte zgłoszenie współpracy. Poczekaj na odpowiedź."),
    ).toBeInTheDocument();
    await screen.findByText(NOWE.body);
    expect(zapytaniaOMine()).toHaveLength(2);
    expect(screen.getByText("Masz otwarte zgłoszenie. Poczekaj na odpowiedź.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Wyślij zgłoszenie" })).toBeNull();
  });

  it("inny błąd serwera: komunikat, treść w polu zostaje", async () => {
    const uzytkownik = userEvent.setup();
    await renderUkonczony([]);
    await uzytkownik.type(screen.getByRole("textbox", { name: /^Treść zgłoszenia/ }), "Treść.");
    api.mockRejectedValueOnce(blad(500, "server_error", "Serwer nie odpowiada."));
    await uzytkownik.click(screen.getByRole("button", { name: "Wyślij zgłoszenie" }));
    expect(await screen.findByText("Serwer nie odpowiada.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /^Treść zgłoszenia/ })).toHaveValue("Treść.");
  });

  it("błąd sieci przy wysyłce: komunikat ogólny", async () => {
    const uzytkownik = userEvent.setup();
    await renderUkonczony([]);
    await uzytkownik.type(screen.getByRole("textbox", { name: /^Treść zgłoszenia/ }), "Treść.");
    api.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await uzytkownik.click(screen.getByRole("button", { name: "Wyślij zgłoszenie" }));
    expect(await screen.findByText("Nie udało się wysłać zgłoszenia. Spróbuj ponownie.")).toBeInTheDocument();
  });

  it("otwarte zgłoszenie na liście od razu: informacja zamiast formularza, zero przycisków głównych", async () => {
    await renderUkonczony([NOWE]);
    expect(screen.getByText("Masz otwarte zgłoszenie. Poczekaj na odpowiedź.")).toBeInTheDocument();
    expect(screen.queryByRole("form")).toBeNull();
    expect(przyciskiGlowne()).toHaveLength(0);
  });

  it("stronicowanie historii: druga strona woła zapytanie z page=2", async () => {
    const uzytkownik = userEvent.setup();
    api.mockResolvedValueOnce(ja());
    apiPaged.mockResolvedValueOnce({ data: [NOWE], meta: { ...META, last_page: 2, total: 30 } });
    render(<PoProgramieWspolpraca />);
    await screen.findByText("Strona 1 z 2");
    apiPaged.mockResolvedValueOnce({
      data: [ZAMKNIETE],
      meta: { ...META, current_page: 2, last_page: 2, total: 30 },
    });
    await uzytkownik.click(screen.getByRole("button", { name: "Następna" }));
    await screen.findByText(ZAMKNIETE.body);
    expect(apiPaged).toHaveBeenLastCalledWith("/cooperation-requests/mine?page=2");
    expect(api).toHaveBeenCalledTimes(1);
  });
});

describe("PoProgramieWspolpraca — karta „Program ukończony”", () => {
  it("wolontariusz: data ukończenia słownikowo i trzy odnośniki, w tym certyfikat", async () => {
    await renderUkonczony([]);
    const karta = screen.getByRole("region", { name: "Program ukończony" });
    expect(karta).toHaveTextContent("Program ukończono 20 września 2026.");
    expect(within(karta).getByRole("link", { name: "Twoje dokumenty" })).toHaveAttribute("href", "/panel/dokumenty");
    expect(within(karta).getByRole("link", { name: "Kursy" })).toHaveAttribute("href", "/panel/kursy");
    expect(within(karta).getByRole("link", { name: "Certyfikat" })).toHaveAttribute("href", "/panel/certyfikat");
  });

  it("student: dokumenty i kursy, bez certyfikatu", async () => {
    await renderUkonczony([], { role: "student" });
    const karta = screen.getByRole("region", { name: "Program ukończony" });
    expect(within(karta).getByRole("link", { name: "Twoje dokumenty" })).toBeInTheDocument();
    expect(within(karta).getByRole("link", { name: "Kursy" })).toBeInTheDocument();
    expect(within(karta).queryByRole("link", { name: "Certyfikat" })).toBeNull();
  });

  it("data ukończenia z granicy doby UTC/Warszawa: następny dzień", async () => {
    await renderUkonczony([], { program_completed_at: "2026-09-30T22:30:00Z" });
    expect(screen.getByRole("region", { name: "Program ukończony" })).toHaveTextContent("Program ukończono 1 października 2026.");
  });

  it("program nieukończony: karty nie ma", async () => {
    await renderPrzedUkonczeniem();
    expect(screen.queryByRole("region", { name: "Program ukończony" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Certyfikat" })).toBeNull();
  });

  it("kontrola: bez wolontariusza w atrapie certyfikat znika (ten sam pomiar odróżnia role)", async () => {
    await renderUkonczony([], { role: "student" });
    expect(screen.queryAllByRole("link", { name: "Certyfikat" })).toHaveLength(0);
  });
});

describe("PoProgramieWspolpraca — historia zgłoszeń", () => {
  it("status po polsku, bez kodów wewnętrznych", async () => {
    await renderUkonczony([NOWE, Z_ODPOWIEDZIA, ZAMKNIETE]);
    const lista = document.querySelector("section[aria-label='Moje zgłoszenia'] ul") as HTMLElement;
    const pozycje = Array.from(lista.querySelectorAll(":scope > li"));
    expect(pozycje[0]).toHaveTextContent("Nowe");
    expect(pozycje[1]).toHaveTextContent("Z odpowiedzią");
    expect(pozycje[2]).toHaveTextContent("Zamknięte");
    expect(lista.textContent).not.toMatch(/\b(new|answered|closed)\b/);
  });

  it("daty złożenia i odpowiedzi w zapisie słownikowym, w DOM zero znaczników ISO", async () => {
    const { container } = await renderUkonczony([NOWE, Z_ODPOWIEDZIA, ZAMKNIETE]);
    expect(screen.getByText(`Złożono 20 września 2026, 12:00`)).toBeInTheDocument();
    expect(screen.getByTestId("odpowiedz-4")).toHaveTextContent("Odpowiedź z 15 września 2026, 11:00");
    expect(screen.getByTestId("odpowiedz-3")).toHaveTextContent("Odpowiedź z 10 listopada 2026, 17:05");
    expect(container.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("kontrola: znacznik ISO w DOM jest wykrywany przez ten sam wzorzec", () => {
    const { container } = render(<p>2026-09-20T10:00:00Z</p>);
    expect(container.textContent).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("zgłoszenie bez odpowiedzi nie ma sekcji odpowiedzi", async () => {
    await renderUkonczony([NOWE]);
    expect(screen.queryByTestId("odpowiedz-5")).toBeNull();
  });

  it("odpowiedź i treść z HTML są tekstem, bez elementów", async () => {
    const html = '<b>pogrubione</b> <img src="x" onerror="alert(1)">';
    await renderUkonczony([zgloszenie(9, { body: html, status: "answered", response: html, responded_at: "2026-09-15T09:00:00Z" })]);
    const pozycja = screen.getByTestId("odpowiedz-9").closest("li")!;
    expect(pozycja.textContent).toContain(html);
    expect(pozycja.querySelector("b, img")).toBeNull();
  });

  it("plakietka statusu stoi we własnym kontenerze o klasie wyrównania, nie rozciąga się na cały wiersz", async () => {
    await renderUkonczony([NOWE, Z_ODPOWIEDZIA]);
    const pozycje = Array.from(document.querySelectorAll("section[aria-label='Moje zgłoszenia'] ul > li"));
    for (const pozycja of pozycje) {
      const kontener = pozycja.firstElementChild as HTMLElement;
      expect(kontener.className).toMatch(/plakietka/);
      expect(kontener.children).toHaveLength(1);
      expect(kontener.children[0].tagName).toBe("SPAN");
    }
  });

  it("arkusz stylów: kontener plakietki ma wyrównanie do początku (`align-self: flex-start`)", () => {
    const css = trescPliku(`${KORZEN}/nowy-front/po-programie-wspolpraca/PoProgramieWspolpraca.module.css`);
    expect(css).toMatch(/\.plakietka\s*\{[^}]*align-self:\s*flex-start\s*;/);
  });

  it("kontrola: arkusz bez wyrównania jest wykrywany przez ten sam wzorzec", () => {
    expect(".plakietka { align-self: stretch; }").not.toMatch(/\.plakietka\s*\{[^}]*align-self:\s*flex-start\s*;/);
  });
});

describe("PoProgramieWspolpraca — dostępność", () => {
  it("po załadowaniu: każde pole ma etykietę, jeden nagłówek pierwszego stopnia, przyciski i odnośniki mają nazwy", async () => {
    const { container } = await renderUkonczony([Z_ODPOWIEDZIA]);
    expect(expectLabelledControlsAndImages(container)).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    for (const element of screen.getAllByRole("button")) expect(element).toHaveAccessibleName();
    for (const element of screen.getAllByRole("link")) expect(element).toHaveAccessibleName();
  });

  it("kontrola: pole bez etykiety jest wykrywane przez pomiar dostępności", () => {
    const { container } = render(<input type="text" />);
    expect(() => expectLabelledControlsAndImages(container)).toThrow();
  });

  it("zakazane zwroty odmowy i kody wewnętrzne nie trafiają do żadnego stanu", async () => {
    const zakazane = [["Brak dost", "ępu"], ["Nie masz upraw", "nień"]].map((c) => c.join(""));
    const teksty: string[] = [];

    api.mockReturnValueOnce(new Promise(() => undefined));
    const a = render(<PoProgramieWspolpraca />);
    teksty.push(a.container.textContent ?? "");
    a.unmount();

    const b = await renderUkonczony([NOWE, Z_ODPOWIEDZIA]);
    teksty.push(b.container.textContent ?? "");
    b.unmount();

    const c = await renderPrzedUkonczeniem();
    teksty.push(c.container.textContent ?? "");
    c.unmount();

    api.mockRejectedValueOnce(blad(403, "forbidden", "Odmowa."));
    const d = render(<PoProgramieWspolpraca />);
    await waitFor(() => expect(d.container.textContent).toContain("uczestników"));
    teksty.push(d.container.textContent ?? "");
    d.unmount();

    api.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const e = render(<PoProgramieWspolpraca />);
    await screen.findByRole("button", { name: "Spróbuj ponownie" });
    teksty.push(e.container.textContent ?? "");
    e.unmount();

    expect(teksty).toHaveLength(5);
    for (const tekst of teksty) {
      expect(tekst).not.toMatch(/\bH[0-9]{2}\b/);
      for (const zwrot of zakazane) expect(tekst).not.toContain(zwrot);
    }
  });
});

describe("PoProgramieWspolpraca — nagłówek ekranu z menu", () => {
  function sprawdzNazweEkranu() {
    const naglowki = screen.getAllByRole("heading", { level: 1 });
    expect(naglowki).toHaveLength(1);
    expect(naglowki[0]).toHaveTextContent(/^Po programie$/);
  }

  it("ładowanie, dane, program nieukończony, odmowa i błąd sieci mają ten sam nagłówek pierwszego stopnia", async () => {
    api.mockReturnValueOnce(new Promise(() => undefined));
    const a = render(<PoProgramieWspolpraca />);
    sprawdzNazweEkranu();
    a.unmount();

    const b = await renderUkonczony([NOWE]);
    sprawdzNazweEkranu();
    b.unmount();

    const c = await renderPrzedUkonczeniem();
    sprawdzNazweEkranu();
    c.unmount();

    api.mockRejectedValueOnce(blad(403, "forbidden", "Odmowa."));
    const d = render(<PoProgramieWspolpraca />);
    await waitFor(() => expect(d.container.textContent).toContain("uczestników"));
    sprawdzNazweEkranu();
    d.unmount();

    api.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const e = render(<PoProgramieWspolpraca />);
    await screen.findByRole("button", { name: "Spróbuj ponownie" });
    sprawdzNazweEkranu();
    e.unmount();
  });

  it("kontrola: nagłówek o innej nazwie jest wykrywany tym samym pomiarem", () => {
    render(<h1>Dalsza współpraca</h1>);
    expect(() => sprawdzNazweEkranu()).toThrow();
  });
});
