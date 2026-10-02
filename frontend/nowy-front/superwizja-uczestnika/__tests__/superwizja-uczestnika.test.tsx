import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { brakujaceKlucze, kluczeZasobu } from "../../staz-kolejka/__tests__/zrodla-ekranu";

/**
 * Ekran „Superwizja” (`SuperwizjaUczestnika`) na szablonie `ListTemplate`.
 * Każdy stan ma swój test: nagłówek, przycisk główny (i czy działa), zdanie
 * wyjaśniające, tekst stanu i nazwy dostępne wszystkich odnośników i
 * przycisków — ładowanie, błąd, brak połączenia, brak dostępu (wspólny
 * ekran odmowy), wygasły dostęp, nie znaleziono, brak terminów, same Twoje
 * terminy, wolne terminy do wyboru, pełny termin, zapis (zapisywanie,
 * zapisano, błąd serwera), wypis z potwierdzeniem i miniony termin z
 * obecnością. Atrapy mają klucze zasobu PHP i `openapi.json`.
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
const { SuperwizjaUczestnika } = await import("../SuperwizjaUczestnika");

const ZASOB = "backend/app/Http/Resources/H12/SupervisionSlotResource.php";
const KONTO = { id: 17, first_name: "Marta", last_name: "Demo", email: "marta@demo.pl", role: "volunteer" };
const LISTA = "/supervision/slots?page=1&per_page=25";

function termin(id: number, nadpisz: Record<string, unknown> = {}) {
  return {
    id,
    starts_at: "2026-10-15T12:00:00Z",
    duration_minutes: 60,
    seats_limit: 6,
    location_or_link: null,
    active_signups_count: 2,
    available_seats: 4,
    is_full: false,
    can_sign_up: true,
    signup: null,
    ...nadpisz,
  };
}

function zapis(attendance: "present" | "absent" | null = null) {
  return { signed_up_at: "2026-09-01T10:00:00Z", attendance };
}

/** Miniony termin z zapisem i potwierdzoną obecnością. */
const MINIONY_OBECNY = termin(1, {
  starts_at: "2026-09-10T09:00:00Z",
  location_or_link: "Sala szkoleniowa, piętro 1",
  active_signups_count: 5,
  available_seats: 1,
  can_sign_up: false,
  signup: zapis("present"),
});
/** Przyszły termin z zapisem osoby i odnośnikiem do spotkania. */
const TWOJ_PRZYSZLY = termin(3, {
  starts_at: "2026-10-08T12:00:00Z",
  location_or_link: "https://przyklad.test/superwizja-1",
  active_signups_count: 3,
  available_seats: 3,
  signup: zapis(),
});
/** Najbliższy wolny termin — na niego jest zielony „Zapisz się”. */
const WOLNY = termin(4);
const PELNY = termin(5, { starts_at: "2026-10-22T12:00:00Z", active_signups_count: 6, available_seats: 0, is_full: true });
const WOLNY_POZNIEJ = termin(6, {
  starts_at: "2026-10-29T13:00:00Z",
  // Po zmianie czasu na zimowy (25 października): 13:00 UTC to 14:00 w Polsce.
  duration_minutes: 90,
  active_signups_count: 1,
  available_seats: 5,
});
/** Termin, który odbył się bez zapisu osoby. */
const MINIONY_BEZ_ZAPISU = termin(7, { starts_at: "2026-09-17T09:00:00Z", can_sign_up: false });

const WSZYSTKIE = [MINIONY_OBECNY, MINIONY_BEZ_ZAPISU, TWOJ_PRZYSZLY, WOLNY, PELNY, WOLNY_POZNIEJ];

function meta(total: number, nadpisz: Record<string, unknown> = {}) {
  return { current_page: 1, per_page: 25, total, last_page: 1, ...nadpisz };
}

function blad(status: number, code: string, message: string) {
  return new ApiError({ status, code, message });
}

/** Atrapa transportu: `/me` dla ekranu odmowy, zapis i wypis z kolejki `akcje`. */
const akcje: Array<() => Promise<unknown>> = [];

function dopiszAkcje(wynik: unknown) {
  akcje.push(() => (wynik instanceof Error ? Promise.reject(wynik) : Promise.resolve(wynik)));
}

function wywolaniaAkcji() {
  return api.mock.calls.filter(([sciezka]) => String(sciezka).startsWith("/supervision/"));
}

