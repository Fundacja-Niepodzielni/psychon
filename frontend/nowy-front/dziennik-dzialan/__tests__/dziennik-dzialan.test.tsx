import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";
import { brakujaceKlucze, kluczeZasobu } from "../../staz-kolejka/__tests__/zrodla-ekranu";

/**
 * Ekran „Dziennik działań” (`DziennikDzialan`) na szablonie `ListTemplate`.
 * Każdy stan ma swój test: nagłówek, przyciski (i czy działają), zdanie
 * wyjaśniające i nazwy dostępne — ładowanie, błąd, brak połączenia, brak
 * dostępu (wspólny ekran odmowy), nie znaleziono, pusty dziennik, brak wyników
 * filtra, lista, lista zawężona do osoby (znacznik „Dotyczy”), ostatnia strona.
 * Do tego: zmiana filtra zostawia fokus w polu i ogłasza wynik, gotowe zakresy
 * dat, pobranie pliku z bieżącymi filtrami. Atrapy mają klucze zasobu PHP.
 */

const api = vi.fn();
const apiPaged = vi.fn();
const downloadFile = vi.fn();
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
vi.mock("@/lib/api/pliki", () => ({ downloadFile: (...a: unknown[]) => downloadFile(...a) }));

const { ApiError } = await import("@/lib/api/klient");
const { DziennikDzialan, ETYKIETA_POBRANIA, OPIS, UWAGA_POBRANIA } = await import("../DziennikDzialan");

const ZASOB = "backend/app/Http/Resources/AuditLogEntryResource.php";
const KONTO = { id: 2, first_name: "Anna", last_name: "Opiekun", email: "anna@demo.pl", role: "project_manager" };

function wpis(id: number, nadpisz: Record<string, unknown> = {}) {
  return {
    id,
    action: "internship.accepted",
    group: { key: "staz", label: "Staż i dyżury" },
    actor: { id: 2, first_name: "Anna", last_name: "Opiekun" },
    subject: { person: { id: 17, first_name: "Marta", last_name: "Demo" }, label: "Wpis w dzienniku stażu" },
    subject_type: "InternshipEntry",
    subject_id: 91,
    details: { entry_id: 91 },
    created_at: "2026-10-02T12:05:00Z",
    ...nadpisz,
  };
}

const WPISY = [
  wpis(503),
  wpis(502, {
    action: "course.created",
    group: { key: "kursy", label: "Kursy i testy" },
    subject: { person: null, label: "Interwencja kryzysowa" },
    created_at: "2026-10-01T08:00:00Z",
  }),
  wpis(501, {
    action: "application.rejected",
    group: { key: "nabor", label: "Nabór" },
    actor: null,
    subject: { person: { id: null, first_name: "Ola", last_name: "Demo" }, label: "Zgłoszenie rekrutacyjne" },
    created_at: "2026-09-30T18:50:00Z",
  }),
];

function meta(total: number, nadpisz: Record<string, unknown> = {}) {
  return { current_page: 1, per_page: 25, total, last_page: Math.max(1, Math.ceil(total / 25)), ...nadpisz };
}

function blad(status: number, code: string) {
  return new ApiError({ status, code, message: "Komunikat serwera." });
}

function przyciskiGlowne() {
  return Array.from(document.querySelectorAll("button")).filter((b) =>
    b.className.split(/\s+/).some((klasa) => /(^|_)primary(_|$)/.test(klasa)),
  );
}

function sprawdzSzablon(container: HTMLElement) {
  expect(() => jedenMain(container)).not.toThrow();
  expect(container.querySelector("main")!.getAttribute("data-style-id")).toBe("szablon-lista");
  expect(screen.getByRole("heading", { level: 1, name: "Dziennik działań" })).toBeInTheDocument();
  expect(screen.getByText(OPIS)).toBeInTheDocument();
}

/** Ostatnie zapytanie listy jako obiekt parametrów. */
function ostatnieZapytanie(): Record<string, string> {
  const sciezka = String(apiPaged.mock.calls.at(-1)?.[0] ?? "");
  expect(sciezka.startsWith("/admin/audit")).toBe(true);
  return Object.fromEntries(new URLSearchParams(sciezka.split("?")[1] ?? ""));
}

/** Ekran z kontrolą znacznika „Dotyczy” tak, jak robi to strona z adresem. */
function ZAdresu({ start }: { start: number | null }) {
  const [dotyczy, setDotyczy] = useState<number | null>(start);
  return <DziennikDzialan dotyczy={dotyczy} onUsunDotyczy={() => setDotyczy(null)} />;
}

