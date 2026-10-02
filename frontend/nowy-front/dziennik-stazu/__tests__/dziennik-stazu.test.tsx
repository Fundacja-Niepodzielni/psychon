import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";
import { brakujaceKlucze, kluczeMetaZOpenApi, kluczeZasobu } from "../../staz-kolejka/__tests__/zrodla-ekranu";

/**
 * Dziennik stażu (`DziennikStazu`) na szablonie `ListTemplate`. Każdy stan ma
 * swój test: nagłówek, przycisk główny (i czy działa), zdanie wyjaśniające,
 * tekst stanu, nazwy dostępne, etykiety pól i komunikaty błędów:
 * ładowanie, błąd serwera, brak połączenia, brak dostępu (wspólny ekran
 * odmowy), wygasły dostęp, nie znaleziono, pusty dziennik, lista z wpisami
 * w każdym stanie, dodawanie (błędy pól, zapisywanie, zapisano) i wpis
 * odesłany do poprawy. Atrapy mają klucze zasobu PHP i `openapi.json`.
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
const { DziennikStazu } = await import("../DziennikStazu");

const ZASOB = "backend/app/Http/Resources/H11/InternshipEntryResource.php";
const KONTO = { id: 17, first_name: "Marta", last_name: "Demo", email: "marta@demo.pl", role: "volunteer" };

function wpis(id: number, nadpisz: Record<string, unknown> = {}) {
  return {
    id,
    date: "2026-08-27",
    hours: "3.5",
    form: "phone_duty",
    consultations_count: 4,
    description: "Dyżur telefoniczny — bez danych osób.",
    status: "submitted",
    review_comment: null,
    decided_at: null,
    created_at: "2026-08-27T18:00:00Z",
    updated_at: "2026-08-27T18:00:00Z",
    ...nadpisz,
  };
}

function meta(total: number, nadpisz: Record<string, unknown> = {}) {
  return {
    current_page: 1,
    per_page: 25,
    total,
    last_page: 1,
    extra: { accepted_hours: "41.5", required_hours: "72" },
    ...nadpisz,
  };
}

/** Wpisy w każdym z czterech stanów — kolejność jak z serwera (od najnowszej daty). */
const WPISY_WE_WSZYSTKICH_STANACH = [
  wpis(91),
  wpis(92, {
    date: "2026-08-24",
    hours: "2",
    form: "chat_duty",
    consultations_count: 1,
    status: "accepted",
    decided_at: "2026-08-25T10:00:00Z",
  }),
  wpis(93, {
    date: "2026-08-20",
    hours: "4",
    form: "other",
    consultations_count: 0,
    description: null,
    status: "returned",
    review_comment: "Uzupełnij opis dyżuru.",
    decided_at: "2026-08-21T10:00:00Z",
  }),
  wpis(94, {
    date: "2026-08-15",
    hours: "1.5",
    consultations_count: 2,
    status: "rejected",
    review_comment: "Ten dyżur jest już w dzienniku.",
    decided_at: "2026-08-16T10:00:00Z",
  }),
];

function blad(status: number, code: string, message: string, errors?: Record<string, string[]>) {
  return new ApiError({ status, code, message, errors });
}

/** Atrapa transportu: `/me` dla ekranu odmowy, zapisy wpisów z kolejki `zapisy`. */
const zapisy: Array<() => Promise<unknown>> = [];

function dopiszZapis(wynik: unknown) {
  zapisy.push(() => (wynik instanceof Error ? Promise.reject(wynik) : Promise.resolve(wynik)));
}

function wywolaniaZapisu() {
  return api.mock.calls.filter(([sciezka]) => String(sciezka).startsWith("/internship/entries"));
}

function przyciskiGlowne() {
  return Array.from(document.querySelectorAll("button")).filter((b) =>
    b.className.split(/\s+/).some((klasa) => /(^|_)primary(_|$)/.test(klasa)),
  );
}

function wiersz(data: string) {
  return screen.getByText(data, { selector: "p" }).closest("[data-wiersz]") as HTMLElement;
}

/** Komórka wiersza pod nagłówkiem kolumny o podanej nazwie. */
function komorka(wierszListy: HTMLElement, kolumna: string): HTMLElement {
  const naglowki = within(screen.getByRole("table", { name: "Twoje wpisy" })).getAllByRole("columnheader");
  const indeks = naglowki.findIndex((naglowek) => naglowek.textContent === kolumna);
  expect(indeks, `kolumna „${kolumna}”`).toBeGreaterThanOrEqual(0);
  return within(wierszListy).getAllByRole("cell")[indeks];
}