function przyciskiGlowne(korzen: ParentNode = document) {
  return Array.from(korzen.querySelectorAll("button")).filter((b) =>
    b.className.split(/\s+/).some((klasa) => /(^|_)primary(_|$)/.test(klasa)),
  );
}

function sekcja(nazwa: string) {
  return screen.getByRole("region", { name: nazwa });
}

function karta(nazwaTerminu: string) {
  return screen.getByRole("article", { name: nazwaTerminu });
}

function sprawdzSzablon(container: HTMLElement) {
  expect(() => jedenMain(container)).not.toThrow();
  expect(container.querySelector("main")!.getAttribute("data-style-id")).toBe("szablon-lista");
  expect(screen.getByRole("heading", { level: 1, name: "Superwizja" })).toBeInTheDocument();
  expect(
    screen.getByText("Zapisz się na termin u swojego superwizora i sprawdź, czy Twoja obecność została potwierdzona."),
  ).toBeInTheDocument();
}

/** Każdy przycisk i odnośnik w treści ma niepustą nazwę dostępną. */
function sprawdzNazwyDostepne(container: HTMLElement) {
  const elementy = within(container.querySelector("main") as HTMLElement);
  for (const element of [...elementy.queryAllByRole("button"), ...elementy.queryAllByRole("link")]) {
    expect(element.getAttribute("aria-label") ?? element.textContent ?? "", element.outerHTML).not.toBe("");
  }
}

async function renderZDanymi(terminy: unknown[] = WSZYSTKIE, metaListy = meta(terminy.length)) {
  apiPaged.mockResolvedValueOnce({ data: terminy, meta: metaListy });
  const wynik = render(<SuperwizjaUczestnika />);
  await screen.findByRole("heading", { level: 2, name: terminy.length === 0 ? "Nie ma jeszcze terminów superwizji" : "Twoje terminy" });
  return wynik;
}

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
  back.mockReset();
  push.mockReset();
  akcje.length = 0;
  api.mockImplementation((sciezka: string) => {
    if (sciezka === "/me") return Promise.resolve(KONTO);
    const nastepna = akcje.shift();
    return nastepna ? nastepna() : Promise.reject(new Error(`Nieoczekiwane wywołanie ${sciezka}`));
  });
});

describe("SuperwizjaUczestnika — schemat atrap", () => {
  it("atrapa terminu ma wszystkie klucze zasobu PHP, a meta wszystkie wymagane klucze z openapi.json", () => {
    expect(brakujaceKlucze(TWOJ_PRZYSZLY, kluczeZasobu(ZASOB))).toEqual([]);
    // Odpowiedź listy ma w `openapi.json` dwa warianty (`anyOf`): z terminami i pusty; oba niosą te same klucze `meta`.
    const schemat = JSON.parse(readFileSync(join(process.cwd(), "..", "backend/openapi.json"), "utf-8")) as {
      paths: Record<string, { get: { responses: { 200: { content: { "application/json": { schema: { anyOf: { properties: { meta: { required: string[] } } }[] } } } } } } }>;
    };
    const warianty = schemat.paths["/v1/supervision/slots"].get.responses[200].content["application/json"].schema.anyOf;
    expect(warianty.length).toBeGreaterThan(0);
    for (const wariant of warianty) expect(brakujaceKlucze(meta(1), wariant.properties.meta.required)).toEqual([]);
  });
});

