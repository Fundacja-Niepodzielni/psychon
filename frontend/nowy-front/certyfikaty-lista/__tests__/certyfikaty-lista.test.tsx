import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";
import { axeViolations } from "@/components/__tests__/axe-helper";

/**
 * Ekran „Certyfikaty” (`GET /admin/certificates`, unieważnienie
 * `POST /admin/certificates/{id}/revoke`): każdy stan ma ten sam korzeń
 * szablonu, a w każdym sprawdzamy nagłówek, przycisk główny (czy jest i czy
 * działa), zdanie wyjaśniające oraz dostępne nazwy wszystkich odnośników i
 * przycisków. Unieważnienie ma osobne testy na wspólnym oknie formularza
 * (`Dialog`, wariant „niebezpieczny”): brak sprawdzania w przeglądarce, błąd
 * długości z serwera przy polu, zapis, zapisano, błąd serwera, pytanie
 * o porzucenie wpisanych danych, fokus i to, że powód nie stoi w wierszu listy
 * (lista działa także bez pola powodu w odpowiedzi).
 */

const apiPaged = vi.fn();
const api = vi.fn();
const back = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back, refresh: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return {
    ...oryginal,
    apiPaged: (...args: unknown[]) => apiPaged(...args),
    api: (...args: unknown[]) => api(...args),
  };
});

const { ApiError } = await import("@/lib/api/klient");
const { CertyfikatyLista } = await import("../CertyfikatyLista");

const ADRES_LISTY = "/admin/certificates?page=1&per_page=25";
const POWOD = "Certyfikat wydany omyłkowo, osoba nie ukończyła warsztatu.";

/**
 * Wpisanie długiego powodu jednym wklejeniem (to samo zdarzenie wejścia co przy
 * pisaniu): kilkadziesiąt osobnych naciśnięć pod obciążeniem maszyny zajmowało
 * kilka sekund, a test przerwany limitem czasu dopisywał resztę znaków do pola
 * w następnym teście.
 */
async function wpiszPowod(pole: HTMLElement, tekst: string) {
  await userEvent.click(pole);
  await userEvent.paste(tekst);
}

function certyfikat(id: number, nadpisania: Record<string, unknown> = {}) {
  return {
    id,
    number: `NP/2026/0${id}`,
    issued_at: "2026-09-30T18:50:00Z",
    status: "valid",
    edition: "2026",
    user: { id: 100 + id, first_name: "Marta", last_name: `Demo${id}` },
    revoked_at: null,
    revoked_reason: null,
    revoked_by: null,
    ...nadpisania,
  };
}

function uniewazniony(id: number) {
  return certyfikat(id, {
    status: "revoked",
    revoked_at: "2026-10-01T09:15:00Z",
    revoked_reason: POWOD,
    revoked_by: 5,
  });
}

function odpowiedz(dane: unknown[], meta: Record<string, unknown> = {}) {
  return { data: dane, meta: { current_page: 1, per_page: 25, total: dane.length, last_page: 1, ...meta } };
}

function odmowa(status: number) {
  return new ApiError({ status, code: status === 401 ? "unauthenticated" : "forbidden", message: "Odmowa." });
}

function bladSerwera(status = 500) {
  return new ApiError({ status, code: "server_error", message: "Coś poszło nie tak. Spróbuj ponownie za chwilę." });
}

/** Ścieżki, które ekran woła przez `api`: odczyt konta dla ekranu odmowy i unieważnienie. */
function ustawApi(unieważnienie: (sciezka: string, opcje: unknown) => Promise<unknown> = () => new Promise(() => {})) {
  api.mockImplementation((sciezka: string, opcje: unknown) =>
    sciezka === "/me" ? Promise.resolve({ first_name: "Ola", role: "project_manager" }) : unieważnienie(sciezka, opcje),
  );
}

function sprawdzSzablon(container: HTMLElement) {
  expect(() => jedenMain(container)).not.toThrow();
  expect(container.querySelector("main")?.getAttribute("data-style-id")).toBe("szablon-lista");
}

function przyciskiGlowne(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button[class*='primary']"));
}

/** Nazwa dostępna elementu: etykieta ARIA, a bez niej widoczny napis. */
function nazwa(element: Element): string {
  return element.getAttribute("aria-label") ?? element.textContent?.trim() ?? "";
}

function nazwyPrzyciskow(): string[] {
  return screen.queryAllByRole("button").map(nazwa);
}

function nazwyOdnosnikow(): string[] {
  return screen.queryAllByRole("link").map(nazwa);
}

function tekstZdan(container: HTMLElement): string {
  return container.textContent ?? "";
}

beforeEach(() => {
  apiPaged.mockReset();
  api.mockReset();
  back.mockReset();
  ustawApi();
});