function sprawdzSzablon(container: HTMLElement) {
  expect(() => jedenMain(container)).not.toThrow();
  expect(container.querySelector("main")!.getAttribute("data-style-id")).toBe("szablon-lista");
  expect(screen.getByRole("heading", { level: 1, name: "Dziennik stażu" })).toBeInTheDocument();
  expect(screen.getByText("Zapisuj dyżury i sprawdzaj, ile godzin stażu masz już zatwierdzonych.")).toBeInTheDocument();
}

async function renderZDanymi(wpisy: unknown[] = WPISY_WE_WSZYSTKICH_STANACH, metaListy = meta(wpisy.length)) {
  apiPaged.mockResolvedValueOnce({ data: wpisy, meta: metaListy });
  const wynik = render(<DziennikStazu />);
  await screen.findByRole("heading", { level: 2, name: "Zatwierdzone godziny" });
  return wynik;
}

async function otworzNowyWpis(uzytkownik: ReturnType<typeof userEvent.setup>) {
  await uzytkownik.click(screen.getByRole("button", { name: "Dodaj wpis" }));
  return screen.findByRole("form", { name: "Dodaj wpis" });
}

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
  back.mockReset();
  push.mockReset();
  zapisy.length = 0;
  api.mockImplementation((sciezka: string) => {
    if (sciezka === "/me") return Promise.resolve(KONTO);
    const nastepny = zapisy.shift();
    return nastepny ? nastepny() : Promise.reject(new Error(`Nieoczekiwane wywołanie ${sciezka}`));
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("DziennikStazu — schemat atrap", () => {
  it("atrapa wpisu ma wszystkie klucze zasobu PHP, a meta wszystkie wymagane klucze z openapi.json", () => {
    expect(brakujaceKlucze(wpis(1), kluczeZasobu(ZASOB))).toEqual([]);
    expect(brakujaceKlucze(meta(1), kluczeMetaZOpenApi("/v1/internship/entries"))).toEqual([]);
  });
});

describe("DziennikStazu — stany bez danych", () => {
  it("ładowanie: nagłówek i opis, szkielet w obszarze listy, bez przycisku głównego", () => {
    apiPaged.mockReturnValue(new Promise(() => undefined));
    const { container } = render(<DziennikStazu />);
    sprawdzSzablon(container);
    expect(container.querySelector("[data-testid='obszar-lista'] [aria-busy='true']")).not.toBeNull();
    expect(przyciskiGlowne()).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Dodaj wpis" })).toBeNull();
    expect(apiPaged).toHaveBeenCalledWith("/internship/entries?page=1&per_page=25");
  });

  it("błąd serwera: tytuł, zdanie wyjaśniające i „Spróbuj ponownie”, który wczytuje dziennik jeszcze raz", async () => {
    apiPaged.mockRejectedValueOnce(blad(500, "server_error", "Błąd serwera."));
    const uzytkownik = userEvent.setup();
    const { container } = render(<DziennikStazu />);
    const komunikat = await screen.findByRole("alert");
    sprawdzSzablon(container);
    expect(within(komunikat).getByRole("heading", { name: "Nie udało się wczytać dziennika" })).toBeInTheDocument();
    expect(komunikat).toHaveTextContent("Coś poszło nie tak po naszej stronie. Twoje wpisy są bezpieczne — spróbuj ponownie za chwilę.");
    expect(komunikat).not.toHaveTextContent(/500|server_error/);
    const ponow = within(komunikat).getByRole("button", { name: "Spróbuj ponownie" });
    expect(ponow).toBeEnabled();
    expect(przyciskiGlowne()).toHaveLength(0);

    apiPaged.mockResolvedValueOnce({ data: [], meta: meta(0) });
    await uzytkownik.click(ponow);
    expect(await screen.findByRole("heading", { level: 2, name: "Nie masz jeszcze wpisów" })).toBeInTheDocument();
    expect(apiPaged).toHaveBeenCalledTimes(2);
  });

  it("brak połączenia: osobny tytuł i zdanie o połączeniu, „Spróbuj ponownie” aktywny", async () => {
    apiPaged.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { container } = render(<DziennikStazu />);
    const komunikat = await screen.findByRole("alert");
    sprawdzSzablon(container);
    expect(within(komunikat).getByRole("heading", { name: "Brak połączenia" })).toBeInTheDocument();
    expect(komunikat).toHaveTextContent("Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie.");
    expect(within(komunikat).getByRole("button", { name: "Spróbuj ponownie" })).toBeEnabled();
    expect(przyciskiGlowne()).toHaveLength(0);
  });

  it("brak dostępu (403): wspólny ekran odmowy z rolą osoby, rolą docelową i jednym wyjściem do pulpitu", async () => {
    api.mockImplementation((sciezka: string) =>
      sciezka === "/me" ? Promise.resolve({ ...KONTO, role: "student" }) : Promise.reject(new Error(sciezka)),
    );
    apiPaged.mockRejectedValueOnce(blad(403, "forbidden", "Brak dostępu."));
    const uzytkownik = userEvent.setup();
    const { container } = render(<DziennikStazu />);
    const naglowek = await screen.findByRole("heading", { level: 2, name: "Nie masz dostępu do tego ekranu" });
    sprawdzSzablon(container);
    expect(await screen.findByText("Jesteś zalogowany jako Student. Ten ekran jest dla wolontariuszy.")).toBeInTheDocument();
    expect(screen.getByText("Dziennik stażu prowadzą osoby w programie wolontariackim.")).toBeInTheDocument();
    await waitFor(() => expect(naglowek).toHaveFocus());
    const obszar = naglowek.closest("section") as HTMLElement;
    expect(within(obszar).getAllByRole("button")).toHaveLength(1);
    expect(przyciskiGlowne()).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Dodaj wpis" })).toBeNull();
    await uzytkownik.click(within(obszar).getByRole("button", { name: "Wróć do pulpitu" }));
    expect(push).toHaveBeenCalledWith("/panel/pulpit");
  });

  it("wygasły dostęp (403 access_expired): wspólny ekran „Twój dostęp wygasł.” ze zdaniem, co dalej", async () => {
    apiPaged.mockRejectedValueOnce(blad(403, "access_expired", "Twój dostęp wygasł."));
    render(<DziennikStazu />);
    expect(await screen.findByRole("heading", { level: 2, name: "Twój dostęp wygasł." })).toBeInTheDocument();
    expect(
      screen.getByText("Wpisów nie da się teraz dodawać ani poprawiać. Jeśli to pomyłka, napisz do zespołu programu."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Wróć do pulpitu" })).toBeEnabled();
    expect(przyciskiGlowne()).toHaveLength(0);
  });

  it("nie znaleziono (404): wspólny ekran z nazwą rzeczy i „Odśwież”, który pyta jeszcze raz", async () => {
    apiPaged.mockRejectedValueOnce(blad(404, "not_found", "Nie znaleziono zasobu."));
    const uzytkownik = userEvent.setup();
    render(<DziennikStazu />);
    expect(await screen.findByRole("heading", { level: 2, name: "Nie znaleziono dziennika stażu" })).toBeInTheDocument();
    expect(screen.getByText("Dziennik może być chwilowo niedostępny. Odśwież stronę za chwilę.")).toBeInTheDocument();
    apiPaged.mockResolvedValueOnce({ data: [], meta: meta(0) });
    await uzytkownik.click(screen.getByRole("button", { name: "Odśwież" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Nie masz jeszcze wpisów" })).toBeInTheDocument();
  });
});

describe("DziennikStazu — pusty dziennik", () => {
  it("jeden przycisk główny „Dodaj wpis”, karta godzin z paskiem i zdaniem, stan pusty z następnym krokiem", async () => {
    const uzytkownik = userEvent.setup();
    const { container } = await renderZDanymi([], meta(0, { extra: { accepted_hours: "0", required_hours: "72" } }));
    sprawdzSzablon(container);
    expect(przyciskiGlowne()).toHaveLength(1);
    expect(przyciskiGlowne()[0]).toHaveTextContent("Dodaj wpis");
    expect(przyciskiGlowne()[0]).toBeEnabled();
    expect(screen.getByRole("progressbar", { name: "0 z 72 godz." })).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByText("Brakuje jeszcze 72 godz. Liczą się tylko zatwierdzone wpisy.")).toBeInTheDocument();
    expect(screen.getByText("W dzienniku: 0 wpisów.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Nie masz jeszcze wpisów" })).toBeInTheDocument();
    expect(
      screen.getByText("Dodaj pierwszy dyżur. Po zapisaniu trafi do decyzji, a zatwierdzone godziny policzą się powyżej."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();

    await uzytkownik.click(screen.getByRole("button", { name: "Dodaj pierwszy wpis" }));
    expect(await screen.findByRole("form", { name: "Dodaj wpis" })).toBeInTheDocument();
    expect(screen.getByText("Nie masz jeszcze innych wpisów — ten będzie pierwszy.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dodaj pierwszy wpis" })).toBeNull();
  });
});

describe("DziennikStazu — lista z wpisami w każdym stanie", () => {
  it("kolumny Dyżur, Stan, Godziny, akcja; daty po polsku, forma i konsultacje pod datą, godziny „godz.”", async () => {
    const { container } = await renderZDanymi();
    sprawdzSzablon(container);
    const tabela = screen.getByRole("table", { name: "Twoje wpisy" });
    expect(within(tabela).getAllByRole("columnheader").map((naglowek) => naglowek.textContent)).toEqual([
      "Dyżur",
      "Stan",
      "Godziny",
      "Akcja",
    ]);
    expect(screen.getByRole("heading", { level: 2, name: "Twoje wpisy" })).toBeInTheDocument();
    expect(container.querySelectorAll("[data-wiersz]")).toHaveLength(4);

    const pierwszy = wiersz("27 sierpnia 2026");
    expect(komorka(pierwszy, "Dyżur")).toHaveTextContent("Dyżur telefoniczny · 4 konsultacje");
    expect(komorka(pierwszy, "Godziny")).toHaveTextContent(/^Godziny\s*3,5\s*godz\.$/);
    expect(komorka(wiersz("24 sierpnia 2026"), "Dyżur")).toHaveTextContent("Czat · 1 konsultacja");
    expect(komorka(wiersz("20 sierpnia 2026"), "Dyżur")).toHaveTextContent("Inna forma · 0 konsultacji");
    expect(komorka(wiersz("15 sierpnia 2026"), "Godziny")).toHaveTextContent(/1,5\s*godz\./);
    // Żadna data nie jest pokazana w zapisie technicznym.
    expect(container.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("stany wpisów: jedna nazwa na stan, plakietka w kolumnie „Stan”", async () => {
    await renderZDanymi();
    expect(komorka(wiersz("27 sierpnia 2026"), "Stan")).toHaveTextContent("Czeka na decyzję");
    expect(komorka(wiersz("24 sierpnia 2026"), "Stan")).toHaveTextContent("Zatwierdzony");
    expect(komorka(wiersz("20 sierpnia 2026"), "Stan")).toHaveTextContent("Odesłany do poprawy");
    expect(komorka(wiersz("15 sierpnia 2026"), "Stan")).toHaveTextContent("Odrzucony");
  });

  it("akcje wierszy: „Edytuj wpis”, „Popraw wpis” i „Szczegóły” z pełną nazwą dla czytnika; jeden przycisk główny", async () => {
    await renderZDanymi();
    expect(within(wiersz("27 sierpnia 2026")).getByRole("button", { name: "Edytuj wpis z 27 sierpnia 2026" })).toHaveTextContent(
      /^Edytuj wpis\s*›$/,
    );
    expect(within(wiersz("20 sierpnia 2026")).getByRole("button", { name: "Popraw wpis z 20 sierpnia 2026" })).toHaveTextContent(
      /^Popraw wpis\s*›$/,
    );
    expect(within(wiersz("24 sierpnia 2026")).getByRole("button", { name: "Szczegóły: wpis z 24 sierpnia 2026" })).toBeEnabled();
    expect(within(wiersz("15 sierpnia 2026")).getByRole("button", { name: "Szczegóły: wpis z 15 sierpnia 2026" })).toBeEnabled();
    expect(przyciskiGlowne()).toHaveLength(1);
    expect(przyciskiGlowne()[0]).toHaveTextContent("Dodaj wpis");
    expect(screen.getAllByRole("button").filter((przycisk) => (przycisk as HTMLButtonElement).disabled)).toEqual([]);
  });

  it("uwagi z decyzji widać w wierszu: co poprawić i powód odrzucenia; komunikat o wpisie do poprawy nad listą", async () => {
    await renderZDanymi();
    expect(wiersz("20 sierpnia 2026")).toHaveTextContent("Co trzeba poprawić: Uzupełnij opis dyżuru.");
    expect(wiersz("15 sierpnia 2026")).toHaveTextContent("Powód odrzucenia: Ten dyżur jest już w dzienniku.");
    const komunikat = screen.getByRole("heading", { name: "Wpisy do poprawy" }).parentElement as HTMLElement;
    expect(komunikat).toHaveTextContent(
      "Masz 1 wpis do poprawy. Otwórz go przyciskiem „Popraw wpis” na liście i wyślij ponownie.",
    );
  });

  it("karta godzin: zatwierdzone z wymaganymi w „godz.”, brakujące godziny i liczba wpisów z odmianą", async () => {
    await renderZDanymi();
    const pasek = screen.getByRole("progressbar", { name: "41,5 z 72 godz." });
    expect(pasek).toHaveAttribute("aria-valuenow", "58");
    expect(screen.getByText("Brakuje jeszcze 30,5 godz. Liczą się tylko zatwierdzone wpisy.")).toBeInTheDocument();
    expect(screen.getByText("W dzienniku: 4 wpisy.")).toBeInTheDocument();
  });

  it("wszystkie wymagane godziny: zdanie o komplecie zamiast brakujących", async () => {
    await renderZDanymi([wpis(92, { status: "accepted" })], meta(1, { extra: { accepted_hours: "72", required_hours: "72" } }));
    expect(screen.getByRole("progressbar", { name: "72 z 72 godz." })).toHaveAttribute("aria-valuenow", "100");
    expect(screen.getByText("Masz już wszystkie wymagane godziny stażu.")).toBeInTheDocument();
    expect(screen.getByText("W dzienniku: 1 wpis.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Wpisy do poprawy" })).toBeNull();
  });

  it("szczegóły zatwierdzonego wpisu: dane, data decyzji, zdanie o blokadzie i powrót fokusu na akcję wiersza", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    await uzytkownik.click(screen.getByRole("button", { name: "Szczegóły: wpis z 24 sierpnia 2026" }));
    const panel = await screen.findByRole("region", { name: "Szczegóły: wpis z 24 sierpnia 2026" });
    expect(panel).toHaveFocus();
    expect(panel).toHaveTextContent("Czat");
    expect(panel).toHaveTextContent("2 godz.");
    expect(panel).toHaveTextContent("Dyżur telefoniczny — bez danych osób.");
    expect(panel).toHaveTextContent("Data decyzji25 sierpnia 2026");
    expect(panel).toHaveTextContent("Zatwierdzonego wpisu nie można już zmienić.");
    expect(within(panel).queryByRole("form")).toBeNull();
    expect(przyciskiGlowne()).toHaveLength(1);

    await uzytkownik.click(within(panel).getByRole("button", { name: "Wróć do listy" }));
    expect(screen.queryByRole("region", { name: /^Szczegóły:/ })).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Szczegóły: wpis z 24 sierpnia 2026" })).toHaveFocus(),
    );
  });

  it("szczegóły odrzuconego wpisu: powód i zdanie, co zrobić zamiast poprawki", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    await uzytkownik.click(screen.getByRole("button", { name: "Szczegóły: wpis z 15 sierpnia 2026" }));
    const panel = await screen.findByRole("region", { name: "Szczegóły: wpis z 15 sierpnia 2026" });
    expect(panel).toHaveTextContent("Powód odrzucenia");
    expect(panel).toHaveTextContent(
      "Odrzuconego wpisu nie można poprawić ani wysłać ponownie. Jeśli dyżur nadal trzeba udokumentować, dodaj nowy wpis.",
    );
  });

  it("stronicowanie: „Strona 1 z 2” mówi, czemu „Poprzednia” jest nieaktywna; „Następna” prosi o stronę 2", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi(WPISY_WE_WSZYSTKICH_STANACH, meta(30, { last_page: 2 }));
    const nawigacja = screen.getByRole("navigation", { name: "Stronicowanie" });
    expect(nawigacja).toHaveTextContent("Strona 1 z 2");
    expect(within(nawigacja).getByRole("button", { name: "Poprzednia" })).toBeDisabled();
    apiPaged.mockResolvedValueOnce({ data: [wpis(95, { date: "2026-07-01" })], meta: meta(30, { current_page: 2, last_page: 2 }) });
    await uzytkownik.click(within(nawigacja).getByRole("button", { name: "Następna" }));
    expect(await screen.findByText("1 lipca 2026", { selector: "p" })).toBeInTheDocument();
    expect(apiPaged).toHaveBeenLastCalledWith("/internship/entries?page=2&per_page=25");
  });

  it("axe: brak naruszeń na liście", async () => {
    const { container } = await renderZDanymi();
    const wynik = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(wynik.violations.map((n) => `${n.id}: ${n.nodes.map((w) => w.target.join(" ")).join(" | ")}`)).toEqual([]);
  });
});

describe("DziennikStazu — dodawanie wpisu", () => {
  it("formularz: pięć pól z etykietami i podpowiedziami, wartości startowe, jedyny przycisk główny to zapis", async () => {
    const uzytkownik = userEvent.setup();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 2, 9, 30));
    await renderZDanymi();
    const formularz = await otworzNowyWpis(uzytkownik);

    expect(within(formularz).getByRole("heading", { level: 2, name: "Dodaj wpis" })).toBeInTheDocument();
    expect(within(formularz).getByLabelText(/^Data dyżuru/)).toHaveValue("2026-10-02");
    expect(within(formularz).getByLabelText(/^Data dyżuru/)).toHaveFocus();
    expect(within(formularz).getByLabelText(/^Liczba godzin/)).toHaveValue(0.5);
    expect(within(formularz).getByRole("combobox", { name: /^Forma dyżuru/ })).toHaveTextContent("Dyżur telefoniczny");
    expect(within(formularz).getByLabelText(/^Liczba konsultacji/)).toHaveValue(0);
    expect(within(formularz).getByLabelText(/^Opis dyżuru/)).toHaveValue("");
    for (const podpowiedz of [
      "Nie później niż dziś.",
      "Od 0,5 do 24 godz., co 0,5 godz.",
      "Wpisz 0, jeśli dyżur był bez konsultacji.",
      "Nie wpisuj danych osób konsultowanych.",
    ]) {
      expect(within(formularz).getByText(podpowiedz)).toBeInTheDocument();
    }

    expect(przyciskiGlowne()).toHaveLength(1);
    expect(przyciskiGlowne()[0]).toHaveTextContent("Zapisz i wyślij");
    expect(screen.queryByRole("button", { name: "Dodaj wpis" })).toBeNull();
    expect(within(formularz).getByRole("button", { name: "Anuluj" })).toBeEnabled();
    // Przy otwartym formularzu wiersze nie mają akcji — i zdanie mówi dlaczego.
    expect(screen.queryByRole("button", { name: /^(Edytuj|Popraw) wpis z / })).toBeNull();
    expect(screen.getByText("Inne wpisy otworzysz po zapisaniu albo zamknięciu formularza.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Wpisy do poprawy" })).toBeNull();
  });

  it("błędy pól z serwera (422): komunikat przy polu, podsumowanie z odnośnikami, dane zostają w formularzu", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    const formularz = await otworzNowyWpis(uzytkownik);
    const godziny = within(formularz).getByLabelText(/^Liczba godzin/);
    await uzytkownik.clear(godziny);
    await uzytkownik.type(godziny, "0.3");
    await uzytkownik.type(within(formularz).getByLabelText(/^Opis dyżuru/), "Dyżur wieczorny.");
    dopiszZapis(
      blad(422, "validation_failed", "Popraw zaznaczone pola.", {
        hours: ["Godziny podaj w krokach co 0,5."],
        date: ["Data wpisu nie może być późniejsza niż dzisiaj."],
      }),
    );
    await uzytkownik.click(within(formularz).getByRole("button", { name: "Zapisz i wyślij" }));

    expect(await within(formularz).findByText("Godziny podaj w krokach co 0,5.")).toBeInTheDocument();
    expect(within(formularz).getByText("Data wpisu nie może być późniejsza niż dzisiaj.")).toBeInTheDocument();
    expect(godziny).toHaveAttribute("aria-invalid", "true");
    expect(godziny).toHaveAccessibleDescription(/Godziny podaj w krokach co 0,5\./);
    const podsumowanie = within(formularz).getByRole("heading", { name: "Popraw zaznaczone pola" }).closest(
      '[role="alert"]',
    ) as HTMLElement;
    expect(podsumowanie).not.toBeNull();
    expect(within(podsumowanie).getByRole("link", { name: "Liczba godzin" })).toHaveAttribute("href", "#nowy-wpis-godziny");
    expect(within(podsumowanie).getByRole("link", { name: "Data dyżuru" })).toHaveAttribute("href", "#nowy-wpis-data");
    expect(godziny).toHaveValue(0.3);
    expect(within(formularz).getByLabelText(/^Opis dyżuru/)).toHaveValue("Dyżur wieczorny.");
    expect(przyciskiGlowne()[0]).toHaveTextContent("Zapisz i wyślij");
    expect(przyciskiGlowne()[0]).toBeEnabled();
  });

  it("zapisywanie: przycisk mówi „Zapisywanie…”, pola są zablokowane, drugie kliknięcie niczego nie wysyła", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    const formularz = await otworzNowyWpis(uzytkownik);
    zapisy.push(() => new Promise(() => undefined));
    await uzytkownik.click(within(formularz).getByRole("button", { name: "Zapisz i wyślij" }));

    const zapis = await within(formularz).findByRole("button", { name: "Zapisywanie…" });
    expect(przyciskiGlowne()).toEqual([zapis]);
    expect(within(formularz).getByLabelText(/^Data dyżuru/)).toBeDisabled();
    expect(within(formularz).getByLabelText(/^Opis dyżuru/)).toBeDisabled();
    await uzytkownik.click(zapis);
    expect(wywolaniaZapisu()).toHaveLength(1);
  });

  it("zapisano: POST z pięcioma polami, wspólne potwierdzenie, nowy wpis na górze listy, fokus wraca na „Dodaj wpis”", async () => {
    const uzytkownik = userEvent.setup();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 2, 9, 30));
    await renderZDanymi();
    const formularz = await otworzNowyWpis(uzytkownik);
    const godziny = within(formularz).getByLabelText(/^Liczba godzin/);
    await uzytkownik.clear(godziny);
    await uzytkownik.type(godziny, "2.5");
    await uzytkownik.click(within(formularz).getByRole("combobox", { name: /^Forma dyżuru/ }));
    await uzytkownik.click(screen.getByRole("option", { name: "Czat" }));
    const konsultacje = within(formularz).getByLabelText(/^Liczba konsultacji/);
    await uzytkownik.clear(konsultacje);
    await uzytkownik.type(konsultacje, "3");
    dopiszZapis(wpis(96, { date: "2026-10-02", hours: "2.5", form: "chat_duty", consultations_count: 3, description: null }));
    await uzytkownik.click(within(formularz).getByRole("button", { name: "Zapisz i wyślij" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Wpis zapisany i wysłany do decyzji.");
    expect(wywolaniaZapisu()).toEqual([
      [
        "/internship/entries",
        {
          method: "POST",
          body: { date: "2026-10-02", hours: "2.5", form: "chat_duty", consultations_count: 3, description: null },
        },
      ],
    ]);
    expect(screen.queryByRole("form", { name: "Dodaj wpis" })).toBeNull();
    const wiersze = Array.from(document.querySelectorAll("[data-wiersz]"));
    expect(wiersze).toHaveLength(5);
    expect(wiersze[0]).toHaveTextContent("2 października 2026");
    expect(wiersze[0]).toHaveTextContent("Czeka na decyzję");
    expect(screen.getByText("W dzienniku: 5 wpisów.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Dodaj wpis" })).toHaveFocus());
    expect(apiPaged).toHaveBeenCalledTimes(1);
  });

  it("brak połączenia przy zapisie: komunikat nad formularzem, wpisane dane zostają", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    const formularz = await otworzNowyWpis(uzytkownik);
    await uzytkownik.type(within(formularz).getByLabelText(/^Opis dyżuru/), "Dyżur poranny.");
    dopiszZapis(new TypeError("Failed to fetch"));
    await uzytkownik.click(within(formularz).getByRole("button", { name: "Zapisz i wyślij" }));

    const komunikat = await screen.findByRole("heading", { name: "Wpis nie został zapisany" });
    expect(komunikat.parentElement).toHaveTextContent(
      "Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie — wpisane dane zostały w formularzu.",
    );
    expect(within(screen.getByRole("form", { name: "Dodaj wpis" })).getByLabelText(/^Opis dyżuru/)).toHaveValue("Dyżur poranny.");
  });

  it("„Anuluj” zamyka formularz bez żądania i oddaje fokus „Dodaj wpis”", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    const formularz = await otworzNowyWpis(uzytkownik);
    await uzytkownik.click(within(formularz).getByRole("button", { name: "Anuluj" }));
    expect(screen.queryByRole("form", { name: "Dodaj wpis" })).toBeNull();
    expect(wywolaniaZapisu()).toEqual([]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Dodaj wpis" })).toHaveFocus());
  });
});

