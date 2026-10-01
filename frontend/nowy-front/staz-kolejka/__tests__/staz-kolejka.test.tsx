import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";
import { Dialog } from "@/design-system/organizmy/Dialog/Dialog";
import { FormSection } from "@/design-system/organizmy/FormSection/FormSection";
import { PROG_OSTRZEZENIA_DNI, dniOczekiwania, tekstPlakietkiCzekania } from "../../sprawy/wiek";
import { brakujaceKlucze, kluczeMetaZOpenApi, kluczeZasobu } from "./zrodla-ekranu";

/**
 * Ekran decyzji o dyżurach (`StazKolejka`) na szablonie `ListTemplate`, jak
 * sprawa „Dyżur” w makiecie A-02:
 *  - każdy stan (ładowanie, dane, pusty, brak uprawnień, błąd sieci) ma jeden
 *    `main` i znacznik szablonu w DOM;
 *  - lista jest domyślnie zwinięta: wiersz to plakietka wieku, „Dyżur”, osoba
 *    i „Otwórz”; panel z danymi, godzinami osoby i decyzjami wchodzi po „Otwórz”;
 *  - zatwierdzenie, prośba o poprawkę i odrzucenie wołają właściwe trasy
 *    z właściwym ciałem; 422 bez komentarza pokazuje błąd przy polu;
 *    403 `entry_locked` pokazuje komunikat z koperty i odświeża listę;
 *  - sekcja komentarza stoi w treści — w DOM nie ma okna dialogowego.
 * Atrapy mają klucze odczytane z zasobu PHP i `openapi.json`. Zegar stoi na
 * stałej chwili (tylko `Date`), więc wiek wpisów jest deterministyczny.
 */

const api = vi.fn();
const apiPaged = vi.fn();
const back = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));
// Ekran bierze klienta z `@/lib/api/klient`; beczkę `@/lib/api` podmieniamy zapobiegawczo, żeby przyszły import z beczki nie poszedł do prawdziwego transportu.
vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: (...a: unknown[]) => api(...a),
  apiPaged: (...a: unknown[]) => apiPaged(...a),
}));
vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return {
    ...oryginal,
    api: (...a: unknown[]) => api(...a),
    apiPaged: (...a: unknown[]) => apiPaged(...a),
  };
});

const { ApiError } = await import("@/lib/api/klient");
const { StazKolejka } = await import("../StazKolejka");

const ZASOB = "backend/app/Http/Resources/H11/AdminInternshipEntryResource.php";
const TERAZ = new Date("2026-10-01T12:00:00Z");
const DOBA = 24 * 60 * 60 * 1000;

function dniTemu(dni: number): string {
  return new Date(TERAZ.getTime() - dni * DOBA).toISOString();
}

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
    created_at: dniTemu(4),
    updated_at: dniTemu(4),
    user: { id: 17, first_name: "Marta", last_name: "Demo" },
    ...nadpisz,
  };
}

const META = { current_page: 1, per_page: 25, total: 2, last_page: 1 };

const DWA_WPISY = [
  wpis(91),
  wpis(92, {
    form: "chat_duty",
    hours: "2",
    consultations_count: 0,
    description: null,
    created_at: dniTemu(5),
    user: { id: 18, first_name: "Filip", last_name: "Demo" },
  }),
];

function blad(status: number, code: string, message: string, errors?: Record<string, string[]>) {
  return new ApiError({ status, code, message, errors });
}

/**
 * Atrapa transportu: odczyty panelu (`/admin/users/{id}`, `/admin/edition`)
 * odpowiadają stałymi danymi, a decyzje (`/admin/internship/...`) biorą
 * kolejne wyniki z kolejki `decyzje`. Nieoczekiwane wywołanie to błąd testu.
 */
const decyzje: Array<() => Promise<unknown>> = [];
let godzinyOsoby: string | Error = "18";
let wymaganeGodziny: number | Error = 72;

function dopiszDecyzje(wynik: unknown) {
  decyzje.push(() => (wynik instanceof Error ? Promise.reject(wynik) : Promise.resolve(wynik)));
}

function wywolaniaDecyzji() {
  return api.mock.calls.filter(([sciezka]) => String(sciezka).startsWith("/admin/internship"));
}

function wywolaniaPanelu() {
  return api.mock.calls.filter(([sciezka]) => !String(sciezka).startsWith("/admin/internship"));
}

function przyciskiGlowne() {
  return Array.from(document.querySelectorAll("button")).filter((b) =>
    b.className.split(/\s+/).some((klasa) => /(^|_)primary(_|$)/.test(klasa)),
  );
}