async function renderZDanymi(wpisy: unknown[] = WPISY, metaListy = meta(482), dotyczy: number | null = null) {
  apiPaged.mockResolvedValueOnce({ data: wpisy, meta: metaListy });
  const wynik = render(<ZAdresu start={dotyczy} />);
  await waitFor(() => expect(document.querySelector("[aria-busy='true']")).toBeNull());
  return wynik;
}

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
  downloadFile.mockReset();
  back.mockReset();
  api.mockImplementation((sciezka: string) => {
    if (sciezka === "/me") return Promise.resolve(KONTO);
    if (sciezka === "/admin/edition") return Promise.resolve({ starts_at: "2026-02-01", ends_at: "2027-01-31" });
    return Promise.reject(new Error(`Nieoczekiwane wywołanie ${sciezka}`));
  });
});

describe("DziennikDzialan — schemat atrap", () => {
  it("atrapa wpisu ma wszystkie klucze zasobu PHP", () => {
    expect(brakujaceKlucze(wpis(1), kluczeZasobu(ZASOB))).toEqual([]);
  });
});

describe("DziennikDzialan — stany bez wpisów", () => {
  it("ładowanie: nagłówek i zdanie pod nim, szkielet, filtry na miejscu, bez przycisku pobrania", () => {
    apiPaged.mockReturnValue(new Promise(() => undefined));
    const { container } = render(<ZAdresu start={null} />);
    sprawdzSzablon(container);
    expect(container.querySelector("[data-testid='obszar-lista'] [aria-busy='true']")).not.toBeNull();
    expect(screen.getByRole("form", { name: "Filtry dziennika" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: ETYKIETA_POBRANIA })).toBeNull();
    expect(przyciskiGlowne()).toHaveLength(0);
    expect(ostatnieZapytanie()).toEqual({ page: "1", per_page: "25" });
  });

  it("błąd serwera: nagłówek stanu, zdanie i „Spróbuj ponownie”, który wczytuje jeszcze raz", async () => {
    apiPaged.mockRejectedValueOnce(blad(500, "server_error"));
    const uzytkownik = userEvent.setup();
    const { container } = render(<ZAdresu start={null} />);
    const komunikat = await screen.findByRole("alert");
    sprawdzSzablon(container);
    expect(within(komunikat).getByRole("heading", { level: 2, name: "Nie udało się wczytać dziennika" })).toBeInTheDocument();
    expect(komunikat).toHaveTextContent("Coś poszło nie tak po naszej stronie. Spróbuj ponownie za chwilę.");
    expect(komunikat).not.toHaveTextContent(/500|server_error/);
    apiPaged.mockResolvedValueOnce({ data: WPISY, meta: meta(3) });
    await uzytkownik.click(within(komunikat).getByRole("button", { name: "Spróbuj ponownie" }));
    expect(await screen.findByRole("table", { name: "Wpisy dziennika" })).toBeInTheDocument();
  });

  it("brak połączenia: osobny nagłówek i zdanie o połączeniu, „Spróbuj ponownie” aktywny", async () => {
    apiPaged.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<ZAdresu start={null} />);
    const komunikat = await screen.findByRole("alert");
    expect(within(komunikat).getByRole("heading", { level: 2, name: "Brak połączenia" })).toBeInTheDocument();
    expect(komunikat).toHaveTextContent("Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie.");
    expect(within(komunikat).getByRole("button", { name: "Spróbuj ponownie" })).toBeEnabled();
  });

  it("brak dostępu (403): wspólny ekran odmowy, bez filtrów, jedno wyjście „Wróć”", async () => {
    api.mockImplementation((sciezka: string) =>
      sciezka === "/me" ? Promise.resolve({ ...KONTO, role: "volunteer" }) : Promise.reject(new Error(sciezka)),
    );
    apiPaged.mockRejectedValueOnce(blad(403, "forbidden"));
    const uzytkownik = userEvent.setup();
    const { container } = render(<ZAdresu start={null} />);
    const naglowek = await screen.findByRole("heading", { level: 2, name: "Nie masz dostępu do tego ekranu" });
    sprawdzSzablon(container);
    expect(await screen.findByText("Jesteś zalogowany jako Wolontariusz. Ten ekran jest dla administracji.")).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Filtry dziennika" })).toBeNull();
    const obszar = naglowek.closest("section") as HTMLElement;
    expect(within(obszar).getAllByRole("button")).toHaveLength(1);
    await uzytkownik.click(within(obszar).getByRole("button", { name: "Wróć" }));
    expect(back).toHaveBeenCalled();
  });

  it("nie znaleziono (404): wspólny ekran z nazwą rzeczy i „Odśwież”", async () => {
    apiPaged.mockRejectedValueOnce(blad(404, "not_found"));
    render(<ZAdresu start={null} />);
    expect(await screen.findByRole("heading", { level: 2, name: "Nie znaleziono dziennika działań" })).toBeInTheDocument();
    expect(screen.getByText("Dziennik może być chwilowo niedostępny. Odśwież stronę za chwilę.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Odśwież" })).toBeEnabled();
  });

  it("pusty dziennik: nagłówek, zdanie skąd biorą się wpisy, „Odśwież”; bez pobrania i bez „Wyczyść filtry”", async () => {
    const { container } = await renderZDanymi([], meta(0));
    sprawdzSzablon(container);
    expect(screen.getByRole("heading", { level: 2, name: "Dziennik jest pusty" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Wpisy pojawią się tutaj, gdy ktoś wykona w systemie ważną czynność, na przykład zatwierdzi dyżur albo wyda certyfikat.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Odśwież" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: ETYKIETA_POBRANIA })).toBeNull();
    expect(screen.queryByRole("button", { name: "Wyczyść filtry" })).toBeNull();
  });

  it("brak wyników filtra: „Nic nie pasuje do filtrów.” i „Wyczyść filtry”, który wraca do pełnej listy", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    apiPaged.mockResolvedValueOnce({ data: [], meta: meta(0) });
    await uzytkownik.click(screen.getByRole("combobox", { name: "Rodzaj" }));
    await uzytkownik.click(screen.getByRole("option", { name: "Superwizja" }));

    expect(await screen.findByRole("heading", { level: 2, name: "Nic nie pasuje do filtrów." })).toBeInTheDocument();
    expect(ostatnieZapytanie()).toMatchObject({ group: "superwizja", page: "1" });
    const wyczysc = screen.getAllByRole("button", { name: "Wyczyść filtry" });
    expect(wyczysc.length).toBeGreaterThanOrEqual(1);
    apiPaged.mockResolvedValueOnce({ data: WPISY, meta: meta(482) });
    await uzytkownik.click(wyczysc.at(-1)!);
    expect(await screen.findByRole("table", { name: "Wpisy dziennika" })).toBeInTheDocument();
    expect(ostatnieZapytanie()).toEqual({ page: "1", per_page: "25" });
  });
});