describe("SuperwizjaUczestnika — stany bez danych", () => {
  it("ładowanie: nagłówek i opis, szkielet, bez przycisku głównego; lista z tej samej ścieżki co stary ekran", () => {
    apiPaged.mockReturnValue(new Promise(() => undefined));
    const { container } = render(<SuperwizjaUczestnika />);
    sprawdzSzablon(container);
    expect(container.querySelector("[data-testid='obszar-lista'] [aria-busy='true']")).not.toBeNull();
    expect(przyciskiGlowne()).toHaveLength(0);
    expect(apiPaged).toHaveBeenCalledWith(LISTA);
  });

  it("błąd serwera: nagłówek stanu, zdanie wyjaśniające i „Spróbuj ponownie”, który wczytuje listę jeszcze raz", async () => {
    apiPaged.mockRejectedValueOnce(blad(500, "server_error", "Błąd serwera."));
    const uzytkownik = userEvent.setup();
    const { container } = render(<SuperwizjaUczestnika />);
    const komunikat = await screen.findByRole("alert");
    sprawdzSzablon(container);
    expect(within(komunikat).getByRole("heading", { level: 2, name: "Nie udało się wczytać terminów" })).toBeInTheDocument();
    expect(komunikat).toHaveTextContent("Coś poszło nie tak po naszej stronie. Twoje zapisy są bezpieczne — spróbuj ponownie za chwilę.");
    expect(komunikat).not.toHaveTextContent(/500|server_error/);
    const ponow = within(komunikat).getByRole("button", { name: "Spróbuj ponownie" });
    expect(ponow).toBeEnabled();
    expect(przyciskiGlowne()).toHaveLength(0);

    apiPaged.mockResolvedValueOnce({ data: [WOLNY], meta: meta(1) });
    await uzytkownik.click(ponow);
    expect(await screen.findByRole("heading", { level: 2, name: "Wolne terminy" })).toBeInTheDocument();
    expect(apiPaged).toHaveBeenCalledTimes(2);
  });

  it("brak połączenia: osobny nagłówek i zdanie o połączeniu, „Spróbuj ponownie” aktywny", async () => {
    apiPaged.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { container } = render(<SuperwizjaUczestnika />);
    const komunikat = await screen.findByRole("alert");
    sprawdzSzablon(container);
    expect(within(komunikat).getByRole("heading", { level: 2, name: "Brak połączenia" })).toBeInTheDocument();
    expect(komunikat).toHaveTextContent("Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie.");
    expect(within(komunikat).getByRole("button", { name: "Spróbuj ponownie" })).toBeEnabled();
    expect(przyciskiGlowne()).toHaveLength(0);
  });

  it("brak dostępu (403): wspólny ekran odmowy z rolą osoby i rolą docelową, jedno wyjście do pulpitu", async () => {
    api.mockImplementation((sciezka: string) =>
      sciezka === "/me" ? Promise.resolve({ ...KONTO, role: "student" }) : Promise.reject(new Error(sciezka)),
    );
    apiPaged.mockRejectedValueOnce(blad(403, "forbidden", "Brak dostępu."));
    const uzytkownik = userEvent.setup();
    const { container } = render(<SuperwizjaUczestnika />);
    const naglowek = await screen.findByRole("heading", { level: 2, name: "Nie masz dostępu do tego ekranu" });
    sprawdzSzablon(container);
    expect(await screen.findByText("Jesteś zalogowany jako Student. Ten ekran jest dla wolontariuszy.")).toBeInTheDocument();
    expect(screen.getByText("Na superwizję zapisują się osoby w programie wolontariackim.")).toBeInTheDocument();
    await waitFor(() => expect(naglowek).toHaveFocus());
    const obszar = naglowek.closest("section") as HTMLElement;
    expect(within(obszar).getAllByRole("button")).toHaveLength(1);
    expect(przyciskiGlowne()).toHaveLength(0);
    await uzytkownik.click(within(obszar).getByRole("button", { name: "Wróć do pulpitu" }));
    expect(push).toHaveBeenCalledWith("/panel/pulpit");
  });

  it("wygasły dostęp (403 access_expired): wspólny ekran „Twój dostęp wygasł.” ze zdaniem, co dalej", async () => {
    apiPaged.mockRejectedValueOnce(blad(403, "access_expired", "Twój dostęp wygasł."));
    render(<SuperwizjaUczestnika />);
    expect(await screen.findByRole("heading", { level: 2, name: "Twój dostęp wygasł." })).toBeInTheDocument();
    expect(
      screen.getByText("Na terminy superwizji nie da się teraz zapisać. Jeśli to pomyłka, napisz do zespołu programu."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Wróć do pulpitu" })).toBeEnabled();
  });

  it("nie znaleziono (404): wspólny ekran z nazwą rzeczy i „Odśwież”", async () => {
    apiPaged.mockRejectedValueOnce(blad(404, "not_found", "Nie znaleziono zasobu."));
    render(<SuperwizjaUczestnika />);
    expect(await screen.findByRole("heading", { level: 2, name: "Nie znaleziono terminów superwizji" })).toBeInTheDocument();
    expect(screen.getByText("Terminy mogą być chwilowo niedostępne. Odśwież stronę za chwilę.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Odśwież" })).toBeEnabled();
  });
});

describe("SuperwizjaUczestnika — brak terminów", () => {
  it("karta stanu pustego: nagłówek, zdanie skąd wezmą się terminy, „Odśwież”; bez przycisku głównego", async () => {
    const uzytkownik = userEvent.setup();
    const { container } = await renderZDanymi([]);
    sprawdzSzablon(container);
    expect(
      screen.getByText(
        "Terminy pojawią się tutaj, gdy Twój superwizor je wyznaczy. Lista jest też pusta, dopóki nie masz przypisanego superwizora.",
      ),
    ).toBeInTheDocument();
    expect(przyciskiGlowne()).toHaveLength(0);
    expect(screen.queryByRole("heading", { name: "Twoje terminy" })).toBeNull();
    apiPaged.mockResolvedValueOnce({ data: [], meta: meta(0) });
    await uzytkownik.click(screen.getByRole("button", { name: "Odśwież" }));
    await waitFor(() => expect(apiPaged).toHaveBeenCalledTimes(2));
  });
});

describe("SuperwizjaUczestnika — Twoje terminy", () => {
  it("same Twoje terminy: zdanie z liczbą, data z godziną, odnośnik do spotkania, obecność; bez przycisku głównego", async () => {
    const { container } = await renderZDanymi([MINIONY_OBECNY, TWOJ_PRZYSZLY]);
    sprawdzSzablon(container);
    const twoje = sekcja("Twoje terminy");
    expect(within(twoje).getByText("Masz zapis na 2 terminy.")).toBeInTheDocument();
    const przyszly = karta("8 października 2026, 14:00");
    expect(within(przyszly).getByRole("heading", { level: 3, name: "8 października 2026, 14:00" })).toBeInTheDocument();
    expect(przyszly).toHaveTextContent("Zapisano Cię");
    expect(przyszly).toHaveTextContent("Czas trwania60 minut");
    expect(przyszly).toHaveTextContent("ObecnośćObecność jeszcze nieoznaczona");
    const odnosnik = within(przyszly).getByRole("link", { name: "Dołącz do spotkania 8 października 2026, 14:00" });
    expect(odnosnik).toHaveAttribute("href", "https://przyklad.test/superwizja-1");
    expect(odnosnik).toHaveTextContent("Dołącz do spotkania");
    expect(within(przyszly).getByRole("button", { name: "Wypisz się z terminu 8 października 2026, 14:00" })).toBeEnabled();

    expect(within(sekcja("Wolne terminy")).getByText("Nie ma teraz wolnych terminów u Twojego superwizora. Zajrzyj tu później.")).toBeInTheDocument();
    expect(przyciskiGlowne()).toHaveLength(0);
    expect(container.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    sprawdzNazwyDostepne(container);
  });

  it("miniony termin z obecnością: plakietka obecności, miejsce jako tekst, wyłączony wypis ze zdaniem dlaczego", async () => {
    await renderZDanymi([MINIONY_OBECNY]);
    const miniony = karta("10 września 2026, 11:00");
    expect(miniony).toHaveTextContent("Obecność potwierdzona");
    expect(miniony).toHaveTextContent("Miejsce lub linkSala szkoleniowa, piętro 1");
    expect(within(miniony).queryByRole("link")).toBeNull();
    const wypis = within(miniony).getByRole("button", { name: "Wypisz się z terminu 10 września 2026, 11:00" });
    expect(wypis).toBeDisabled();
    expect(wypis).toHaveAccessibleDescription("Termin już się rozpoczął — wypis nie jest już możliwy.");
    expect(within(sekcja("Wolne terminy")).getByText("Nie ma teraz wolnych terminów u Twojego superwizora. Zajrzyj tu później.")).toBeInTheDocument();
  });

  it("obecność: nieobecność i brak wpisu nazwane wprost", async () => {
    await renderZDanymi([
      { ...MINIONY_OBECNY, signup: zapis("absent") },
      { ...MINIONY_BEZ_ZAPISU, id: 8, starts_at: "2026-09-24T09:00:00Z", signup: zapis(null) },
    ]);
    expect(karta("10 września 2026, 11:00")).toHaveTextContent("Nieobecność");
    expect(karta("24 września 2026, 11:00")).toHaveTextContent("Obecność jeszcze nieoznaczona");
  });

  it("termin, który odbył się bez zapisu: osobna część, wyłączony zapis ze zdaniem dlaczego", async () => {
    await renderZDanymi([MINIONY_BEZ_ZAPISU, WOLNY]);
    const minione = sekcja("Terminy, które już się odbyły");
    expect(within(minione).getByText("Na te terminy nie było Twojego zapisu.")).toBeInTheDocument();
    const kartaMinionego = karta("17 września 2026, 11:00");
    expect(kartaMinionego).toHaveTextContent("Termin już się odbył");
    const zapisz = within(kartaMinionego).getByRole("button", { name: "Zapisz się na termin 17 września 2026, 11:00" });
    expect(zapisz).toBeDisabled();
    expect(zapisz).toHaveAccessibleDescription("Termin już się rozpoczął — zapis nie jest już możliwy.");
    expect(within(sekcja("Twoje terminy")).getByText(
      "Nie masz jeszcze zapisu na żaden termin. Wybierz termin z listy „Wolne terminy” niżej.",
    )).toBeInTheDocument();
  });
});

describe("SuperwizjaUczestnika — wolne terminy", () => {
  it("wolne terminy do wyboru: zielony jest tylko zapis na najbliższy, reszta obrysowana; miejsca z odmianą", async () => {
    const { container } = await renderZDanymi();
    sprawdzSzablon(container);
    const wolne = sekcja("Wolne terminy");
    expect(within(wolne).getByText("Terminy Twojego superwizora, od najbliższego.")).toBeInTheDocument();
    expect(within(wolne).getAllByRole("article")).toHaveLength(3);

    const najblizszy = karta("15 października 2026, 14:00");
    expect(najblizszy).toHaveTextContent("Wolne miejsca");
    expect(najblizszy).toHaveTextContent("Wolne miejsca4 wolne miejsca");
    expect(najblizszy).toHaveTextContent("Zajęte miejsca2 z 6");
    expect(najblizszy).toHaveTextContent("Miejsce lub linkBez podanej lokalizacji.");
    const zielony = within(najblizszy).getByRole("button", { name: "Zapisz się na termin 15 października 2026, 14:00" });
    expect(zielony).toBeEnabled();
    expect(przyciskiGlowne()).toEqual([zielony]);

    const pozniejszy = karta("29 października 2026, 14:00");
    expect(pozniejszy).toHaveTextContent("90 minut");
    expect(pozniejszy).toHaveTextContent("5 wolnych miejsc");
    expect(within(pozniejszy).getByRole("button", { name: "Zapisz się na termin 29 października 2026, 14:00" })).toBeEnabled();
    expect(within(sekcja("Twoje terminy")).getByText("Masz zapis na 2 terminy.")).toBeInTheDocument();
    sprawdzNazwyDostepne(container);
  });

  it("pełny termin: plakietka „Brak wolnych miejsc”, wyłączony zapis ze zdaniem dlaczego; zielony przechodzi na następny wolny", async () => {
    await renderZDanymi([PELNY, WOLNY_POZNIEJ]);
    const pelny = karta("22 października 2026, 14:00");
    expect(within(pelny).getAllByText("Brak wolnych miejsc")).toHaveLength(2);
    const zapisz = within(pelny).getByRole("button", { name: "Zapisz się na termin 22 października 2026, 14:00" });
    expect(zapisz).toBeDisabled();
    expect(zapisz).toHaveAccessibleDescription("Brak wolnych miejsc — termin jest pełny. Wybierz inny termin.");
    expect(przyciskiGlowne()).toEqual([
      within(karta("29 października 2026, 14:00")).getByRole("button", { name: "Zapisz się na termin 29 października 2026, 14:00" }),
    ]);
  });

  it("każdy wyłączony przycisk ma zdanie z powodem", async () => {
    await renderZDanymi();
    const wylaczone = screen.getAllByRole("button").filter((przycisk) => (przycisk as HTMLButtonElement).disabled);
    expect(wylaczone.length).toBe(3);
    for (const przycisk of wylaczone) expect(przycisk).toHaveAccessibleDescription(/.+/);
  });

  it("więcej terminów niż jedna strona: zdanie, ile terminów widać", async () => {
    await renderZDanymi([WOLNY], meta(30, { last_page: 2 }));
    expect(screen.getByText("Widzisz pierwsze 25 terminów z 30.")).toBeInTheDocument();
  });

  it("axe: brak naruszeń przy pełnej liście", async () => {
    const { container } = await renderZDanymi();
    const wynik = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(wynik.violations.map((n) => `${n.id}: ${n.nodes.map((w) => w.target.join(" ")).join(" | ")}`)).toEqual([]);
  });
});

describe("SuperwizjaUczestnika — zapis na termin", () => {
  it("zapisywanie: przycisk mówi „Zapisywanie…”, drugie kliknięcie niczego nie wysyła", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    akcje.push(() => new Promise(() => undefined));
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz się na termin 15 października 2026, 14:00" }));
    const trwa = await screen.findByRole("button", { name: "Zapisywanie na termin 15 października 2026, 14:00" });
    expect(trwa).toHaveTextContent("Zapisywanie…");
    await uzytkownik.click(trwa);
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz się na termin 29 października 2026, 14:00" }));
    expect(wywolaniaAkcji()).toEqual([["/supervision/slots/4/signup", { method: "POST" }]]);
  });

  it("zapisano: POST bez ciała, wspólne potwierdzenie z datą, karta przechodzi do „Twoje terminy”, fokus na jej przycisku", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    dopiszAkcje({ ...WOLNY, active_signups_count: 3, available_seats: 3, signup: zapis() });
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz się na termin 15 października 2026, 14:00" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Zapisano Cię na termin 15 października 2026, 14:00.");
    expect(wywolaniaAkcji()).toEqual([["/supervision/slots/4/signup", { method: "POST" }]]);
    const twoje = sekcja("Twoje terminy");
    expect(within(twoje).getByRole("article", { name: "15 października 2026, 14:00" })).toHaveTextContent("Zapisano Cię");
    expect(within(twoje).getByText("Masz zapis na 3 terminy.")).toBeInTheDocument();
    const wypis = screen.getByRole("button", { name: "Wypisz się z terminu 15 października 2026, 14:00" });
    await waitFor(() => expect(wypis).toHaveFocus());
    // Zielony przechodzi na następny termin, na który można się zapisać.
    expect(przyciskiGlowne()).toEqual([screen.getByRole("button", { name: "Zapisz się na termin 29 października 2026, 14:00" })]);
    expect(apiPaged).toHaveBeenCalledTimes(1);
  });

  it("błąd serwera przy zapisie (409 slot_full): zdanie przy karcie, lista wczytana jeszcze raz", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    dopiszAkcje(blad(409, "slot_full", "Ten termin nie ma już wolnych miejsc."));
    apiPaged.mockResolvedValueOnce({
      data: WSZYSTKIE.map((t) => (t.id === 4 ? { ...t, active_signups_count: 6, available_seats: 0, is_full: true } : t)),
      meta: meta(6),
    });
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz się na termin 15 października 2026, 14:00" }));

    const kartaTerminu = karta("15 października 2026, 14:00");
    const komunikat = await within(kartaTerminu).findByRole("alert");
    expect(within(komunikat).getByRole("heading", { name: "Nie udało się zapisać na termin" })).toBeInTheDocument();
    expect(komunikat).toHaveTextContent("Ten termin został właśnie zapełniony. Wybierz inny termin.");
    expect(komunikat).not.toHaveTextContent(/409|slot_full/);
    await waitFor(() => expect(apiPaged).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(within(kartaTerminu).getByRole("button", { name: "Zapisz się na termin 15 października 2026, 14:00" })).toBeDisabled(),
    );
    expect(karta("15 października 2026, 14:00")).toHaveTextContent("Brak wolnych miejsc");
  });

  it("brak połączenia przy zapisie i nieudane odświeżenie: zdanie przy karcie, lista zostaje z komunikatem nad nią", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    dopiszAkcje(new TypeError("Failed to fetch"));
    apiPaged.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await uzytkownik.click(screen.getByRole("button", { name: "Zapisz się na termin 15 października 2026, 14:00" }));

    expect(
      await within(karta("15 października 2026, 14:00")).findByText(
        "Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie.",
      ),
    ).toBeInTheDocument();
    const odswiezenie = (await screen.findByRole("heading", { name: "Nie udało się odświeżyć listy" })).parentElement as HTMLElement;
    expect(odswiezenie).toHaveTextContent("Widzisz terminy sprzed odświeżenia — liczba wolnych miejsc mogła się zmienić.");
    expect(within(odswiezenie.parentElement as HTMLElement).getByRole("button", { name: "Spróbuj ponownie" })).toBeEnabled();
    expect(screen.getAllByRole("article")).toHaveLength(6);
  });
});