function oknaDialogowe() {
  return document.querySelectorAll('[role="dialog"], [aria-modal]');
}

function wierszeListy() {
  return Array.from(document.querySelectorAll("[data-wiersz]"));
}

function wiersz(nazwa: string) {
  return screen.getByText(nazwa).closest("[data-wiersz]") as HTMLElement;
}

/** Komórka wiersza pod nagłówkiem kolumny o podanej nazwie. */
function komorka(wierszListy: HTMLElement, kolumna: string): HTMLElement {
  const naglowki = within(screen.getByRole("table", { name: "Dyżury do decyzji" })).getAllByRole("columnheader");
  const indeks = naglowki.findIndex((naglowek) => naglowek.textContent === kolumna);
  expect(indeks, `kolumna „${kolumna}”`).toBeGreaterThanOrEqual(0);
  return within(wierszListy).getAllByRole("cell")[indeks];
}

/** Wiersz panelu otwartego dyżuru: następny wiersz tabeli po wierszu osoby. */
function wierszPanelu(nazwa: string) {
  return wiersz(nazwa).nextElementSibling as HTMLElement;
}

function przyciskOtworz(nazwa: string) {
  return within(wiersz(nazwa)).getByRole("button", { name: new RegExp(`^Otwórz dyżur: ${nazwa}`) });
}

async function otworzPanel(uzytkownik: ReturnType<typeof userEvent.setup>, nazwa: string) {
  await uzytkownik.click(przyciskOtworz(nazwa));
  return screen.findByRole("region", { name: `Dyżur: ${nazwa}` });
}

function sprawdzSzablon(container: HTMLElement) {
  expect(() => jedenMain(container)).not.toThrow();
  expect(container.querySelector("main")!.getAttribute("data-style-id")).toBe("szablon-lista");
}