describe("DziennikDzialan — lista", () => {
  it("kolumny Kiedy, Co, Kogo dotyczy, Kto; data po polsku, grupa, zdanie, osoba z odnośnikiem do karty", async () => {
    const { container } = await renderZDanymi();
    sprawdzSzablon(container);
    const tabela = screen.getByRole("table", { name: "Wpisy dziennika" });
    expect(within(tabela).getAllByRole("columnheader").map((n) => n.textContent)).toEqual(["Kiedy", "Co", "Kogo dotyczy", "Kto"]);
    const [, pierwszy, drugi, trzeci] = within(tabela).getAllByRole("row");
    const komorki = within(pierwszy).getAllByRole("cell");
    expect(komorki[0]).toHaveTextContent("2 października 2026, 14:05");
    expect(komorki[1]).toHaveTextContent("Staż i dyżury");
    expect(komorki[1]).toHaveTextContent("Zatwierdzono dyżur");
    expect(komorki[1]).toHaveTextContent("Wpis w dzienniku stażu");
    const odnosnik = within(komorki[2]).getByRole("link", { name: "Karta osoby: Marta Demo" });
    expect(odnosnik).toHaveAttribute("href", "/admin/uczestniczki/17");
    expect(komorki[3]).toHaveTextContent("Anna Opiekun");
    // Kurs: tytuł w „Kogo dotyczy”, bez odnośnika; osoba ze zgłoszenia bez konta — bez odnośnika; bez wykonawcy — „System”.
    expect(within(drugi).getAllByRole("cell")[2]).toHaveTextContent("Interwencja kryzysowa");
    expect(within(drugi).queryByRole("link")).toBeNull();
    expect(within(trzeci).getAllByRole("cell")[2]).toHaveTextContent("Ola Demo");
    expect(within(trzeci).queryByRole("link")).toBeNull();
    expect(within(trzeci).getAllByRole("cell")[3]).toHaveTextContent("System");
    // Nigdy typ techniczny i numer, kod zdarzenia, ładunek ani zapis techniczny daty.
    expect(tabela.textContent).not.toMatch(/InternshipEntry|#91|internship\.accepted|entry_id|2026-10-02T/);
  });

  it("licznik „25 z 482”, pobranie z uwagą o nazwiskach, jedyny przycisk główny — brak; stronicowanie", async () => {
    await renderZDanymi(WPISY, meta(482));
    expect(screen.getByText("Na tej stronie: 3 z 482")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: ETYKIETA_POBRANIA })).toBeEnabled();
    expect(screen.getByText(UWAGA_POBRANIA)).toBeInTheDocument();
    expect(przyciskiGlowne()).toHaveLength(0);
    const nawigacja = screen.getByRole("navigation", { name: "Stronicowanie" });
    expect(nawigacja).toHaveTextContent("Strona 1 z 20");
    expect(within(nawigacja).getByRole("button", { name: "Poprzednia" })).toBeDisabled();
    expect(within(nawigacja).getByRole("button", { name: "Następna" })).toBeEnabled();
  });

  it("ostatnia strona: „Strona 20 z 20”, „Następna” nieaktywna, licznik wpisów z tej strony", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi(WPISY, meta(482));
    apiPaged.mockResolvedValueOnce({ data: WPISY.slice(0, 2), meta: meta(482, { current_page: 20, last_page: 20 }) });
    // Atrapa odpowiada na „Następna” ostatnią stroną — sprawdzany jest stan ostatniej strony.
    await uzytkownik.click(screen.getByRole("button", { name: "Następna" }));
    const nawigacja = await screen.findByRole("navigation", { name: "Stronicowanie" });
    await waitFor(() => expect(nawigacja).toHaveTextContent("Strona 20 z 20"));
    expect(within(nawigacja).getByRole("button", { name: "Następna" })).toBeDisabled();
    expect(within(nawigacja).getByRole("button", { name: "Poprzednia" })).toBeEnabled();
    expect(screen.getByText("Na tej stronie: 2 z 482")).toBeInTheDocument();
    expect(ostatnieZapytanie()).toMatchObject({ page: "2", per_page: "25" });
    expect(screen.getByRole("status")).toHaveTextContent("Pokazano 2 z 482 wpisów");
  });

  it("filtry: etykiety pól, wszystkie rodzaje, gotowe zakresy; każdy przycisk ma nazwę dostępną", async () => {
    await renderZDanymi();
    const filtry = screen.getByRole("form", { name: "Filtry dziennika" });
    for (const etykieta of ["Od", "Do", "Kogo dotyczy", "Kto"]) {
      expect(within(filtry).getByLabelText(etykieta)).toBeInTheDocument();
    }
    expect(within(filtry).getByRole("combobox", { name: "Rodzaj" })).toHaveTextContent("Wszystkie rodzaje");
    const zakresy = within(filtry).getByRole("group", { name: "Gotowy zakres dat" });
    expect(within(zakresy).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Dziś",
      "Ostatnie 7 dni",
      "Ten miesiąc",
      "Cały rok programu",
    ]);
    for (const przycisk of screen.getAllByRole("button")) {
      expect((przycisk.getAttribute("aria-label") ?? przycisk.textContent ?? "").trim(), przycisk.outerHTML).not.toBe("");
    }
  });

  it("zmiana filtra zostawia fokus w polu i ogłasza „Pokazano … z … wpisów”", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    const kto = screen.getByLabelText("Kto");
    apiPaged.mockResolvedValueOnce({ data: WPISY.slice(0, 1), meta: meta(1) });
    await uzytkownik.type(kto, "Anna");

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Pokazano 1 z 1 wpisu"));
    expect(kto).toHaveFocus();
    expect(kto).toHaveValue("Anna");
    expect(ostatnieZapytanie()).toMatchObject({ actor_search: "Anna", page: "1" });
    // Po chwili przerwy w pisaniu — jeden odczyt, nie jeden na każdy znak.
    expect(apiPaged).toHaveBeenCalledTimes(2);
  });

  it("daty: zmiana „Od” odczytuje listę od razu, granice dni idą jako chwile UTC; zły zakres ma zdanie i nie idzie do serwera", async () => {
    await renderZDanymi();
    apiPaged.mockResolvedValue({ data: WPISY, meta: meta(3) });
    const od = screen.getByLabelText("Od");
    fireEvent.change(od, { target: { value: "2026-10-01" } });
    await waitFor(() => expect(ostatnieZapytanie()).toMatchObject({ from: "2026-09-30T22:00:00.000Z" }));
    const liczbaOdczytow = apiPaged.mock.calls.length;

    fireEvent.change(screen.getByLabelText("Do"), { target: { value: "2026-09-01" } });
    expect(await screen.findByText("Data „Od” jest późniejsza niż data „Do”. Zmień jedną z nich.")).toBeInTheDocument();
    expect(apiPaged.mock.calls.length).toBe(liczbaOdczytow);
  });

  it("„Cały rok programu” bierze daty edycji", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    apiPaged.mockResolvedValue({ data: WPISY, meta: meta(3) });
    await uzytkownik.click(screen.getByRole("button", { name: "Cały rok programu" }));
    await waitFor(() => expect(screen.getByLabelText("Od")).toHaveValue("2026-02-01"));
    expect(screen.getByLabelText("Do")).toHaveValue("2027-01-31");
    expect(api).toHaveBeenCalledWith("/admin/edition");
    expect(ostatnieZapytanie()).toMatchObject({ from: "2026-01-31T23:00:00.000Z", to: "2027-01-31T22:59:59.999Z" });
  });

  it("pobranie pliku: te same filtry co lista, bez stron; w trakcie przycisk mówi „Pobieranie…”", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    apiPaged.mockResolvedValue({ data: WPISY, meta: meta(3) });
    await uzytkownik.click(screen.getByRole("combobox", { name: "Rodzaj" }));
    await uzytkownik.click(screen.getByRole("option", { name: "Staż i dyżury" }));
    await screen.findByRole("table", { name: "Wpisy dziennika" });

    let zakoncz: () => void = () => undefined;
    downloadFile.mockReturnValue(new Promise<void>((r) => (zakoncz = r)));
    await uzytkownik.click(screen.getByRole("button", { name: ETYKIETA_POBRANIA }));
    expect(screen.getByRole("button", { name: "Pobieranie…" })).toBeDisabled();
    const [adres, nazwa] = downloadFile.mock.calls[0] as [string, string];
    expect(adres).toMatch(/\/api\/v1\/admin\/audit\/export\.csv\?group=staz$/);
    expect(nazwa).toBe("dziennik-dzialan.csv");
    zakoncz();
    expect(await screen.findByRole("heading", { name: "Plik pobrany" })).toBeInTheDocument();
  });

  it("axe: brak naruszeń na liście", async () => {
    const { container } = await renderZDanymi();
    const wynik = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(wynik.violations.map((n) => `${n.id}: ${n.nodes.map((w) => w.target.join(" ")).join(" | ")}`)).toEqual([]);
  });
});