describe("SuperwizjaUczestnika — wypis z potwierdzeniem", () => {
  it("„Wypisz się” pyta w oknie: tytuł, zdanie z datą, „Nie wypisuj” z fokusem; wycofanie niczego nie wysyła", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    const wypis = screen.getByRole("button", { name: "Wypisz się z terminu 8 października 2026, 14:00" });
    await uzytkownik.click(wypis);

    const okno = await screen.findByRole("dialog", { name: "Wypisać Cię z terminu?" });
    expect(okno).toHaveTextContent(
      "Termin 8 października 2026, 14:00. Twoje miejsce zwolni się dla innych osób. Zapisać się ponownie możesz, dopóki termin się nie rozpoczął i są wolne miejsca.",
    );
    const wycofaj = within(okno).getByRole("button", { name: "Nie wypisuj" });
    await waitFor(() => expect(wycofaj).toHaveFocus());
    expect(przyciskiGlowne(okno)).toEqual([within(okno).getByRole("button", { name: "Wypisz się" })]);
    // Zielony przycisk bez czerwonego napisu wariantu „niebezpieczne” (czerwień na zieleni jest nieczytelna).
    expect(within(okno).getByRole("button", { name: "Wypisz się" }).className).not.toMatch(/niebezpieczny/);

    await uzytkownik.click(wycofaj);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(wywolaniaAkcji()).toEqual([]);
    await waitFor(() => expect(wypis).toHaveFocus());
  });

  it("potwierdzenie: DELETE bez ciała, wspólne potwierdzenie, karta wraca do „Wolne terminy”", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    await uzytkownik.click(screen.getByRole("button", { name: "Wypisz się z terminu 8 października 2026, 14:00" }));
    const okno = await screen.findByRole("dialog", { name: "Wypisać Cię z terminu?" });
    dopiszAkcje({ ...TWOJ_PRZYSZLY, active_signups_count: 2, available_seats: 4, signup: null });
    await uzytkownik.click(within(okno).getByRole("button", { name: "Wypisz się" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Wypisano Cię z terminu 8 października 2026, 14:00.");
    expect(wywolaniaAkcji()).toEqual([["/supervision/slots/3/signup", { method: "DELETE" }]]);
    const wolne = sekcja("Wolne terminy");
    expect(within(wolne).getByRole("article", { name: "8 października 2026, 14:00" })).toHaveTextContent("Wolne miejsca");
    expect(within(sekcja("Twoje terminy")).getByText("Masz zapis na 1 termin.")).toBeInTheDocument();
    // Zwolniony termin jest teraz najbliższym wolnym — jego zapis jest zielony i dostaje fokus.
    const zapisz = screen.getByRole("button", { name: "Zapisz się na termin 8 października 2026, 14:00" });
    await waitFor(() => expect(zapisz).toHaveFocus());
    expect(przyciskiGlowne()).toEqual([zapisz]);
  });

  it("błąd przy wypisie (422 po rozpoczęciu): zdanie serwera przy karcie, lista wczytana jeszcze raz", async () => {
    const uzytkownik = userEvent.setup();
    await renderZDanymi();
    await uzytkownik.click(screen.getByRole("button", { name: "Wypisz się z terminu 8 października 2026, 14:00" }));
    const okno = await screen.findByRole("dialog", { name: "Wypisać Cię z terminu?" });
    dopiszAkcje(blad(422, "validation_failed", "Po rozpoczęciu terminu nie można się wypisać."));
    apiPaged.mockResolvedValueOnce({ data: WSZYSTKIE, meta: meta(6) });
    await uzytkownik.click(within(okno).getByRole("button", { name: "Wypisz się" }));

    const komunikat = await within(karta("8 października 2026, 14:00")).findByRole("alert");
    expect(within(komunikat).getByRole("heading", { name: "Nie udało się wypisać z terminu" })).toBeInTheDocument();
    expect(komunikat).toHaveTextContent("Po rozpoczęciu terminu nie można się wypisać.");
    await waitFor(() => expect(apiPaged).toHaveBeenCalledTimes(2));
  });
});