describe("DziennikStazu — wpis odesłany do poprawy", () => {
  it("„Popraw wpis” otwiera pod wierszem uwagę i formularz z wartościami wpisu; jedyny przycisk główny to wysłanie", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    await uzytkownik.click(screen.getByRole("button", { name: "Popraw wpis z 20 sierpnia 2026" }));
    const formularz = await screen.findByRole("form", { name: "Popraw wpis z 20 sierpnia 2026" });

    const uwaga = screen.getByRole("heading", { name: "Co trzeba poprawić" }).parentElement as HTMLElement;
    expect(uwaga).toHaveTextContent("Uzupełnij opis dyżuru.");
    expect(within(formularz).getByRole("heading", { level: 2, name: "Popraw wpis z 20 sierpnia 2026" })).toBeInTheDocument();
    expect(within(formularz).getByLabelText(/^Data dyżuru/)).toHaveValue("2026-08-20");
    expect(within(formularz).getByLabelText(/^Liczba godzin/)).toHaveValue(4);
    expect(within(formularz).getByRole("combobox", { name: /^Forma dyżuru/ })).toHaveTextContent("Inna forma");
    expect(within(formularz).getByLabelText(/^Liczba konsultacji/)).toHaveValue(0);
    expect(within(formularz).getByLabelText(/^Opis dyżuru/)).toHaveValue("");
    expect(przyciskiGlowne()).toHaveLength(1);
    expect(przyciskiGlowne()[0]).toHaveTextContent("Wyślij poprawiony wpis");
    expect(within(formularz).getByRole("button", { name: "Wróć do listy" })).toBeEnabled();
    // Formularz stoi w wierszu panelu tuż pod wierszem wpisu.
    expect(wiersz("20 sierpnia 2026").nextElementSibling).toContainElement(formularz);
  });

  it("wysłanie poprawki: PATCH tego wpisu, potwierdzenie i stan „Czeka na decyzję” bez ponownego odczytu listy", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    await uzytkownik.click(screen.getByRole("button", { name: "Popraw wpis z 20 sierpnia 2026" }));
    const formularz = await screen.findByRole("form", { name: "Popraw wpis z 20 sierpnia 2026" });
    await uzytkownik.type(within(formularz).getByLabelText(/^Opis dyżuru/), "Dyżur w punkcie stacjonarnym.");
    dopiszZapis(
      wpis(93, {
        date: "2026-08-20",
        hours: "4",
        form: "other",
        consultations_count: 0,
        description: "Dyżur w punkcie stacjonarnym.",
        status: "submitted",
        review_comment: "Uzupełnij opis dyżuru.",
      }),
    );
    await uzytkownik.click(within(formularz).getByRole("button", { name: "Wyślij poprawiony wpis" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Poprawiony wpis wysłany ponownie do decyzji.");
    expect(wywolaniaZapisu()).toEqual([
      [
        "/internship/entries/93",
        {
          method: "PATCH",
          body: {
            date: "2026-08-20",
            hours: "4",
            form: "other",
            consultations_count: 0,
            description: "Dyżur w punkcie stacjonarnym.",
          },
        },
      ],
    ]);
    expect(komorka(wiersz("20 sierpnia 2026"), "Stan")).toHaveTextContent("Czeka na decyzję");
    expect(wiersz("20 sierpnia 2026")).toHaveTextContent("Wcześniejsza prośba o poprawkę: Uzupełnij opis dyżuru.");
    expect(screen.queryByRole("heading", { name: "Wpisy do poprawy" })).toBeNull();
    await waitFor(() => expect(screen.getByRole("button", { name: "Edytuj wpis z 20 sierpnia 2026" })).toHaveFocus());
    expect(apiPaged).toHaveBeenCalledTimes(1);
  });

  it("wpis rozstrzygnięty w międzyczasie (403 entry_locked): formularz znika, zdanie bez kodów, lista odświeżona", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    await uzytkownik.click(screen.getByRole("button", { name: "Popraw wpis z 20 sierpnia 2026" }));
    const formularz = await screen.findByRole("form", { name: "Popraw wpis z 20 sierpnia 2026" });
    dopiszZapis(blad(403, "entry_locked", "Zaakceptowany wpis jest zablokowany."));
    apiPaged.mockResolvedValueOnce({
      data: WPISY_WE_WSZYSTKICH_STANACH.map((w) => (w.id === 93 ? { ...w, status: "accepted" } : w)),
      meta: meta(4),
    });
    await uzytkownik.click(within(formularz).getByRole("button", { name: "Wyślij poprawiony wpis" }));

    const komunikat = await screen.findByRole("alert");
    expect(within(komunikat).getByRole("heading", { name: "Tego wpisu nie można już zmienić" })).toBeInTheDocument();
    expect(komunikat).toHaveTextContent("Decyzja o wpisie zapadła w międzyczasie. Lista jest odświeżona i pokazuje jego stan.");
    expect(komunikat).not.toHaveTextContent(/403|entry_locked/);
    expect(screen.queryByRole("form")).toBeNull();
    await waitFor(() => expect(komorka(wiersz("20 sierpnia 2026"), "Stan")).toHaveTextContent("Zatwierdzony"));
    expect(apiPaged).toHaveBeenCalledTimes(2);
  });

  it("wpis czekający na decyzję można edytować jak na starym ekranie: „Zapisz zmiany” i zdanie, że nadal czeka", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    await uzytkownik.click(screen.getByRole("button", { name: "Edytuj wpis z 27 sierpnia 2026" }));
    const formularz = await screen.findByRole("form", { name: "Edytuj wpis z 27 sierpnia 2026" });
    expect(screen.queryByRole("heading", { name: "Co trzeba poprawić" })).toBeNull();
    dopiszZapis(wpis(91, { hours: "4" }));
    const godziny = within(formularz).getByLabelText(/^Liczba godzin/);
    await uzytkownik.clear(godziny);
    await uzytkownik.type(godziny, "4");
    await uzytkownik.click(within(formularz).getByRole("button", { name: "Zapisz zmiany" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Zmiany zapisane. Wpis nadal czeka na decyzję.");
    expect(komorka(wiersz("27 sierpnia 2026"), "Godziny")).toHaveTextContent(/4\s*godz\./);
  });
});