async function renderZDanymi(wpisy = DWA_WPISY) {
  apiPaged.mockResolvedValueOnce({ data: wpisy, meta: { ...META, total: wpisy.length } });
  const wynik = render(<StazKolejka />);
  await screen.findByText("Marta Demo");
  return wynik;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(TERAZ);
  api.mockReset();
  apiPaged.mockReset();
  back.mockReset();
  decyzje.length = 0;
  godzinyOsoby = "18";
  wymaganeGodziny = 72;
  api.mockImplementation((sciezka: string) => {
    if (sciezka.startsWith("/admin/users/")) {
      return godzinyOsoby instanceof Error
        ? Promise.reject(godzinyOsoby)
        : Promise.resolve({ progress: { hours_accepted: godzinyOsoby } });
    }
    if (sciezka === "/admin/edition") {
      return wymaganeGodziny instanceof Error
        ? Promise.reject(wymaganeGodziny)
        : Promise.resolve({ internship_hours_required: wymaganeGodziny });
    }
    const nastepna = decyzje.shift();
    return nastepna ? nastepna() : Promise.reject(new Error(`Nieoczekiwane wywołanie ${sciezka}`));
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("StazKolejka — schemat atrap", () => {
  it("atrapa wpisu ma wszystkie klucze zasobu PHP", () => {
    expect(brakujaceKlucze(wpis(1), kluczeZasobu(ZASOB))).toEqual([]);
  });

  it("atrapa meta ma wszystkie wymagane klucze z openapi.json", () => {
    expect(brakujaceKlucze(META, kluczeMetaZOpenApi("/v1/admin/internship/pending"))).toEqual([]);
  });

  it("kontrola: atrapa bez klucza `hours` jest wykryta jako niepełna", () => {
    const uboga: Record<string, unknown> = { ...wpis(1) };
    delete uboga.hours;
    expect(brakujaceKlucze(uboga, kluczeZasobu(ZASOB))).toEqual(["hours"]);
  });

  it("odczyty godzin osoby mają pokrycie w zasobach PHP: karta niesie `hours_accepted`, edycja `internship_hours_required`", () => {
    const korzen = join(process.cwd(), "..");
    const karta = readFileSync(join(korzen, "backend/app/Http/Resources/AdminUserCardResource.php"), "utf-8");
    const edycja = readFileSync(join(korzen, "backend/app/Http/Resources/EditionResource.php"), "utf-8");
    expect(karta).toMatch(/'progress'\s*=>/);
    expect(karta).toMatch(/'hours_accepted'\s*=>/);
    expect(edycja).toMatch(/'internship_hours_required'\s*=>/);
  });
});

describe("StazKolejka — stany w szablonie", () => {
  it("ładowanie: szkielet w obszarze listy, jeden main, znacznik szablonu", () => {
    apiPaged.mockReturnValue(new Promise(() => undefined));
    const { container } = render(<StazKolejka />);
    sprawdzSzablon(container);
    expect(container.querySelector("[data-testid='obszar-lista'] [aria-busy='true']")).not.toBeNull();
  });

  it("dane: dwa wiersze zwinięte — „Dyżur”, osoba, plakietka wieku, godziny i „Otwórz”, bez pozostałych danych wpisu", async () => {
    const { container } = await renderZDanymi();
    sprawdzSzablon(container);
    expect(apiPaged).toHaveBeenCalledWith("/admin/internship/pending?page=1&per_page=25");
    expect(wierszeListy()).toHaveLength(2);
    const pierwszy = wiersz("Marta Demo");
    expect(pierwszy).toHaveTextContent("Dyżur");
    // Nazwa stoi w pierwszej kolumnie, osoba pod nią; plakietka wieku dopiero w kolumnie stanu.
    expect(within(pierwszy).getAllByRole("cell")[0]).toBe(komorka(pierwszy, "Dyżur"));
    expect(komorka(pierwszy, "Dyżur")).toContainElement(within(pierwszy).getByText("Dyżur", { selector: "p" }));
    expect(komorka(pierwszy, "Dyżur")).toContainElement(screen.getByText("Marta Demo"));
    expect(komorka(pierwszy, "Dyżur")).not.toHaveTextContent(/czeka \d|czeka od dziś/);
    expect(komorka(pierwszy, "Stan")).toHaveTextContent(
      tekstPlakietkiCzekania(dniOczekiwania(dniTemu(4), TERAZ.getTime())!),
    );
    expect(pierwszy).toHaveTextContent(tekstPlakietkiCzekania(dniOczekiwania(dniTemu(4), TERAZ.getTime())!));
    expect(wiersz("Filip Demo")).toHaveTextContent(tekstPlakietkiCzekania(dniOczekiwania(dniTemu(5), TERAZ.getTime())!));
    // Godziny dyżuru (pole `hours` wpisu) stoją we własnej kolumnie, z przecinkiem i jednostką.
    expect(komorka(pierwszy, "Godziny")).toHaveTextContent(/^Godziny\s*3,5\s*h$/);
    // Zwinięta lista nie niesie ani formy, ani konsultacji, ani opisu — to jest w panelu.
    expect(container.textContent).not.toContain("Dyżur telefoniczny — bez danych osób.");
    expect(container.textContent).not.toMatch(/konsultacje/i);
    expect(screen.queryByRole("region", { name: /^Dyżur:/ })).toBeNull();
    expect(api).not.toHaveBeenCalled();
  });

  it("kolumny w kolejności: Dyżur, Stan, Godziny, akcja — dane z jednego odczytu kolejki", async () => {
    await renderZDanymi();
    const tabela = screen.getByRole("table", { name: "Dyżury do decyzji" });
    expect(within(tabela).getAllByRole("columnheader").map((naglowek) => naglowek.textContent)).toEqual([
      "Dyżur",
      "Stan",
      "Godziny",
      "Akcja",
    ]);
    for (const nazwa of ["Marta Demo", "Filip Demo"]) {
      const komorki = within(wiersz(nazwa)).getAllByRole("cell");
      expect(komorki).toHaveLength(4);
      expect(komorki.at(-1)).toContainElement(przyciskOtworz(nazwa));
    }
    expect(apiPaged).toHaveBeenCalledTimes(1);
    expect(apiPaged).toHaveBeenCalledWith("/admin/internship/pending?page=1&per_page=25");
    expect(api).not.toHaveBeenCalled();
  });

  it("plakietka wieku: tekst i wariant z `sprawy/wiek.ts` — poniżej progu szara, od progu ostrzegawcza", async () => {
    expect(PROG_OSTRZEZENIA_DNI).toBe(5);
    await renderZDanymi();
    const szara = within(wiersz("Marta Demo")).getByText(tekstPlakietkiCzekania(4));
    const ostrzegawcza = within(wiersz("Filip Demo")).getByText(tekstPlakietkiCzekania(5));
    expect(szara.className).not.toMatch(/warn/);
    expect(ostrzegawcza.className).toMatch(/warn/);
  });

  it("wiek 0 dni: tekst plakietki to wynik funkcji `tekstPlakietkiCzekania`, nie literał", async () => {
    await renderZDanymi([wpis(91, { created_at: TERAZ.toISOString() })]);
    expect(wiersz("Marta Demo")).toHaveTextContent(tekstPlakietkiCzekania(0));
  });

  it("brak daty zgłoszenia (null): wiersz bez plakietki wieku, bez zgadywania", async () => {
    await renderZDanymi([wpis(91, { created_at: null })]);
    expect(within(wiersz("Marta Demo")).queryByText(/^czeka /)).toBeNull();
    expect(przyciskOtworz("Marta Demo")).toBeInTheDocument();
  });

  it("akcja wiersza: widoczny napis „Otwórz”, pełna nazwa z osobą i datą dyżuru tylko dla czytnika", async () => {
    await renderZDanymi();
    const przycisk = przyciskOtworz("Marta Demo");
    // Wygląd akcji wiersza Spraw (akcja kolumny organizmu), element nadal przycisk: „Otwórz ›”, strzałka ukryta przed czytnikiem.
    expect(przycisk.tagName).toBe("BUTTON");
    expect(przycisk.textContent).toMatch(/^Otwórz\s*›$/);
    expect(przycisk.querySelector('[aria-hidden="true"]')?.textContent).toBe("›");
    expect(przycisk).toHaveAttribute("aria-label", "Otwórz dyżur: Marta Demo, z dnia 27 sierpnia 2026");
    // Data „Czeka od …” jest w drzewie dostępności, ale wzrokowo ukryta (klasa „ukryte” wiersza).
    const data = within(wiersz("Marta Demo")).getByText(/^Czeka od /);
    expect(data.className).toMatch(/ukryte/);
  });

  it("kolejność wierszy jest kolejnością z serwera", async () => {
    await renderZDanymi([DWA_WPISY[1], DWA_WPISY[0]]);
    const nazwy = wierszeListy().map((el) => el.textContent ?? "");
    expect(nazwy[0]).toContain("Filip Demo");
    expect(nazwy[1]).toContain("Marta Demo");
  });

  it("zwinięty wiersz ma jedną akcję „Otwórz”; trzy decyzje nie stoją w wierszu", async () => {
    const { container } = await renderZDanymi();
    for (const nazwa of ["Marta Demo", "Filip Demo"]) {
      const przyciski = within(wiersz(nazwa)).getAllByRole("button").map((b) => b.textContent);
      expect(przyciski.map((t) => t?.replace(/\s*›$/, ""))).toEqual(["Otwórz"]);
    }
    expect(screen.queryByRole("button", { name: "Zatwierdź" })).toBeNull();
    expect(przyciskiGlowne()).toHaveLength(0);
    // Nagłówek listy tylko dla czytnika stoi pod h1 bez przeskoku: h1 → h2.
    expect(container.querySelector("h1")).not.toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Dyżury do decyzji" })).toBeInTheDocument();
  });

  it("pusty: „Brak wpisów do decyzji”", async () => {
    apiPaged.mockResolvedValueOnce({ data: [], meta: { ...META, total: 0 } });
    const { container } = render(<StazKolejka />);
    await screen.findByRole("heading", { name: "Brak wpisów do decyzji" });
    sprawdzSzablon(container);
    expect(wierszeListy()).toHaveLength(0);
  });

  it.each([401, 403])("odmowa %i: stan brak uprawnień z rolą, zero danych, jeden main", async (status) => {
    apiPaged.mockRejectedValueOnce(blad(status, status === 401 ? "unauthenticated" : "forbidden", "Odmowa."));
    const { container } = render(<StazKolejka />);
    await waitFor(() => expect(container.textContent).toContain("administracji"));
    sprawdzSzablon(container);
    expect(wierszeListy()).toHaveLength(0);
    expect(container.textContent).not.toContain("Marta");
    expect(container.textContent).not.toContain("Dyżur z");
  });

  it("błąd sieci: komunikat z „Spróbuj ponownie”, ponowienie wczytuje listę", async () => {
    apiPaged.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const uzytkownik = userEvent.setup();
    const { container } = render(<StazKolejka />);
    const ponow = await screen.findByRole("button", { name: "Spróbuj ponownie" });
    sprawdzSzablon(container);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    apiPaged.mockResolvedValueOnce({ data: DWA_WPISY, meta: META });
    await uzytkownik.click(ponow);
    await screen.findByText("Marta Demo");
    expect(apiPaged).toHaveBeenCalledTimes(2);
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
    apiPaged.mockResolvedValueOnce({ data: DWA_WPISY, meta: { ...META, last_page: 2, total: 40 } });
    const uzytkownik = userEvent.setup();
    render(<StazKolejka />);
    await screen.findByText("Strona 1 z 2");
    apiPaged.mockResolvedValueOnce({
      data: [wpis(93, { user: { id: 19, first_name: "Ewa", last_name: "Demo" } })],
      meta: { ...META, current_page: 2, last_page: 2, total: 40 },
    });
    await uzytkownik.click(screen.getByRole("button", { name: "Następna" }));
    await screen.findByText("Ewa Demo");
    expect(apiPaged).toHaveBeenLastCalledWith("/admin/internship/pending?page=2&per_page=25");
  });
});

describe("StazKolejka — panel otwartego dyżuru (A-02)", () => {
  it("„Otwórz” rozwija panel pod wierszem: Data, Forma, Godziny z przecinkiem, Konsultacje, Opis; wiersz traci „Otwórz”", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    const panel = await otworzPanel(uzytkownik, "Marta Demo");
    // Panel stoi w następnym wierszu tabeli, zaraz pod wierszem osoby (jedna komórka na całą szerokość).
    expect(wierszPanelu("Marta Demo").contains(panel)).toBe(true);
    expect(wierszPanelu("Marta Demo")).toHaveAttribute("role", "row");
    expect(wiersz("Marta Demo").contains(panel)).toBe(false);
    const dane = Array.from(panel.querySelectorAll("dt")).map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]);
    expect(dane).toEqual([
      ["Data", "27 sierpnia 2026"],
      ["Forma", "Dyżur telefoniczny"],
      ["Godziny", "3,5 h"],
      ["Konsultacje", "4"],
      ["Opis", "Dyżur telefoniczny — bez danych osób."],
    ]);
    // Kontrakt nie niesie godzin „od–do”, więc panel nie ma takiej linii.
    expect(panel.textContent).not.toMatch(/\d{1,2}:\d{2}/);
    expect(within(wiersz("Marta Demo")).queryByRole("button", { name: /^Otwórz dyżur/ })).toBeNull();
    // Drugi wiersz zostaje zwinięty.
    expect(przyciskOtworz("Filip Demo")).toBeInTheDocument();
    expect(screen.getAllByRole("region", { name: /^Dyżur:/ })).toHaveLength(1);
  });

  it("opis pusty: „Bez opisu.”; forma „czat” z wielkiej litery, godziny „2” bez przecinka", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    const panel = await otworzPanel(uzytkownik, "Filip Demo");
    expect(within(panel).getByText("Bez opisu.")).toBeInTheDocument();
    expect(within(panel).getByText("Czat")).toBeInTheDocument();
    expect(within(panel).getByText("2 h")).toBeInTheDocument();
  });

  it("po „Otwórz” fokus jest w panelu (obszar z nazwą), nie na żadnej decyzji", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    const panel = await otworzPanel(uzytkownik, "Marta Demo");
    expect(panel).toHaveFocus();
    expect(screen.getByRole("button", { name: "Zatwierdź" })).not.toHaveFocus();
  });

  it("akcje panelu w kolejności: Zatwierdź (główny), Poproś o poprawkę, Odrzuć dyżur, Wróć do listy", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    const panel = await otworzPanel(uzytkownik, "Marta Demo");
    const przyciski = within(panel).getAllByRole("button").map((b) => b.textContent);
    expect(przyciski).toEqual(["Zatwierdź", "Poproś o poprawkę", "Odrzuć dyżur", "Wróć do listy"]);
    expect(przyciskiGlowne().map((b) => b.textContent)).toEqual(["Zatwierdź"]);
  });

  it("„Ile godzin ma teraz”: zatwierdzone z karty osoby, wymagane z edycji, stan po zatwierdzeniu — wszystko przez jeden formater", async () => {
    godzinyOsoby = "18.5";
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    const panel = await otworzPanel(uzytkownik, "Marta Demo");
    await within(panel).findByText("Po zatwierdzeniu tego dyżuru: 22 h.");
    expect(wywolaniaPanelu().map(([sciezka]) => sciezka).sort()).toEqual(["/admin/edition", "/admin/users/17"]);
    expect(within(panel).getByRole("heading", { level: 3, name: "Ile godzin ma teraz" })).toBeInTheDocument();
    expect(within(panel).getByRole("progressbar", { name: "18,5 z 72 h" })).toHaveAttribute("aria-valuenow", "26");
    expect(panel.textContent).not.toMatch(/\d\.\d/);
  });

  it("godziny po zatwierdzeniu z ułamkiem: 18 + 3,5 → „21,5 h”", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    const panel = await otworzPanel(uzytkownik, "Marta Demo");
    await within(panel).findByText("Po zatwierdzeniu tego dyżuru: 21,5 h.");
  });

  it("brak wymaganych godzin (edycja nie odpowiada): same zatwierdzone godziny, bez mianownika i paska", async () => {
    wymaganeGodziny = new TypeError("Failed to fetch");
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    const panel = await otworzPanel(uzytkownik, "Marta Demo");
    await within(panel).findByText("18 h zatwierdzonych");
    expect(within(panel).queryByRole("progressbar")).toBeNull();
  });

  it("brak godzin osoby (karta nie odpowiada): panel mówi o tym wprost, nie podaje liczby, decyzje działają", async () => {
    godzinyOsoby = new TypeError("Failed to fetch");
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    const panel = await otworzPanel(uzytkownik, "Marta Demo");
    await within(panel).findByText("Nie udało się wczytać godzin tej osoby. Decyzję możesz podjąć bez nich.");
    expect(within(panel).queryByRole("progressbar")).toBeNull();
    expect(within(panel).getByRole("button", { name: "Zatwierdź" })).toBeInTheDocument();
  });

  it("karta osoby woła się dopiero przy otwarciu panelu, osobno dla każdej osoby", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    expect(wywolaniaPanelu()).toHaveLength(0);
    await otworzPanel(uzytkownik, "Marta Demo");
    await uzytkownik.click(within(screen.getByRole("region", { name: "Dyżur: Marta Demo" })).getByRole("button", { name: "Wróć do listy" }));
    await otworzPanel(uzytkownik, "Filip Demo");
    await waitFor(() => expect(api.mock.calls.some(([sciezka]) => sciezka === "/admin/users/18")).toBe(true));
  });

  it("naraz jeden panel: otwarcie drugiego wiersza zwija pierwszy", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    await otworzPanel(uzytkownik, "Marta Demo");
    await otworzPanel(uzytkownik, "Filip Demo");
    expect(screen.queryByRole("region", { name: "Dyżur: Marta Demo" })).toBeNull();
    expect(przyciskOtworz("Marta Demo")).toBeInTheDocument();
  });

  it("„Wróć do listy” zwija panel bez żądania decyzji i oddaje fokus „Otwórz” tego wiersza", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    const panel = await otworzPanel(uzytkownik, "Marta Demo");
    await uzytkownik.click(within(panel).getByRole("button", { name: "Wróć do listy" }));
    expect(screen.queryByRole("region", { name: /^Dyżur:/ })).toBeNull();
    expect(wywolaniaDecyzji()).toHaveLength(0);
    expect(przyciskOtworz("Marta Demo")).toHaveFocus();
  });
});