describe("Certyfikaty — stany", () => {
  it("ładowanie: szkielet w szablonie, nagłówek strony, zero wierszy i zero przycisku głównego", () => {
    apiPaged.mockReturnValue(new Promise(() => {}));
    const { container } = render(<CertyfikatyLista />);

    sprawdzSzablon(container);
    expect(screen.getByRole("heading", { level: 1, name: "Certyfikaty" })).toBeInTheDocument();
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    expect(przyciskiGlowne(container)).toHaveLength(0);
    expect(nazwyPrzyciskow()).toEqual(["Wstecz", "Filtruj"]);
    expect(nazwyOdnosnikow()).toEqual([]);
    expect(tekstZdan(container)).toContain("Wydane certyfikaty ukończenia programu i ich unieważnianie.");
  });

  it("błąd odpowiedzi serwera: tytuł, zdanie serwera (jak na starym ekranie), przycisk „Spróbuj ponownie” i ponowny odczyt", async () => {
    apiPaged.mockRejectedValueOnce(bladSerwera()).mockResolvedValue(odpowiedz([certyfikat(17)]));
    const { container } = render(<CertyfikatyLista />);

    expect(await screen.findByRole("heading", { level: 3, name: "Nie udało się wczytać listy certyfikatów" })).toBeInTheDocument();
    sprawdzSzablon(container);
    expect(screen.getByRole("alert")).toHaveTextContent("Coś poszło nie tak. Spróbuj ponownie za chwilę.");
    expect(screen.getByRole("alert")).not.toHaveTextContent("Serwer nie odpowiedział poprawnie.");
    expect(screen.queryByText("Brak połączenia z serwerem")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    expect(przyciskiGlowne(container)).toHaveLength(0);
    expect(nazwyPrzyciskow()).toEqual(["Wstecz", "Filtruj", "Spróbuj ponownie"]);
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeEnabled();
    expect(nazwyOdnosnikow()).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    await screen.findByText("NP/2026/017");
    expect(apiPaged).toHaveBeenCalledTimes(2);
    expect(apiPaged).toHaveBeenLastCalledWith(ADRES_LISTY);
  });

  it("błąd odpowiedzi serwera bez zdania: zdanie zastępcze ekranu", async () => {
    apiPaged.mockRejectedValue(new ApiError({ status: 502, code: "bad_gateway", message: "" }));
    render(<CertyfikatyLista />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Serwer nie odpowiedział poprawnie. Spróbuj ponownie za chwilę.");
  });

  it("brak połączenia: osobny tytuł i zdanie o internecie, ten sam przycisk ponowienia", async () => {
    apiPaged.mockRejectedValue(new TypeError("Failed to fetch"));
    const { container } = render(<CertyfikatyLista />);

    expect(await screen.findByRole("heading", { level: 3, name: "Brak połączenia z serwerem" })).toBeInTheDocument();
    sprawdzSzablon(container);
    expect(screen.getByRole("alert")).toHaveTextContent("Sprawdź połączenie z internetem i spróbuj jeszcze raz.");
    expect(screen.queryByText("Nie udało się wczytać listy certyfikatów")).toBeNull();
    expect(przyciskiGlowne(container)).toHaveLength(0);
    expect(nazwyPrzyciskow()).toEqual(["Wstecz", "Filtruj", "Spróbuj ponownie"]);
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeEnabled();
  });

  it.each([401, 403])("brak dostępu (%i): wspólny ekran odmowy, zdanie o roli, jeden przycisk „Wróć”, zero rekordów", async (status) => {
    apiPaged.mockRejectedValue(odmowa(status));
    const { container } = render(<CertyfikatyLista />);

    expect(await screen.findByRole("heading", { level: 2, name: "Nie masz dostępu do tego ekranu" })).toBeInTheDocument();
    sprawdzSzablon(container);
    await waitFor(() => expect(tekstZdan(container)).toContain("Twoja rola: Opiekun Projektu."));
    expect(tekstZdan(container)).toContain("Ten ekran jest dla administracji.");
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.queryByText(/NP\/2026/)).toBeNull();
    expect(nazwyPrzyciskow()).toEqual(["Wstecz", "Wróć"]);
    expect(nazwyOdnosnikow()).toEqual([]);
    expect(przyciskiGlowne(container)).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Wróć" })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Wróć" }));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("pusta lista: nagłówek, zdanie wyjaśniające i przycisk ponownego wczytania", async () => {
    apiPaged.mockResolvedValue(odpowiedz([]));
    const { container } = render(<CertyfikatyLista />);

    expect(await screen.findByRole("heading", { level: 2, name: "Nie wydano jeszcze certyfikatów" })).toBeInTheDocument();
    sprawdzSzablon(container);
    expect(tekstZdan(container)).toContain("Certyfikat pojawi się tu, gdy osoba spełni warunki ukończenia programu.");
    expect(tekstZdan(container)).toContain("Razem: 0 certyfikatów.");
    expect(screen.queryByRole("table")).toBeNull();
    expect(nazwyPrzyciskow()).toEqual(["Wstecz", "Filtruj", "Wczytaj listę ponownie"]);
    expect(screen.getByRole("button", { name: "Wczytaj listę ponownie" })).toBeEnabled();
    expect(przyciskiGlowne(container)).toHaveLength(0);

    apiPaged.mockResolvedValue(odpowiedz([certyfikat(17)]));
    await userEvent.click(screen.getByRole("button", { name: "Wczytaj listę ponownie" }));
    await screen.findByText("NP/2026/017");
    expect(apiPaged).toHaveBeenCalledTimes(2);
  });

  it("lista: wiersze z nazwą jako odnośnikiem do karty osoby, stanem słowami i akcjami przy certyfikacie", async () => {
    apiPaged.mockResolvedValue(odpowiedz([certyfikat(17), uniewazniony(18), certyfikat(19, { user: null, edition: null })], { total: 3 }));
    const { container } = render(<CertyfikatyLista />);

    await screen.findByText("NP/2026/017");
    sprawdzSzablon(container);
    expect(screen.getByRole("heading", { level: 2, name: "Lista certyfikatów" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Lista certyfikatów" })).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map((naglowek) => naglowek.textContent)).toEqual([
      "Osoba",
      "Numer",
      "Rok programu",
      "Wydano",
      "Stan",
      "Akcje",
    ]);

    const odnosniki = screen.getAllByRole("link");
    expect(odnosniki.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Marta Demo17", "/admin/uczestniczki/117"],
      ["Marta Demo18", "/admin/uczestniczki/118"],
    ]);

    const [pierwszy, drugi, trzeci] = Array.from(container.querySelectorAll<HTMLElement>('[role="row"][data-wiersz]'));
    expect(pierwszy).toHaveTextContent("NP/2026/017");
    expect(pierwszy).toHaveTextContent("30 września 2026, 20:50");
    expect(pierwszy).toHaveTextContent("ważny");
    expect(within(pierwszy).getByRole("button", { name: "Unieważnij certyfikat NP/2026/017" })).toHaveTextContent("Unieważnij");
    expect(drugi).toHaveTextContent("unieważniony");
    expect(within(drugi).queryByRole("button", { name: /^Unieważnij certyfikat/ })).toBeNull();
    // Brak osoby i roku programu to myślnik, nie pusta komórka ani „null”.
    expect(trzeci).toHaveTextContent("—");
    expect(container.textContent).not.toMatch(/null|undefined/);
    // Żadnego technicznego zapisu daty ani kodu stanu.
    expect(container.textContent).not.toMatch(/2026-09-30T|\bvalid\b|\brevoked\b/);

    expect(nazwyPrzyciskow()).toEqual([
      "Wstecz",
      "Filtruj",
      "Szczegóły: certyfikat NP/2026/017",
      "Unieważnij certyfikat NP/2026/017",
      "Szczegóły: certyfikat NP/2026/018",
      "Szczegóły: certyfikat NP/2026/019",
      "Unieważnij certyfikat NP/2026/019",
    ]);
    expect(przyciskiGlowne(container)).toHaveLength(0);
    expect(apiPaged).toHaveBeenCalledTimes(1);
    expect(apiPaged).toHaveBeenCalledWith(ADRES_LISTY);
  });

  it("licznik w nagłówku odmienia „certyfikat” po liczbie", async () => {
    for (const [liczba, zdanie] of [
      [1, "Razem: 1 certyfikat."],
      [2, "Razem: 2 certyfikaty."],
      [5, "Razem: 5 certyfikatów."],
      [12, "Razem: 12 certyfikatów."],
      [22, "Razem: 22 certyfikaty."],
    ] as const) {
      apiPaged.mockResolvedValue(odpowiedz([certyfikat(17)], { total: liczba }));
      const { container, unmount } = render(<CertyfikatyLista />);
      await screen.findByText("NP/2026/017");
      expect(tekstZdan(container)).toContain(zdanie);
      unmount();
    }
  });

  it("kilka stron: stronicowanie „Strona 1 z 3”, „Poprzednia” wyłączona, „Następna” prosi o drugą stronę", async () => {
    apiPaged.mockResolvedValue(odpowiedz([certyfikat(17)], { total: 60, last_page: 3 }));
    const { container } = render(<CertyfikatyLista />);

    await screen.findByText("NP/2026/017");
    expect(tekstZdan(container)).toContain("Razem: 60 certyfikatów.");
    const stronicowanie = screen.getByRole("navigation", { name: "Stronicowanie" });
    expect(within(stronicowanie).getByText("Strona 1 z 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Poprzednia" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Następna" })).toBeEnabled();

    apiPaged.mockResolvedValue(odpowiedz([certyfikat(20)], { total: 60, last_page: 3, current_page: 2 }));
    await userEvent.click(screen.getByRole("button", { name: "Następna" }));
    await screen.findByText("NP/2026/020");
    expect(apiPaged).toHaveBeenLastCalledWith("/admin/certificates?page=2&per_page=25");
    expect(within(screen.getByRole("navigation", { name: "Stronicowanie" })).getByText("Strona 2 z 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Poprzednia" })).toBeEnabled();
  });

  it("jedna strona: stronicowania nie ma", async () => {
    apiPaged.mockResolvedValue(odpowiedz([certyfikat(17)]));
    render(<CertyfikatyLista />);
    await screen.findByText("NP/2026/017");
    expect(screen.queryByRole("navigation", { name: "Stronicowanie" })).toBeNull();
  });
});

describe("Certyfikaty — filtr", () => {
  it("filtr dopisuje do żądania numer i osobę po przycięciu, a bez filtra adres jest taki jak na starym ekranie", async () => {
    apiPaged.mockResolvedValue(odpowiedz([certyfikat(17)]));
    render(<CertyfikatyLista />);
    await screen.findByText("NP/2026/017");
    expect(apiPaged).toHaveBeenLastCalledWith("/admin/certificates?page=1&per_page=25");

    await userEvent.type(screen.getByRole("textbox", { name: "Numer certyfikatu" }), "  NP/2026/017 ");
    await userEvent.type(screen.getByRole("textbox", { name: "Osoba" }), " marta ");
    await userEvent.click(screen.getByRole("button", { name: "Filtruj" }));

    await waitFor(() => expect(apiPaged).toHaveBeenCalledTimes(2));
    expect(apiPaged).toHaveBeenLastCalledWith("/admin/certificates?page=1&per_page=25&number=NP%2F2026%2F017&person=marta");
    expect(screen.getByRole("button", { name: "Wyczyść filtr" })).toBeEnabled();
  });

  it("filtr bez wyników: nagłówek, zdanie i droga z powrotem do wszystkich certyfikatów", async () => {
    apiPaged.mockResolvedValueOnce(odpowiedz([certyfikat(17)])).mockResolvedValueOnce(odpowiedz([], { total: 0 }));
    const { container } = render(<CertyfikatyLista />);
    await screen.findByText("NP/2026/017");

    await userEvent.type(screen.getByRole("textbox", { name: "Osoba" }), "nikt");
    await userEvent.click(screen.getByRole("button", { name: "Filtruj" }));

    expect(await screen.findByRole("heading", { level: 2, name: "Brak certyfikatów spełniających filtr" })).toBeInTheDocument();
    sprawdzSzablon(container);
    expect(tekstZdan(container)).toContain("Zmień numer albo osobę, albo wróć do wszystkich certyfikatów.");
    expect(tekstZdan(container)).toContain("Pasujące do filtra: 0 certyfikatów.");
    expect(screen.queryByRole("table")).toBeNull();
    expect(nazwyPrzyciskow()).toEqual(["Wstecz", "Filtruj", "Wyczyść filtr", "Pokaż wszystkie certyfikaty"]);
    expect(screen.getByRole("button", { name: "Pokaż wszystkie certyfikaty" })).toBeEnabled();
    expect(przyciskiGlowne(container)).toHaveLength(0);

    apiPaged.mockResolvedValue(odpowiedz([certyfikat(17)]));
    await userEvent.click(screen.getByRole("button", { name: "Pokaż wszystkie certyfikaty" }));
    await screen.findByText("NP/2026/017");
    expect(apiPaged).toHaveBeenLastCalledWith(ADRES_LISTY);
    expect(screen.getByRole("textbox", { name: "Osoba" })).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Wyczyść filtr" })).toBeNull();
  });
});

describe("Certyfikaty — szczegóły", () => {
  it("powód unieważnienia nie stoi w wierszu; pokazuje go dopiero panel szczegółów tego certyfikatu, bez nowego żądania", async () => {
    apiPaged.mockResolvedValue(odpowiedz([certyfikat(17), uniewazniony(18)], { total: 2 }));
    const { container } = render(<CertyfikatyLista />);
    await screen.findByText("NP/2026/017");

    expect(container.textContent).not.toContain(POWOD);
    expect(screen.queryByText(/Powód unieważnienia/)).toBeNull();

    const przycisk = screen.getByRole("button", { name: "Szczegóły: certyfikat NP/2026/018" });
    expect(przycisk).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(przycisk);

    expect(przycisk).toHaveAttribute("aria-expanded", "true");
    expect(przycisk).toHaveTextContent("Ukryj szczegóły");
    expect(screen.getByRole("button", { name: "Ukryj szczegóły: certyfikat NP/2026/018" })).toBe(przycisk);
    expect(screen.getByRole("heading", { level: 3, name: "Szczegóły certyfikatu NP/2026/018" })).toBeInTheDocument();
    const panel = document.getElementById(przycisk.getAttribute("aria-controls") ?? "");
    expect(panel).not.toBeNull();
    expect(panel).toHaveTextContent(POWOD);
    expect(panel).toHaveTextContent("Unieważniono1 października 2026, 11:15");
    expect(panel).toHaveTextContent("Wydano30 września 2026, 20:50");
    expect(panel).toHaveTextContent("Rok programu2026");
    expect(panel).toHaveTextContent("Stanunieważniony");
    expect(apiPaged).toHaveBeenCalledTimes(1);
    expect(api).not.toHaveBeenCalledWith(expect.stringContaining("/admin/certificates"), expect.anything());

    await userEvent.click(przycisk);
    expect(container.textContent).not.toContain(POWOD);
    expect(przycisk).toHaveAttribute("aria-expanded", "false");
  });

  it("odpowiedź listy bez pola powodu: lista działa, szczegóły unieważnionego mają datę unieważnienia, ale bez wiersza powodu", async () => {
    const bezPowodu = (wpis: Record<string, unknown>) => {
      const kopia = { ...wpis };
      delete kopia.revoked_reason;
      return kopia;
    };
    apiPaged.mockResolvedValue(odpowiedz([bezPowodu(certyfikat(17)), bezPowodu(uniewazniony(18))], { total: 2 }));
    const { container } = render(<CertyfikatyLista />);
    await screen.findByText("NP/2026/017");

    const [pierwszy, drugi] = Array.from(container.querySelectorAll<HTMLElement>('[role="row"][data-wiersz]'));
    expect(pierwszy).toHaveTextContent("ważny");
    expect(drugi).toHaveTextContent("unieważniony");
    expect(within(pierwszy).getByRole("button", { name: "Unieważnij certyfikat NP/2026/017" })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Szczegóły: certyfikat NP/2026/018" }));
    const panel = document.getElementById(
      screen.getByRole("button", { name: "Ukryj szczegóły: certyfikat NP/2026/018" }).getAttribute("aria-controls") ?? "",
    );
    expect(panel).toHaveTextContent("Unieważniono1 października 2026, 11:15");
    expect(panel).not.toHaveTextContent("Powód unieważnienia");
    expect(container.textContent).not.toMatch(/null|undefined/);
    expect((await axeViolations(container)).map((naruszenie) => naruszenie.id)).toEqual([]);
  });

  it("szczegóły ważnego certyfikatu nie mają wierszy o unieważnieniu", async () => {
    apiPaged.mockResolvedValue(odpowiedz([certyfikat(17)]));
    render(<CertyfikatyLista />);
    await screen.findByText("NP/2026/017");

    await userEvent.click(screen.getByRole("button", { name: "Szczegóły: certyfikat NP/2026/017" }));
    expect(screen.getByRole("heading", { level: 3, name: "Szczegóły certyfikatu NP/2026/017" })).toBeInTheDocument();
    expect(screen.queryByText("Unieważniono")).toBeNull();
    expect(screen.queryByText("Powód unieważnienia")).toBeNull();
  });
});

describe("Certyfikaty — unieważnienie (wspólne okno formularza)", () => {
  const TYTUL_OKNA = "Unieważnić certyfikat?";
  const TYTUL_BLEDOW = "Certyfikat nie został unieważniony";

  async function otworzOkno() {
    apiPaged.mockResolvedValue(odpowiedz([certyfikat(17)]));
    const wynik = render(<CertyfikatyLista />);
    await screen.findByText("NP/2026/017");
    const wywolujacy = screen.getByRole("button", { name: "Unieważnij certyfikat NP/2026/017" });
    await userEvent.click(wywolujacy);
    return { ...wynik, wywolujacy, okno: screen.getByRole("dialog", { name: TYTUL_OKNA }) };
  }

  function bladDlugosci() {
    return new ApiError({
      status: 422,
      code: "validation_failed",
      message: "Popraw zaznaczone pola.",
      errors: { reason: ["Powód musi mieć co najmniej 10 znaków."] },
    });
  }

  const wywolaniaUniewaznienia = () => api.mock.calls.filter(([sciezka]) => String(sciezka).endsWith("/revoke"));

  it("okno: nagłówek, opis z numerem i osobą, pole powodu z podpowiedzią o 10 znakach i zdrowiu; fokus na polu", async () => {
    const { okno } = await otworzOkno();

    expect(okno).toHaveAttribute("aria-modal", "true");
    expect(okno).toHaveAttribute("data-wariant", "formularz");
    expect(within(okno).getByRole("heading", { level: 2, name: TYTUL_OKNA })).toBeInTheDocument();
    expect(okno).toHaveTextContent("Certyfikat NP/2026/017, Marta Demo17.");
    expect(okno).toHaveTextContent("Unieważnienia nie da się cofnąć.");
    const pole = within(okno).getByRole("textbox", { name: /Powód unieważnienia/ });
    expect(document.activeElement).toBe(pole);
    expect(pole).toBeRequired();
    expect(pole).toHaveAccessibleDescription("Co najmniej 10 znaków. Pisz rzeczowo, bez informacji o zdrowiu.");
    expect(wywolaniaUniewaznienia()).toHaveLength(0);
  });

  it("wariant „niebezpieczny”: „Anuluj” jest przyciskiem głównym, „Unieważnij certyfikat” obrysowanym w barwie błędu, oba dostępne", async () => {
    const { okno, container } = await otworzOkno();

    expect(within(okno).getAllByRole("button").map(nazwa)).toEqual(["Anuluj", "Unieważnij certyfikat"]);
    const anuluj = within(okno).getByRole("button", { name: "Anuluj" });
    const potwierdz = within(okno).getByRole("button", { name: "Unieważnij certyfikat" });
    expect(przyciskiGlowne(container)).toEqual([anuluj]);
    expect(anuluj).toBeEnabled();
    expect(potwierdz.className).toMatch(/outline/);
    expect(potwierdz.className).toMatch(/niebezpieczny/);
    expect(potwierdz).not.toHaveAttribute("aria-disabled");
  });

  it("Tab i Shift+Tab krążą wyłącznie po oknie", async () => {
    const { okno } = await otworzOkno();
    const pole = within(okno).getByRole("textbox");
    expect(document.activeElement).toBe(pole);

    await userEvent.tab();
    expect(document.activeElement).toBe(within(okno).getByRole("button", { name: "Anuluj" }));
    await userEvent.tab();
    expect(document.activeElement).toBe(within(okno).getByRole("button", { name: "Unieważnij certyfikat" }));
    await userEvent.tab();
    expect(document.activeElement).toBe(pole);
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(within(okno).getByRole("button", { name: "Unieważnij certyfikat" }));
  });

  it("bez sprawdzania w przeglądarce: pusty powód idzie do serwera, a błąd długości z serwera staje przy polu i w podsumowaniu", async () => {
    ustawApi(() => Promise.reject(bladDlugosci()));
    const { okno } = await otworzOkno();

    await userEvent.click(within(okno).getByRole("button", { name: "Unieważnij certyfikat" }));

    expect(wywolaniaUniewaznienia()).toEqual([["/admin/certificates/17/revoke", { method: "POST", body: { reason: "" } }]]);
    const podsumowanie = await within(okno).findByRole("group", { name: TYTUL_BLEDOW });
    expect(document.activeElement).toBe(podsumowanie);
    expect(within(podsumowanie).getByRole("link", { name: "Powód musi mieć co najmniej 10 znaków." })).toHaveAttribute(
      "href",
      "#uniewaznienie-powod",
    );
    const pole = within(okno).getByRole("textbox");
    expect(pole).toHaveAccessibleDescription(/Powód musi mieć co najmniej 10 znaków\./);
    expect(pole).toBeInvalid();
    expect(okno).not.toHaveTextContent("Podaj powód unieważnienia.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("błąd długości z serwera: wpisany powód zostaje, odnośnik w podsumowaniu prowadzi do pola, przycisk znów działa", async () => {
    ustawApi(() => Promise.reject(bladDlugosci()));
    const { okno } = await otworzOkno();

    await userEvent.type(within(okno).getByRole("textbox"), "za krótki");
    await userEvent.click(within(okno).getByRole("button", { name: "Unieważnij certyfikat" }));

    const podsumowanie = await within(okno).findByRole("group", { name: TYTUL_BLEDOW });
    expect(within(okno).getByRole("textbox")).toHaveValue("za krótki");
    expect(wywolaniaUniewaznienia()[0][1]).toEqual({ method: "POST", body: { reason: "za krótki" } });
    await userEvent.click(within(podsumowanie).getByRole("link"));
    expect(document.activeElement).toBe(within(okno).getByRole("textbox"));
    expect(within(okno).getByRole("button", { name: "Unieważnij certyfikat" })).not.toHaveAttribute("aria-disabled");
  });

  it("zapisywanie: „Zapisywanie…” niedostępne, „Anuluj” nadal przyciskiem głównym i nie jest wyłączony; drugie kliknięcie, „Anuluj” i Escape nic nie robią", async () => {
    let zakoncz: (wartosc: unknown) => void = () => {};
    ustawApi(
      () =>
        new Promise((rozwiaz) => {
          zakoncz = rozwiaz;
        }),
    );
    const { okno, container } = await otworzOkno();

    await wpiszPowod(within(okno).getByRole("textbox"), POWOD);
    await userEvent.click(within(okno).getByRole("button", { name: "Unieważnij certyfikat" }));

    const potwierdzenie = within(okno).getByRole("button", { name: "Zapisywanie…" });
    expect(potwierdzenie).toHaveAttribute("aria-disabled", "true");
    expect(okno).toHaveAttribute("aria-busy", "true");
    const anuluj = within(okno).getByRole("button", { name: "Anuluj" });
    expect(przyciskiGlowne(container)).toEqual([anuluj]);
    expect(anuluj).toBeEnabled();

    await userEvent.click(potwierdzenie);
    await userEvent.click(anuluj);
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(wywolaniaUniewaznienia()).toHaveLength(1);

    zakoncz(uniewazniony(17));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("zapisano: ciało żądania ma tylko przycięty powód, okno się zamyka, wspólny pasek potwierdzenia, lista wczytuje się od nowa, fokus na szczegółach", async () => {
    ustawApi(() => Promise.resolve(uniewazniony(17)));
    const { container, okno } = await otworzOkno();
    apiPaged.mockResolvedValue(odpowiedz([uniewazniony(17)]));

    await wpiszPowod(within(okno).getByRole("textbox", { name: /Powód unieważnienia/ }), `  ${POWOD}  `);
    await userEvent.click(within(okno).getByRole("button", { name: "Unieważnij certyfikat" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api).toHaveBeenCalledWith("/admin/certificates/17/revoke", { method: "POST", body: { reason: POWOD } });
    expect(wywolaniaUniewaznienia()).toHaveLength(1);

    const komunikat = screen.getByText("Certyfikat NP/2026/017 jest teraz unieważniony.").closest<HTMLElement>('[role="status"]');
    expect(komunikat).not.toBeNull();
    expect(within(komunikat as HTMLElement).getByRole("button", { name: "Zamknij powiadomienie" })).toBeEnabled();
    // Pasek stoi jak na karcie osoby: obok szablonu, nie w formularzu filtra.
    expect(within(screen.getByRole("form", { name: "Filtr certyfikatów" })).queryByRole("status")).toBeNull();

    await waitFor(() => expect(apiPaged).toHaveBeenCalledTimes(2));
    expect(apiPaged).toHaveBeenLastCalledWith(ADRES_LISTY);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Unieważnij certyfikat NP/2026/017" })).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Szczegóły: certyfikat NP/2026/017" }));
    // Po odświeżeniu stan jest słowami, a powód nadal tylko w szczegółach.
    expect(container.querySelector('[data-wiersz="17"]')).toHaveTextContent("unieważniony");
    expect(container.textContent).not.toContain(POWOD);
    expect((await axeViolations(container)).map((naruszenie) => naruszenie.id)).toEqual([]);
  });

  it("pasek potwierdzenia zamyka się przyciskiem „Zamknij powiadomienie”", async () => {
    ustawApi(() => Promise.resolve(uniewazniony(17)));
    const { okno } = await otworzOkno();
    apiPaged.mockResolvedValue(odpowiedz([uniewazniony(17)]));
    await wpiszPowod(within(okno).getByRole("textbox"), POWOD);
    await userEvent.click(within(okno).getByRole("button", { name: "Unieważnij certyfikat" }));
    await screen.findByText("Certyfikat NP/2026/017 jest teraz unieważniony.");

    await userEvent.click(screen.getByRole("button", { name: "Zamknij powiadomienie" }));
    expect(screen.queryByText(/jest teraz unieważniony/)).toBeNull();
  });

  it("błąd serwera: zdanie serwera w podsumowaniu okna z fokusem, okno zostaje, przycisk znów działa, lista bez odświeżenia", async () => {
    ustawApi(() => Promise.reject(bladSerwera()));
    const { okno } = await otworzOkno();

    await wpiszPowod(within(okno).getByRole("textbox"), POWOD);
    await userEvent.click(within(okno).getByRole("button", { name: "Unieważnij certyfikat" }));

    const podsumowanie = await within(okno).findByRole("group", { name: TYTUL_BLEDOW });
    expect(document.activeElement).toBe(podsumowanie);
    expect(podsumowanie).toHaveTextContent("Coś poszło nie tak. Spróbuj ponownie za chwilę.");
    expect(within(podsumowanie).queryByRole("link")).toBeNull();
    expect(within(okno).getByRole("textbox")).not.toBeInvalid();
    expect(within(okno).getByRole("button", { name: "Unieważnij certyfikat" })).not.toHaveAttribute("aria-disabled");
    expect(within(okno).getByRole("button", { name: "Anuluj" })).toBeEnabled();
    expect(within(okno).getByRole("textbox")).toHaveValue(POWOD);
    expect(apiPaged).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/jest teraz unieważniony/)).toBeNull();
  });

  it("błąd bez odpowiedzi serwera: zdanie o połączeniu w podsumowaniu okna", async () => {
    ustawApi(() => Promise.reject(new TypeError("Failed to fetch")));
    const { okno } = await otworzOkno();

    await wpiszPowod(within(okno).getByRole("textbox"), POWOD);
    await userEvent.click(within(okno).getByRole("button", { name: "Unieważnij certyfikat" }));

    expect(await within(okno).findByRole("group", { name: TYTUL_BLEDOW })).toHaveTextContent(
      "Nie udało się unieważnić certyfikatu. Sprawdź połączenie z internetem i spróbuj jeszcze raz.",
    );
  });

  it("„Anuluj” i Escape przy pustym polu zamykają okno bez żądania i oddają fokus przyciskowi „Unieważnij”", async () => {
    const { wywolujacy, okno } = await otworzOkno();

    await userEvent.click(within(okno).getByRole("button", { name: "Anuluj" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(wywolujacy);

    await userEvent.click(wywolujacy);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(wywolujacy);
    expect(wywolaniaUniewaznienia()).toHaveLength(0);
    expect(screen.queryByText(/jest teraz unieważniony/)).toBeNull();
  });

  it("Escape z wpisanym powodem pyta „Porzucić wpisane dane?”; „Wróć do formularza” zostawia powód, „Porzuć” zamyka bez żądania", async () => {
    const { okno, wywolujacy } = await otworzOkno();
    await userEvent.type(within(okno).getByRole("textbox"), "Wydany omyłkowo");

    await userEvent.keyboard("{Escape}");
    const pytanie = within(okno).getByRole("group", { name: "Porzucić wpisane dane?" });
    await userEvent.click(within(pytanie).getByRole("button", { name: "Wróć do formularza" }));
    expect(within(okno).queryByRole("group", { name: "Porzucić wpisane dane?" })).toBeNull();
    expect(within(okno).getByRole("textbox")).toHaveValue("Wydany omyłkowo");

    await userEvent.keyboard("{Escape}");
    await userEvent.click(within(okno).getByRole("button", { name: "Porzuć" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(wywolujacy);
    expect(wywolaniaUniewaznienia()).toHaveLength(0);
  });

  it("ponowne otwarcie okna czyści powód i poprzedni komunikat o sukcesie", async () => {
    ustawApi(() => Promise.resolve(uniewazniony(17)));
    apiPaged.mockResolvedValue(odpowiedz([certyfikat(17), certyfikat(18)], { total: 2 }));
    render(<CertyfikatyLista />);
    await screen.findByText("NP/2026/017");

    await userEvent.click(screen.getByRole("button", { name: "Unieważnij certyfikat NP/2026/017" }));
    await wpiszPowod(screen.getByRole("textbox", { name: /Powód unieważnienia/ }), POWOD);
    apiPaged.mockResolvedValue(odpowiedz([uniewazniony(17), certyfikat(18)], { total: 2 }));
    await userEvent.click(screen.getByRole("button", { name: "Unieważnij certyfikat" }));
    await screen.findByText("Certyfikat NP/2026/017 jest teraz unieważniony.");

    await userEvent.click(await screen.findByRole("button", { name: "Unieważnij certyfikat NP/2026/018" }));
    expect(screen.getByRole("textbox", { name: /Powód unieważnienia/ })).toHaveValue("");
    expect(screen.queryByText(/jest teraz unieważniony/)).toBeNull();
  });
});

describe("Certyfikaty — automatyczna kontrola dostępności", () => {
  it("lista ze szczegółami otwartego, unieważnionego certyfikatu nie ma naruszeń axe", async () => {
    apiPaged.mockResolvedValue(odpowiedz([certyfikat(17), uniewazniony(18)], { total: 2, last_page: 2 }));
    const { container } = render(<CertyfikatyLista />);
    await screen.findByText("NP/2026/017");
    await userEvent.click(screen.getByRole("button", { name: "Szczegóły: certyfikat NP/2026/018" }));

    expect((await axeViolations(container)).map((naruszenie) => naruszenie.id)).toEqual([]);
  });

  it("otwarte okno unieważnienia z błędem pola z serwera nie ma naruszeń axe", async () => {
    ustawApi(() =>
      Promise.reject(
        new ApiError({
          status: 422,
          code: "validation_failed",
          message: "Popraw zaznaczone pola.",
          errors: { reason: ["Powód musi mieć co najmniej 10 znaków."] },
        }),
      ),
    );
    apiPaged.mockResolvedValue(odpowiedz([certyfikat(17)]));
    const { container } = render(<CertyfikatyLista />);
    await screen.findByText("NP/2026/017");
    await userEvent.click(screen.getByRole("button", { name: "Unieważnij certyfikat NP/2026/017" }));
    await userEvent.click(screen.getByRole("button", { name: "Unieważnij certyfikat" }));
    await screen.findByRole("group", { name: "Certyfikat nie został unieważniony" });

    expect((await axeViolations(container)).map((naruszenie) => naruszenie.id)).toEqual([]);
  });

  it.each(["brak dostępu", "filtr bez wyników", "błąd"])("stan „%s” nie ma naruszeń axe", async (stanEkranu) => {
    if (stanEkranu === "brak dostępu") apiPaged.mockRejectedValue(odmowa(403));
    if (stanEkranu === "błąd") apiPaged.mockRejectedValue(bladSerwera());
    if (stanEkranu === "filtr bez wyników") apiPaged.mockResolvedValueOnce(odpowiedz([certyfikat(17)])).mockResolvedValue(odpowiedz([]));
    const { container } = render(<CertyfikatyLista />);
    if (stanEkranu === "filtr bez wyników") {
      await screen.findByText("NP/2026/017");
      await userEvent.type(screen.getByRole("textbox", { name: "Osoba" }), "nikt");
      await userEvent.click(screen.getByRole("button", { name: "Filtruj" }));
    }
    await screen.findByRole("heading", { level: stanEkranu === "błąd" ? 3 : 2 });

    expect((await axeViolations(container)).map((naruszenie) => naruszenie.id)).toEqual([]);
  });
});