describe("DziennikDzialan — lista zawężona do osoby", () => {
  it("znacznik „Dotyczy: Imię Nazwisko ×” z osobą z adresu; zapytanie po osobie; × zdejmuje filtr", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi([WPISY[0]], meta(1), 17);
    expect(ostatnieZapytanie()).toEqual({ subject_user_id: "17", page: "1", per_page: "25" });
    expect(screen.getByText("Dotyczy: Marta Demo")).toBeInTheDocument();
    const usun = screen.getByRole("button", { name: "Usuń filtr — Dotyczy: Marta Demo" });
    expect(usun).toHaveTextContent("×");

    apiPaged.mockResolvedValue({ data: WPISY, meta: meta(482) });
    await uzytkownik.click(usun);
    await waitFor(() => expect(screen.queryByText(/^Dotyczy:/)).toBeNull());
    await waitFor(() => expect(ostatnieZapytanie()).toEqual({ page: "1", per_page: "25" }));
    expect(await screen.findByText("Na tej stronie: 3 z 482")).toBeInTheDocument();
  });

  it("osoba bez wpisów: znacznik bez nazwiska mówi „wybrana osoba”, pusty wynik to „Nic nie pasuje do filtrów.”", async () => {
    await renderZDanymi([], meta(0), 99);
    expect(screen.getByText("Dotyczy: wybrana osoba")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Nic nie pasuje do filtrów." })).toBeInTheDocument();
  });
});