describe("StazKolejka — decyzje", () => {
  it("Zatwierdź: POST na accept bez ciała, wiersz znika, potwierdzenie w Toast, fokus na następnym wierszu", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    const panel = await otworzPanel(uzytkownik, "Marta Demo");
    dopiszDecyzje(wpis(91, { status: "accepted" }));
    await uzytkownik.click(within(panel).getByRole("button", { name: "Zatwierdź" }));
    await waitFor(() => expect(screen.queryByText("Marta Demo")).toBeNull());
    expect(wywolaniaDecyzji()).toHaveLength(1);
    expect(api).toHaveBeenCalledWith("/admin/internship/91/accept", { method: "POST" });
    expect(screen.getByRole("status")).toHaveTextContent("Dyżur zatwierdzony: Marta Demo.");
    expect(screen.getByText("Filip Demo")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /^Dyżur:/ })).toBeNull();
    expect(przyciskOtworz("Filip Demo")).toHaveFocus();
  });

  it("Poproś o poprawkę: sekcja w panelu bez okna dialogowego, jeden przycisk główny", async () => {
    const uzytkownik = userEvent.setup();
    const { container } = await renderZDanymi();
    expect(oknaDialogowe()).toHaveLength(0);
    const panel = await otworzPanel(uzytkownik, "Marta Demo");
    await uzytkownik.click(within(panel).getByRole("button", { name: "Poproś o poprawkę" }));
    const formularz = await screen.findByRole("form", { name: /Poproś o poprawkę: Marta Demo/ });
    expect(wierszPanelu("Marta Demo").contains(formularz)).toBe(true);
    expect(panel.contains(formularz)).toBe(true);
    expect(oknaDialogowe()).toHaveLength(0);
    expect(przyciskiGlowne()).toHaveLength(1);
    expect(within(formularz).getByRole("button", { name: "Wróć do listy" })).toBeInTheDocument();
    // Rząd akcji panelu ustępuje formularzowi: „Zatwierdź” nie stoi obok drugiego przycisku głównego.
    expect(screen.queryByRole("button", { name: "Zatwierdź" })).toBeNull();
    sprawdzSzablon(container);
  });

  it("kontrola: ta sama sekcja owinięta w Dialog jest wykryta jako okno dialogowe", () => {
    render(
      <Dialog
        tytul="Poproś o poprawkę"
        etykietaWycofania="Wróć do listy"
        etykietaPotwierdzenia="Poproś o poprawkę"
        onWycofaj={() => undefined}
        onPotwierdz={() => undefined}
      >
        <FormSection
          tytul="Poproś o poprawkę"
          pola={[{ id: "k", etykieta: "Komentarz", rodzaj: "wieloliniowy" }]}
          onAnuluj={() => undefined}
          onZapisz={() => undefined}
        />
      </Dialog>,
    );
    expect(oknaDialogowe().length).toBeGreaterThan(0);
  });

  it("otwarcie decyzji przenosi fokus na pierwsze pole formularza (sekcja otwierana działaniem)", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    const panel = await otworzPanel(uzytkownik, "Marta Demo");
    await uzytkownik.click(within(panel).getByRole("button", { name: "Poproś o poprawkę" }));
    const formularz = await screen.findByRole("form", { name: /Poproś o poprawkę: Marta Demo/ });
    const pierwsze = formularz.querySelector<HTMLElement>("input, textarea, button, [role='combobox']");
    expect(pierwsze).not.toBeNull();
    expect(pierwsze).toHaveFocus();
  });

  it("Poproś o poprawkę bez komentarza: 422 z serwera, błąd przy polu, wiersz zostaje", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    const panel = await otworzPanel(uzytkownik, "Marta Demo");
    await uzytkownik.click(within(panel).getByRole("button", { name: "Poproś o poprawkę" }));
    const formularz = await screen.findByRole("form", { name: /Poproś o poprawkę/ });
    dopiszDecyzje(
      blad(422, "validation_failed", "Popraw zaznaczone pola.", {
        comment: ["Dodaj komentarz przed odesłaniem wpisu."],
      }),
    );
    await uzytkownik.click(within(formularz).getByRole("button", { name: "Poproś o poprawkę" }));
    await waitFor(() => expect(within(formularz).getAllByText("Dodaj komentarz przed odesłaniem wpisu.").length).toBeGreaterThan(0));
    expect(api).toHaveBeenCalledWith("/admin/internship/91/return", { method: "POST", body: { comment: "" } });
    expect(wiersz("Marta Demo")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("Poproś o poprawkę z komentarzem: POST na return z komentarzem, wiersz znika, Toast", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    const panel = await otworzPanel(uzytkownik, "Marta Demo");
    await uzytkownik.click(within(panel).getByRole("button", { name: "Poproś o poprawkę" }));
    const formularz = await screen.findByRole("form", { name: /Poproś o poprawkę/ });
    await uzytkownik.type(within(formularz).getByRole("textbox", { name: /Co trzeba poprawić/ }), "Uzupełnij opis dyżuru.");
    dopiszDecyzje(wpis(91, { status: "returned", review_comment: "Uzupełnij opis dyżuru." }));
    await uzytkownik.click(within(formularz).getByRole("button", { name: "Poproś o poprawkę" }));
    await waitFor(() => expect(screen.queryByRole("form")).toBeNull());
    expect(api).toHaveBeenCalledWith("/admin/internship/91/return", {
      method: "POST",
      body: { comment: "Uzupełnij opis dyżuru." },
    });
    expect(screen.queryByText("Marta Demo")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Dyżur odesłany do poprawy. Marta Demo.");
  });

  it("Odrzuć dyżur z powodem: POST na reject, wiersz znika, Toast", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    const panel = await otworzPanel(uzytkownik, "Filip Demo");
    await uzytkownik.click(within(panel).getByRole("button", { name: "Odrzuć dyżur" }));
    const formularz = await screen.findByRole("form", { name: /Odrzuć dyżur: Filip Demo/ });
    expect(oknaDialogowe()).toHaveLength(0);
    await uzytkownik.type(within(formularz).getByRole("textbox", { name: /Powód odrzucenia/ }), "Dyżur nie odbył się.");
    dopiszDecyzje(wpis(92, { status: "rejected" }));
    await uzytkownik.click(within(formularz).getByRole("button", { name: "Odrzuć dyżur" }));
    await waitFor(() => expect(screen.queryByText("Filip Demo")).toBeNull());
    expect(api).toHaveBeenCalledWith("/admin/internship/92/reject", {
      method: "POST",
      body: { comment: "Dyżur nie odbył się." },
    });
    expect(screen.getByRole("status")).toHaveTextContent("Dyżur odrzucony. Filip Demo.");
  });

  it("Odrzuć dyżur bez powodu: 422 z serwera, błąd przy polu", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    const panel = await otworzPanel(uzytkownik, "Filip Demo");
    await uzytkownik.click(within(panel).getByRole("button", { name: "Odrzuć dyżur" }));
    const formularz = await screen.findByRole("form", { name: /Odrzuć dyżur/ });
    dopiszDecyzje(
      blad(422, "validation_failed", "Popraw zaznaczone pola.", { comment: ["Dodaj powód przed odrzuceniem wpisu."] }),
    );
    await uzytkownik.click(within(formularz).getByRole("button", { name: "Odrzuć dyżur" }));
    await waitFor(() => expect(within(formularz).getAllByText("Dodaj powód przed odrzuceniem wpisu.").length).toBeGreaterThan(0));
    expect(api).toHaveBeenCalledWith("/admin/internship/92/reject", { method: "POST", body: { comment: "" } });
  });

  it("entry_locked: komunikat z koperty, panel zamknięty, lista odświeżona bez rozstrzygniętego wpisu", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    const panel = await otworzPanel(uzytkownik, "Marta Demo");
    dopiszDecyzje(blad(403, "entry_locked", "Ten wpis został już rozstrzygnięty."));
    apiPaged.mockResolvedValueOnce({ data: [DWA_WPISY[1]], meta: { ...META, total: 1 } });
    await uzytkownik.click(within(panel).getByRole("button", { name: "Zatwierdź" }));
    await screen.findByText("Ten wpis został już rozstrzygnięty.");
    await waitFor(() => expect(screen.queryByText("Marta Demo")).toBeNull());
    expect(apiPaged).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Filip Demo")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /^Dyżur:/ })).toBeNull();
  });

  it("„Wróć do listy” w formularzu zamyka panel bez żądania, wiersz zostaje z „Otwórz”", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    const panel = await otworzPanel(uzytkownik, "Marta Demo");
    await uzytkownik.click(within(panel).getByRole("button", { name: "Odrzuć dyżur" }));
    const formularz = await screen.findByRole("form", { name: /Odrzuć dyżur/ });
    await uzytkownik.click(within(formularz).getByRole("button", { name: "Wróć do listy" }));
    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.queryByRole("region", { name: /^Dyżur:/ })).toBeNull();
    expect(wywolaniaDecyzji()).toHaveLength(0);
    expect(wiersz("Marta Demo")).toBeInTheDocument();
    expect(przyciskOtworz("Marta Demo")).toHaveFocus();
  });

  it("błąd sieci przy zapisie decyzji: komunikat, wiersz zostaje, lista nie jest wczytywana ponownie", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    const panel = await otworzPanel(uzytkownik, "Marta Demo");
    dopiszDecyzje(new TypeError("Failed to fetch"));
    await uzytkownik.click(within(panel).getByRole("button", { name: "Zatwierdź" }));
    await screen.findByText("Decyzja nie została zapisana");
    expect(screen.getByText("Nie udało się zapisać decyzji. Sprawdź połączenie i spróbuj ponownie.")).toBeInTheDocument();
    expect(wiersz("Marta Demo")).toBeInTheDocument();
    expect(apiPaged).toHaveBeenCalledTimes(1);
  });

  it("ostatni wpis na liście: po decyzji stan pusty", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi([DWA_WPISY[0]]);
    const panel = await otworzPanel(uzytkownik, "Marta Demo");
    dopiszDecyzje(wpis(91, { status: "accepted" }));
    apiPaged.mockResolvedValueOnce({ data: [], meta: { ...META, total: 0 } });
    await uzytkownik.click(within(panel).getByRole("button", { name: "Zatwierdź" }));
    await screen.findByRole("heading", { name: "Brak wpisów do decyzji" });
    expect(screen.getByRole("status")).toHaveTextContent("Dyżur zatwierdzony");
  });
});

describe("StazKolejka — data wpisu przez wspólny formater", () => {
  it("data kalendarzowa jako „27 sierpnia 2026”, brak daty jako „—”, bez surowego zapisu ISO", async () => {
    const uzytkownik = userEvent.setup();
    const bezDaty = wpis(93, { date: null, user: { id: 19, first_name: "Ewa", last_name: "Demo" } });
    await renderZDanymi([wpis(91), bezDaty]);
    const panelZData = await otworzPanel(uzytkownik, "Marta Demo");
    expect(panelZData).toHaveTextContent("Data27 sierpnia 2026");
    expect(panelZData.textContent).not.toContain("2026-08-27");
    const panelBezDaty = await otworzPanel(uzytkownik, "Ewa Demo");
    expect(panelBezDaty).toHaveTextContent("Data—");
    expect(panelBezDaty).not.toHaveTextContent("brak daty");
  });
});
