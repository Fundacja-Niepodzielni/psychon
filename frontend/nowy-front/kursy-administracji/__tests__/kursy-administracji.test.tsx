import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";
import { brakujaceKlucze, kluczeMetaZOpenApi, kluczeZasobu } from "../../staz-kolejka/__tests__/zrodla-ekranu";

/**
 * Ekran „Kursy” (administracja) na szablonie `ListTemplate`:
 *  - każdy stan (ładowanie, dane, pusty, brak uprawnień, błąd) ma jeden `main`
 *    i znacznik szablonu;
 *  - lista w kolumnach: Kurs (pod nazwą typ · grupa), Stan, Miejsce w ścieżce,
 *    Lekcje i akcja „Otwórz” z adresem kursu; stronicowanie woła kolejną stronę;
 *  - „Utwórz kurs”: identyfikator z tytułu, ciało żądania, przejście na ekran
 *    kursu, błędy pól z serwera, anulowanie z powrotem fokusu;
 *  - „Zmień kolejność ścieżki”: przesuwanie, podgląd skutków, potwierdzenie
 *    w oknie, zapis, odświeżenie, błędy i odmowa.
 * Atrapy mają klucze odczytane z zasobu PHP i `openapi.json`.
 */

const api = vi.fn();
const apiPaged = vi.fn();
const back = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, push, refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));
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
const { COURSE_TYPE_LABELS, PRODUCT_GROUP_LABELS } = await import("@/lib/h08/types");
const { KursyAdministracji } = await import("../KursyAdministracji");

const ZASOB = "backend/app/Http/Resources/H08/AdminCourseResource.php";

function kurs(id: number, nadpisz: Record<string, unknown> = {}) {
  return {
    id,
    title: `Kurs ${id}`,
    slug: `kurs-${id}`,
    description: null,
    type: "course",
    product_group: "psychon",
    sequence_order: id,
    edition_id: 1,
    is_published: true,
    lessons_count: 3,
    materials_count: 0,
    created_at: "2026-09-01T10:00:00Z",
    updated_at: "2026-09-01T10:00:00Z",
    publication_gaps: { blocking: [], waiting: [] },
    ...nadpisz,
  };
}

const META = { current_page: 1, per_page: 100, total: 3, last_page: 1 };

const TRZY_KURSY = [
  kurs(1, { title: "Podstawy pomocy", lessons_count: 1 }),
  kurs(2, { title: "Wywiad psychologiczny", is_published: false }),
  kurs(3, { title: "Webinar otwarty", type: "webinar", sequence_order: null, product_group: "both", lessons_count: 0 }),
];

function blad(status: number, code: string, message: string, errors?: Record<string, string[]>) {
  return new ApiError({ status, code, message, errors });
}

function sprawdzSzablon(container: HTMLElement) {
  expect(() => jedenMain(container)).not.toThrow();
  expect(container.querySelector("main")!.getAttribute("data-style-id")).toBe("szablon-lista");
}

function przyciskiGlowne() {
  return Array.from(document.querySelectorAll("button")).filter((b) =>
    b.className.split(/\s+/).some((klasa) => /(^|_)primary(_|$)/.test(klasa)),
  );
}

function wierszeListy() {
  return Array.from(document.querySelectorAll('section[aria-label="Lista kursów"] [role="row"][data-wiersz]'));
}

/** Komórka wiersza pod nagłówkiem kolumny o podanej nazwie. */
function komorka(wiersz: HTMLElement, kolumna: string): HTMLElement {
  const naglowki = within(screen.getByRole("table", { name: "Lista kursów" })).getAllByRole("columnheader");
  const indeks = naglowki.findIndex((naglowek) => naglowek.textContent === kolumna);
  expect(indeks, `kolumna „${kolumna}”`).toBeGreaterThanOrEqual(0);
  return within(wiersz).getAllByRole("cell")[indeks];
}

async function renderZDanymi(kursy = TRZY_KURSY, meta = { ...META, total: kursy.length }) {
  apiPaged.mockResolvedValueOnce({ data: kursy, meta });
  const wynik = render(<KursyAdministracji />);
  await screen.findByText("Podstawy pomocy");
  return wynik;
}

beforeEach(() => {
  api.mockReset();
  apiPaged.mockReset();
  back.mockReset();
  push.mockReset();
  window.sessionStorage.clear();
});

describe("KursyAdministracji — schemat atrap", () => {
  it("atrapa kursu ma wszystkie klucze zasobu PHP", () => {
    expect(brakujaceKlucze(kurs(1), kluczeZasobu(ZASOB))).toEqual([]);
  });

  it("atrapa meta ma wszystkie wymagane klucze z openapi.json", () => {
    expect(brakujaceKlucze(META, kluczeMetaZOpenApi("/v1/admin/courses"))).toEqual([]);
  });

  it("kontrola: atrapa bez klucza `slug` jest wykryta jako niepełna", () => {
    const uboga: Record<string, unknown> = { ...kurs(1) };
    delete uboga.slug;
    expect(brakujaceKlucze(uboga, kluczeZasobu(ZASOB))).toEqual(["slug"]);
  });
});

describe("KursyAdministracji — stany w szablonie", () => {
  it("ładowanie: szkielet w obszarze listy, jeden main, brak przycisków akcji", () => {
    apiPaged.mockReturnValue(new Promise(() => undefined));
    const { container } = render(<KursyAdministracji />);
    sprawdzSzablon(container);
    expect(container.querySelector("[data-testid='obszar-lista'] [aria-busy='true']")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Utwórz kurs" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Zmień kolejność ścieżki" })).toBeNull();
  });

  it("dane: trzy wiersze w kolejności z serwera, nagłówek „Kursy”, jeden przycisk główny", async () => {
    const { container } = await renderZDanymi();
    sprawdzSzablon(container);
    expect(apiPaged).toHaveBeenCalledWith("/admin/courses?page=1&per_page=100&sort=sequence_order");
    expect(screen.getByRole("heading", { level: 1, name: "Kursy" })).toBeInTheDocument();
    expect(wierszeListy().map((li) => li.textContent)).toEqual([
      expect.stringContaining("Podstawy pomocy"),
      expect.stringContaining("Wywiad psychologiczny"),
      expect.stringContaining("Webinar otwarty"),
    ]);
    const glowne = przyciskiGlowne();
    expect(glowne).toHaveLength(1);
    expect(glowne[0]).toHaveTextContent("Utwórz kurs");
    expect(glowne[0].closest('[data-testid="pageheader-przycisk-glowny"]')).not.toBeNull();
    expect(screen.getAllByRole("button", { name: "Utwórz kurs" })).toHaveLength(1);
  });

  it("kolumny w kolejności: Kurs, Stan, Miejsce w ścieżce, Lekcje, akcja — te same dane z jednego żądania", async () => {
    await renderZDanymi();
    const tabela = screen.getByRole("table", { name: "Lista kursów" });
    expect(within(tabela).getAllByRole("columnheader").map((naglowek) => naglowek.textContent)).toEqual([
      "Kurs",
      "Stan",
      "Miejsce w ścieżce",
      "Lekcje",
      "Akcja",
    ]);
    expect(apiPaged).toHaveBeenCalledTimes(1);
    expect(apiPaged).toHaveBeenCalledWith("/admin/courses?page=1&per_page=100&sort=sequence_order");
    expect(api).not.toHaveBeenCalled();
  });

  it("wiersz: nazwa z typem i grupą, stan, miejsce w ścieżce, liczba lekcji i odnośnik do kursu", async () => {
    await renderZDanymi();
    const [pierwszy, drugi, trzeci] = wierszeListy() as HTMLElement[];
    const opis = (typ: "course" | "webinar", grupa: "psychon" | "both") =>
      [COURSE_TYPE_LABELS[typ], PRODUCT_GROUP_LABELS[grupa]].join(" · ");
    expect(within(pierwszy).getAllByRole("cell")[0]).toBe(komorka(pierwszy, "Kurs"));
    expect(komorka(pierwszy, "Kurs")).toHaveTextContent(`Podstawy pomocy${opis("course", "psychon")}`);
    expect(komorka(pierwszy, "Stan")).toHaveTextContent(/^Stan\s*Opublikowany$/);
    // W kolumnie miejsca stoi sama liczba: znaczenie niesie nazwa kolumny.
    expect(komorka(pierwszy, "Miejsce w ścieżce")).toHaveTextContent(/^Miejsce w ścieżce\s*1$/);
    expect(komorka(pierwszy, "Lekcje")).toHaveTextContent(/^Lekcje\s*1\s*lekcja$/);
    expect(komorka(drugi, "Stan")).toHaveTextContent(/^Stan\s*Szkic$/);
    expect(komorka(trzeci, "Kurs")).toHaveTextContent(`Webinar otwarty${opis("webinar", "both")}`);
    expect(komorka(trzeci, "Miejsce w ścieżce")).toHaveTextContent(/^Miejsce w ścieżce\s*poza ścieżką$/);
    expect(komorka(trzeci, "Lekcje")).toHaveTextContent(/^Lekcje\s*0\s*lekcji$/);
    // Wiersza opisowego „miejsce · typ · grupa · lekcje” już nie ma: pod nazwą stoi tylko typ i grupa.
    expect(komorka(pierwszy, "Kurs")).not.toHaveTextContent(/w ścieżce|lekcj/);
    expect(komorka(trzeci, "Kurs")).not.toHaveTextContent(/ścieżk|lekcj/);
    expect(screen.getByRole("link", { name: "Otwórz kurs: Podstawy pomocy" })).toHaveAttribute("href", "/admin/kursy/1");
    expect(screen.getByRole("link", { name: "Otwórz kurs: Webinar otwarty" })).toHaveAttribute("href", "/admin/kursy/3");
  });

  it("pusty: komunikat „Brak kursów w tej edycji” z akcją tworzenia, bez listy", async () => {
    apiPaged.mockResolvedValueOnce({ data: [], meta: { ...META, total: 0 } });
    const { container } = render(<KursyAdministracji />);
    await screen.findByText("Brak kursów w tej edycji");
    sprawdzSzablon(container);
    expect(wierszeListy()).toHaveLength(0);
    expect(screen.getAllByRole("button", { name: "Utwórz kurs" }).length).toBeGreaterThanOrEqual(1);
  });

  it.each([401, 403])("odpowiedź %i: odmowa z powodu roli, zero rekordów i zero przycisków akcji", async (status) => {
    apiPaged.mockRejectedValueOnce(blad(status, "forbidden", "Zabronione."));
    const { container } = render(<KursyAdministracji />);
    await screen.findByText(/tylko dla administracji/);
    sprawdzSzablon(container);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(wierszeListy()).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Utwórz kurs" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Zmień kolejność ścieżki" })).toBeNull();
  });

  it("błąd 500: komunikat serwera, bez odmowy roli, ponowienie wczytuje listę bez szkieletu pośrodku błędu", async () => {
    apiPaged.mockRejectedValueOnce(blad(500, "server_error", "Lista kursów niedostępna."));
    const { container } = render(<KursyAdministracji />);
    await screen.findByText("Nie udało się wczytać listy kursów");
    sprawdzSzablon(container);
    expect(screen.getByText("Lista kursów niedostępna.")).toBeInTheDocument();
    expect(screen.queryByText(/tylko dla administracji/)).toBeNull();
    // Nagłówki w kolejności: h1 „Kursy”, h2 „Lista kursów”, dopiero potem h3 tytułu komunikatu.
    expect(screen.getAllByRole("heading").map((h) => `${h.tagName}:${h.textContent}`)).toEqual([
      "H1:Kursy",
      "H2:Lista kursów",
      "H3:Nie udało się wczytać listy kursów",
    ]);

    apiPaged.mockResolvedValueOnce({ data: TRZY_KURSY, meta: META });
    await userEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    await screen.findByText("Podstawy pomocy");
    expect(apiPaged).toHaveBeenCalledTimes(2);
  });

  it("błąd sieci bez koperty: ogólny komunikat", async () => {
    apiPaged.mockRejectedValueOnce(new Error("sieć"));
    render(<KursyAdministracji />);
    await screen.findByText("Nie udało się wczytać listy kursów");
    expect(screen.getByText(/Serwer nie odpowiedział/)).toBeInTheDocument();
  });

  it("stronicowanie: „Następna” pobiera drugą stronę, przy jednej stronie nie ma stronicowania", async () => {
    await renderZDanymi();
    expect(screen.queryByRole("button", { name: "Następna" })).toBeNull();
  });

  it("stronicowanie: przy wielu stronach „Następna” woła stronę 2", async () => {
    apiPaged.mockResolvedValueOnce({ data: TRZY_KURSY, meta: { current_page: 1, per_page: 100, total: 150, last_page: 2 } });
    render(<KursyAdministracji />);
    await screen.findByText("Podstawy pomocy");
    apiPaged.mockResolvedValueOnce({ data: [kurs(4, { title: "Czwarty kurs" })], meta: { current_page: 2, per_page: 100, total: 150, last_page: 2 } });
    await userEvent.click(screen.getByRole("button", { name: "Następna" }));
    await screen.findByText("Czwarty kurs");
    expect(apiPaged).toHaveBeenLastCalledWith("/admin/courses?page=2&per_page=100&sort=sequence_order");
  });
});

const ADRES_PROWADZACYCH = "/admin/users?role=instructor&status=active&per_page=100&sort=last_name";

const PROWADZACY_DO_WYBORU = [
  { id: 7, first_name: "Ewa", last_name: "Brzeska" },
  { id: 8, first_name: "Jan", last_name: "Kowalski-Wiśniewski-Zakrzewski-Nowogrodzki" },
];

describe("KursyAdministracji — Utwórz kurs", () => {
  async function otworz(prowadzacy: unknown = { data: PROWADZACY_DO_WYBORU, meta: META }) {
    const wynik = await renderZDanymi();
    if (prowadzacy instanceof Error) apiPaged.mockRejectedValueOnce(prowadzacy);
    else apiPaged.mockResolvedValueOnce(prowadzacy);
    await userEvent.click(screen.getByRole("button", { name: "Utwórz kurs" }));
    await screen.findByRole("heading", { name: "Nowy kurs" });
    return wynik;
  }

  it("otwarcie: fokus na pierwszym polu, jedyny przycisk główny to „Utwórz kurs” formularza, „Zmień kolejność” wyłączone", async () => {
    await otworz();
    expect(screen.getByLabelText(/^Tytuł/)).toHaveFocus();
    const glowne = przyciskiGlowne();
    expect(glowne).toHaveLength(1);
    expect(glowne[0].closest("form")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Zmień kolejność ścieżki" })).toBeDisabled();
  });

  it("identyfikator wypełnia się z tytułu, dopóki nie zostanie poprawiony ręcznie", async () => {
    await otworz();
    const tytul = screen.getByLabelText(/^Tytuł/);
    const identyfikator = screen.getByLabelText(/^Identyfikator/) as HTMLInputElement;
    await userEvent.type(tytul, "Zażółć gęślą");
    expect(identyfikator.value).toBe("zazolc-gesla");

    await userEvent.type(identyfikator, "-v2");
    expect(identyfikator.value).toBe("zazolc-gesla-v2");
    await userEvent.type(tytul, " jaźń");
    expect(identyfikator.value).toBe("zazolc-gesla-v2");
  });

  it("podpowiedź pola „Pozycja w ścieżce” mówi zwykłym językiem, że puste pole oznacza kurs poza główną ścieżką", async () => {
    await otworz();
    await userEvent.click(screen.getByRole("button", { name: /Miejsce w ścieżce/ }));
    expect(screen.getByText("Puste pole oznacza kurs poza główną ścieżką, na przykład webinar.")).toBeInTheDocument();
    expect(screen.queryByText(/Puste pole =/)).toBeNull();
  });

  it("zapis: POST z przyciętym tytułem, domyślnym typem i grupą, pozycją jako liczbą; przejście na ekran kursu", async () => {
    await otworz();
    api.mockResolvedValueOnce(kurs(9, { title: "Nowy" }));
    await userEvent.type(screen.getByLabelText(/^Tytuł/), "  Nowy kurs  ");
    await userEvent.type(screen.getByLabelText(/^Opis/), "Krótki opis");
    await userEvent.click(screen.getByRole("button", { name: /Miejsce w ścieżce/ }));
    await userEvent.type(screen.getByLabelText(/^Pozycja w ścieżce/), "4");
    await userEvent.click(screen.getByRole("button", { name: "Utwórz kurs" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/kursy/9"));
    expect(api).toHaveBeenCalledWith("/admin/courses", {
      method: "POST",
      body: {
        title: "Nowy kurs",
        slug: "nowy-kurs",
        type: "course",
        product_group: "psychon",
        sequence_order: 4,
        description: "Krótki opis",
      },
    });
  });

  it("zapis bez pozycji i opisu: sequence_order i description to null", async () => {
    await otworz();
    api.mockResolvedValueOnce(kurs(10));
    await userEvent.type(screen.getByLabelText(/^Tytuł/), "Bez pozycji");
    await userEvent.click(screen.getByRole("button", { name: "Utwórz kurs" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/kursy/10"));
    expect(api.mock.calls[0][1].body).toMatchObject({ sequence_order: null, description: null });
  });

  it("błędy pól z serwera (422): podsumowanie i komunikat przy polu, bez przejścia dalej", async () => {
    await otworz();
    api.mockRejectedValueOnce(blad(422, "validation_failed", "Popraw zaznaczone pola.", { slug: ["Ten identyfikator jest już zajęty."] }));
    await userEvent.type(screen.getByLabelText(/^Tytuł/), "Zajęty");
    await userEvent.click(screen.getByRole("button", { name: "Utwórz kurs" }));

    await waitFor(() => expect(screen.getAllByText("Ten identyfikator jest już zajęty.").length).toBeGreaterThanOrEqual(1));
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^Identyfikator/)).toHaveAttribute("aria-invalid", "true");
  });

  it("błąd pola w sekcji „Miejsce w ścieżce” rozwija tę sekcję", async () => {
    await otworz();
    api.mockRejectedValueOnce(blad(422, "validation_failed", "Popraw zaznaczone pola.", { sequence_order: ["Pozycja musi być liczbą."] }));
    await userEvent.type(screen.getByLabelText(/^Tytuł/), "Zły numer");
    await userEvent.click(screen.getByRole("button", { name: "Utwórz kurs" }));
    await waitFor(() => expect(screen.getByLabelText(/^Pozycja w ścieżce/)).toBeInTheDocument());
    expect(screen.getAllByText("Pozycja musi być liczbą.").length).toBeGreaterThanOrEqual(1);
  });

  it("błąd 500 przy zapisie: komunikat nad formularzem, wpisane dane zostają", async () => {
    await otworz();
    api.mockRejectedValueOnce(blad(500, "server_error", "Serwer się potknął."));
    await userEvent.type(screen.getByLabelText(/^Tytuł/), "Zostaje");
    await userEvent.click(screen.getByRole("button", { name: "Utwórz kurs" }));
    await screen.findByText("Serwer się potknął.");
    expect((screen.getByLabelText(/^Tytuł/) as HTMLInputElement).value).toBe("Zostaje");
    expect(push).not.toHaveBeenCalled();
  });

  it("odmowa 403 przy zapisie: zdanie o roli administracji", async () => {
    await otworz();
    api.mockRejectedValueOnce(blad(403, "forbidden", "Zabronione."));
    await userEvent.type(screen.getByLabelText(/^Tytuł/), "Zabronione");
    await userEvent.click(screen.getByRole("button", { name: "Utwórz kurs" }));
    await screen.findByText(/tylko dla administracji/);
  });

  const CIALO_KURSU = {
    title: "Z prowadzącym",
    slug: "z-prowadzacym",
    type: "course",
    product_group: "psychon",
    sequence_order: null,
    description: null,
  };

  async function wybierzProwadzacego(nazwa: string) {
    await userEvent.click(await screen.findByRole("combobox", { name: /^Prowadzący/ }));
    await userEvent.click(await screen.findByRole("option", { name: nazwa }));
  }

  it("pole „Prowadzący” stoi na pierwszym poziomie, czyta listę z tego samego adresu co karta kursu i ma pustą opcję", async () => {
    await otworz();
    expect(apiPaged).toHaveBeenCalledTimes(2);
    expect(apiPaged).toHaveBeenLastCalledWith(ADRES_PROWADZACYCH);
    const pole = screen.getByRole("combobox", { name: /^Prowadzący/ });
    expect(pole).toBeVisible();
    // Opis i prowadzący są od razu; w zwiniętej sekcji zostaje tylko miejsce w ścieżce.
    expect(screen.getByLabelText(/^Opis/)).toBeVisible();
    await userEvent.click(pole);
    expect(screen.getAllByRole("option").map((opcja) => opcja.textContent)).toEqual([
      "Bez prowadzącego",
      "Ewa Brzeska",
      "Jan Kowalski-Wiśniewski-Zakrzewski-Nowogrodzki",
    ]);
  });

  it("bez prowadzącego: jedno żądanie — utworzenie kursu — i przejście na ekran kursu", async () => {
    await otworz();
    api.mockResolvedValueOnce(kurs(9));
    await userEvent.type(screen.getByLabelText(/^Tytuł/), "Z prowadzącym");
    await userEvent.click(screen.getByRole("button", { name: "Utwórz kurs" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/kursy/9"));
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenNthCalledWith(1, "/admin/courses", { method: "POST", body: CIALO_KURSU });
    expect(window.sessionStorage.length).toBe(0);
  });

  it("z prowadzącym: dwa żądania po kolei — kurs, potem przypisanie do całego kursu; ciało kursu to samo co bez prowadzącego", async () => {
    await otworz();
    api.mockResolvedValueOnce(kurs(9));
    api.mockResolvedValueOnce({ id: 1, course_id: 9, lesson_id: null, instructor: PROWADZACY_DO_WYBORU[0] });
    await userEvent.type(screen.getByLabelText(/^Tytuł/), "Z prowadzącym");
    await wybierzProwadzacego("Ewa Brzeska");
    await userEvent.click(screen.getByRole("button", { name: "Utwórz kurs" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/kursy/9"));
    expect(api).toHaveBeenCalledTimes(2);
    expect(api).toHaveBeenNthCalledWith(1, "/admin/courses", { method: "POST", body: CIALO_KURSU });
    expect(api).toHaveBeenNthCalledWith(2, "/admin/courses/9/assignments", {
      method: "POST",
      body: { instructor_id: 7, lesson_id: null },
    });
    expect(push).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.length).toBe(0);
  });

  it.each([
    ["422", () => blad(422, "validation_failed", "Ten prowadzący jest już przypisany.")],
    ["500", () => blad(500, "server_error", "Serwer się potknął.")],
    ["brak sieci", () => new Error("sieć")],
  ])("odmowa przypisania (%s): kurs zostaje szkicem, zdanie czeka na ekranie kursu, utworzenia nie ponawia, nic nie jest usuwane", async (_nazwa, wyjatek) => {
    await otworz();
    api.mockResolvedValueOnce(kurs(9));
    api.mockRejectedValueOnce(wyjatek());
    await userEvent.type(screen.getByLabelText(/^Tytuł/), "Z prowadzącym");
    await wybierzProwadzacego("Jan Kowalski-Wiśniewski-Zakrzewski-Nowogrodzki");
    await userEvent.click(screen.getByRole("button", { name: "Utwórz kurs" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/kursy/9"));
    expect(push).toHaveBeenCalledTimes(1);
    expect(api.mock.calls.map(([adres, opcje]) => `${opcje?.method} ${adres}`)).toEqual([
      "POST /admin/courses",
      "POST /admin/courses/9/assignments",
    ]);
    expect(window.sessionStorage.getItem("kurs-ostrzezenie-po-utworzeniu-9")).toMatch(
      /^Kurs został utworzony jako szkic, ale nie udało się przypisać do niego prowadzącego\./,
    );
    // Formularz nie pokazuje błędu tworzenia: kurs powstał.
    expect(screen.queryByText("Nie udało się utworzyć kursu")).toBeNull();
  });

  it("błąd tworzenia kursu z wybranym prowadzącym: przypisanie nie wychodzi, formularz zostaje", async () => {
    await otworz();
    api.mockRejectedValueOnce(blad(500, "server_error", "Serwer się potknął."));
    await userEvent.type(screen.getByLabelText(/^Tytuł/), "Z prowadzącym");
    await wybierzProwadzacego("Ewa Brzeska");
    await userEvent.click(screen.getByRole("button", { name: "Utwórz kurs" }));

    await screen.findByText("Serwer się potknął.");
    expect(api).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("lista prowadzących nie wczytała się: podpowiedź w polu, a kurs da się utworzyć bez prowadzącego", async () => {
    await otworz(new Error("sieć"));
    expect(await screen.findByText(/Nie udało się wczytać prowadzących/)).toBeInTheDocument();
    api.mockResolvedValueOnce(kurs(9));
    await userEvent.type(screen.getByLabelText(/^Tytuł/), "Z prowadzącym");
    await userEvent.click(screen.getByRole("button", { name: "Utwórz kurs" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/kursy/9"));
    expect(api).toHaveBeenCalledTimes(1);
  });

  it("wybór prowadzącego liczy się jako wpisana praca: ponowne otwarcie formularza jest puste", async () => {
    await otworz();
    await wybierzProwadzacego("Ewa Brzeska");
    await userEvent.click(screen.getByRole("button", { name: "Anuluj" }));
    apiPaged.mockResolvedValueOnce({ data: PROWADZACY_DO_WYBORU, meta: META });
    await userEvent.click(await screen.findByRole("button", { name: "Utwórz kurs" }));
    await screen.findByRole("heading", { name: "Nowy kurs" });
    expect(screen.getByRole("combobox", { name: /^Prowadzący/ })).toHaveTextContent("Bez prowadzącego");
  });

  it("anulowanie: formularz znika, fokus wraca na przycisk główny nagłówka, żadne żądanie nie wychodzi", async () => {
    await otworz();
    await userEvent.click(screen.getByRole("button", { name: "Anuluj" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Nowy kurs" })).toBeNull());
    expect(przyciskiGlowne()).toHaveLength(1);
    await waitFor(() => expect(screen.getByRole("button", { name: "Utwórz kurs" })).toHaveFocus());
    expect(api).not.toHaveBeenCalled();
  });

  it("Escape działa jak „Anuluj”", async () => {
    await otworz();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Nowy kurs" })).toBeNull());
  });

  it("ponowne otwarcie pokazuje pusty formularz", async () => {
    await otworz();
    await userEvent.type(screen.getByLabelText(/^Tytuł/), "Porzucony");
    await userEvent.click(screen.getByRole("button", { name: "Anuluj" }));
    await userEvent.click(await screen.findByRole("button", { name: "Utwórz kurs" }));
    expect((await screen.findByLabelText(/^Tytuł/) as HTMLInputElement).value).toBe("");
  });
});

describe("KursyAdministracji — Zmień kolejność ścieżki", () => {
  const PODGLAD = [
    { user_id: 17, first_name: "Marta", last_name: "Demo", course_id: 2, course_title: "Wywiad psychologiczny", from: "in_progress", to: "locked" },
  ];

  async function otworz() {
    const wynik = await renderZDanymi([kurs(1, { title: "Podstawy pomocy" }), kurs(2, { title: "Wywiad psychologiczny" }), kurs(3, { title: "Interwencja" }), kurs(4, { title: "Webinar", sequence_order: null })]);
    await userEvent.click(screen.getByRole("button", { name: "Zmień kolejność ścieżki" }));
    await screen.findByRole("heading", { name: "Kolejność ścieżki" });
    return wynik;
  }

  function kolejnosc() {
    const sekcja = screen.getByRole("region", { name: "Kolejność ścieżki" });
    return within(sekcja)
      .getAllByRole("listitem")
      .map((li) => li.querySelector("span > span:nth-child(2)")?.textContent);
  }

  it("lista kolejności zawiera tylko kursy ze ścieżki; pierwszy „wyżej” i ostatni „niżej” są wyłączone, ale zostają w kolejności fokusu", async () => {
    await otworz();
    expect(kolejnosc()).toEqual(["Podstawy pomocy", "Wywiad psychologiczny", "Interwencja"]);
    const wGore = screen.getByRole("button", { name: "Przenieś „Podstawy pomocy” wyżej" });
    const wDol = screen.getByRole("button", { name: "Przenieś „Interwencja” niżej" });
    expect(wGore).toHaveAttribute("aria-disabled", "true");
    expect(wDol).toHaveAttribute("aria-disabled", "true");
    expect(wGore).not.toBeDisabled();
    expect(wDol).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Przenieś „Podstawy pomocy” niżej" })).not.toHaveAttribute("aria-disabled");
  });

  it("strzałki stoją po lewej, przed numerem, a wiersz nie ma przycisków z tekstem „W górę” i „W dół”", async () => {
    await otworz();
    const wiersz = within(screen.getByRole("region", { name: "Kolejność ścieżki" })).getAllByRole("listitem")[0];
    const dzieci = Array.from(wiersz.children);
    expect(dzieci[0].querySelectorAll("button")).toHaveLength(2);
    expect(dzieci[1].textContent).toBe("1.Podstawy pomocy");
    expect(screen.queryByRole("button", { name: "W górę" })).toBeNull();
    expect(screen.queryByRole("button", { name: "W dół" })).toBeNull();
  });

  it("w trakcie zmiany „Utwórz kurs” jest niedostępny z powodem, a kliknięcie nie otwiera formularza", async () => {
    await otworz();
    const glowny = screen.getByRole("button", { name: "Utwórz kurs" });
    expect(glowny).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Najpierw zapisz albo anuluj zmianę kolejności ścieżki.")).toBeInTheDocument();
    await userEvent.click(glowny);
    expect(screen.queryByRole("heading", { name: "Nowy kurs" })).toBeNull();
  });

  it("przesunięcie: zmienia kolejność, ogłasza pozycję i zostawia fokus na przycisku przeniesionego kursu", async () => {
    await otworz();
    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Podstawy pomocy” niżej" }));
    expect(kolejnosc()).toEqual(["Wywiad psychologiczny", "Podstawy pomocy", "Interwencja"]);
    expect(screen.getByText("Przeniesiono „Podstawy pomocy” na miejsce 2 z 3.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Przenieś „Podstawy pomocy” niżej" })).toHaveFocus();
  });

  it("kurs dociera na brzeg: strzałka robi się wyłączona, ale fokus zostaje na niej", async () => {
    await otworz();
    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Wywiad psychologiczny” niżej" }));
    expect(kolejnosc()).toEqual(["Podstawy pomocy", "Interwencja", "Wywiad psychologiczny"]);
    const wDol = screen.getByRole("button", { name: "Przenieś „Wywiad psychologiczny” niżej" });
    expect(wDol).toHaveAttribute("aria-disabled", "true");
    expect(wDol).toHaveFocus();
  });

  it("cofnięcie ruchu jest przeciwną strzałką tego samego wiersza, bez osobnego „Cofnij”", async () => {
    await otworz();
    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Podstawy pomocy” niżej" }));
    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Podstawy pomocy” wyżej" }));
    expect(kolejnosc()).toEqual(["Podstawy pomocy", "Wywiad psychologiczny", "Interwencja"]);
    expect(screen.queryByRole("button", { name: /Cofnij/ })).toBeNull();
  });

  it("ta sama sekwencja kliknięć daje te same dwa żądania co przed zmianą wyglądu (treść bajt w bajt)", async () => {
    await otworz();
    api.mockResolvedValueOnce(PODGLAD).mockResolvedValueOnce([]);
    apiPaged.mockResolvedValueOnce({ data: [], meta: { ...META, total: 0 } });
    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Podstawy pomocy” niżej" }));
    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Podstawy pomocy” niżej" }));
    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Interwencja” wyżej" }));
    await userEvent.click(screen.getByRole("button", { name: "Sprawdź wpływ zmiany" }));
    const okno = await screen.findByRole("dialog");
    await userEvent.click(within(okno).getByRole("button", { name: "Potwierdź zmianę kolejności" }));
    await screen.findByText("Zapisano nową kolejność ścieżki.");
    const zapisane = api.mock.calls.map(([sciezka, opcje]) => [sciezka, opcje.method, JSON.stringify(opcje.body)]);
    expect(zapisane).toEqual([
      ["/admin/courses/reorder/preview", "POST", '{"course_ids":[3,2,1]}'],
      ["/admin/courses/reorder", "PATCH", '{"course_ids":[3,2,1]}'],
    ]);
  });

  it("anulowanie: wraca lista, nic nie jest wysłane, fokus na „Zmień kolejność ścieżki”", async () => {
    await otworz();
    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Podstawy pomocy” niżej" }));
    await userEvent.click(screen.getByRole("button", { name: "Anuluj" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Kolejność ścieżki" })).toBeNull());
    expect(wierszeListy()).toHaveLength(4);
    expect(api).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Zmień kolejność ścieżki" })).toHaveFocus();
  });

  it("sprawdzenie wpływu: POST podglądu z nową kolejnością, okno z tabelą osób", async () => {
    await otworz();
    api.mockResolvedValueOnce(PODGLAD);
    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Podstawy pomocy” niżej" }));
    await userEvent.click(screen.getByRole("button", { name: "Sprawdź wpływ zmiany" }));

    const okno = await screen.findByRole("dialog");
    expect(api).toHaveBeenCalledWith("/admin/courses/reorder/preview", { method: "POST", body: { course_ids: [2, 1, 3] } });
    expect(within(okno).getByText("Marta Demo")).toBeInTheDocument();
    expect(within(okno).getByText("W trakcie")).toBeInTheDocument();
    expect(within(okno).getByText("Zablokowany")).toBeInTheDocument();

    const lista = within(okno).getByRole("list", { name: "Wpływ nowej kolejności na statusy kursów" });
    const pozycje = within(lista).getAllByRole("listitem");
    expect(pozycje).toHaveLength(1);
    expect(Array.from(pozycje[0].querySelectorAll("dt")).map((dt) => dt.textContent)).toEqual(["Osoba", "Kurs", "Było", "Będzie"]);
    expect(Array.from(pozycje[0].querySelectorAll("dd")).map((dd) => dd.textContent)).toEqual([
      "Marta Demo",
      "Wywiad psychologiczny",
      "W trakcie",
      "Zablokowany",
    ]);
    expect(within(okno).queryByRole("table")).toBeNull();
  });

  it("lista wpływu w oknie jest przewijanym obszarem dostępnym z klawiatury i ma nazwę", async () => {
    await otworz();
    api.mockResolvedValueOnce(PODGLAD);
    await userEvent.click(screen.getByRole("button", { name: "Sprawdź wpływ zmiany" }));
    const okno = await screen.findByRole("dialog");
    const lista = within(okno).getByRole("list", { name: "Wpływ nowej kolejności na statusy kursów" });
    expect(lista).toHaveAttribute("tabindex", "0");
    lista.focus();
    expect(lista).toHaveFocus();
  });

  it("pusty podgląd: okno mówi, że żaden status się nie zmienia", async () => {
    await otworz();
    api.mockResolvedValueOnce([]);
    await userEvent.click(screen.getByRole("button", { name: "Sprawdź wpływ zmiany" }));
    const okno = await screen.findByRole("dialog");
    expect(within(okno).getByText("Ta zmiana nie zmienia statusu żadnej osoby.")).toBeInTheDocument();
  });

  it("wycofanie z okna: okno znika, kolejność zostaje do dalszej pracy, zapis nie wychodzi", async () => {
    await otworz();
    api.mockResolvedValueOnce(PODGLAD);
    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Podstawy pomocy” niżej" }));
    await userEvent.click(screen.getByRole("button", { name: "Sprawdź wpływ zmiany" }));
    const okno = await screen.findByRole("dialog");
    await userEvent.click(within(okno).getByRole("button", { name: "Anuluj" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(kolejnosc()).toEqual(["Wywiad psychologiczny", "Podstawy pomocy", "Interwencja"]);
    expect(api).toHaveBeenCalledTimes(1);
  });

  it("potwierdzenie: PATCH z nową kolejnością, komunikat, odświeżenie listy, fokus na „Zmień kolejność ścieżki”", async () => {
    await otworz();
    api.mockResolvedValueOnce(PODGLAD).mockResolvedValueOnce([]);
    apiPaged.mockResolvedValueOnce({
      data: [kurs(2, { title: "Wywiad psychologiczny", sequence_order: 1 }), kurs(1, { title: "Podstawy pomocy", sequence_order: 2 })],
      meta: { ...META, total: 2 },
    });
    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Podstawy pomocy” niżej" }));
    await userEvent.click(screen.getByRole("button", { name: "Sprawdź wpływ zmiany" }));
    const okno = await screen.findByRole("dialog");
    await userEvent.click(within(okno).getByRole("button", { name: "Potwierdź zmianę kolejności" }));

    await screen.findByText("Zapisano nową kolejność ścieżki.");
    expect(api).toHaveBeenLastCalledWith("/admin/courses/reorder", { method: "PATCH", body: { course_ids: [2, 1, 3] } });
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(wierszeListy().map((li) => li.textContent)).toEqual([expect.stringContaining("Wywiad psychologiczny"), expect.stringContaining("Podstawy pomocy")]));
    await waitFor(() => expect(screen.getByRole("button", { name: "Zmień kolejność ścieżki" })).toHaveFocus());
  });

  it("błąd zapisu: komunikat w oknie, okno zostaje otwarte", async () => {
    await otworz();
    api.mockResolvedValueOnce(PODGLAD).mockRejectedValueOnce(blad(422, "validation_failed", "Kolejność jest nieprawidłowa."));
    await userEvent.click(screen.getByRole("button", { name: "Sprawdź wpływ zmiany" }));
    const okno = await screen.findByRole("dialog");
    await userEvent.click(within(okno).getByRole("button", { name: "Potwierdź zmianę kolejności" }));
    await within(await screen.findByRole("dialog")).findByText("Kolejność jest nieprawidłowa.");
    expect(screen.queryByText("Zapisano nową kolejność ścieżki.")).toBeNull();
  });

  it("odmowa 403 przy podglądzie: zdanie o roli administracji, okna nie ma", async () => {
    await otworz();
    api.mockRejectedValueOnce(blad(403, "forbidden", "Zabronione."));
    await userEvent.click(screen.getByRole("button", { name: "Sprawdź wpływ zmiany" }));
    await screen.findByText(/tylko dla administracji/);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("jeden kurs w ścieżce: „Sprawdź wpływ zmiany” jest wyłączone", async () => {
    await renderZDanymi([kurs(1, { title: "Podstawy pomocy" }), kurs(2, { sequence_order: null })]);
    await userEvent.click(screen.getByRole("button", { name: "Zmień kolejność ścieżki" }));
    expect(await screen.findByRole("button", { name: "Sprawdź wpływ zmiany" })).toBeDisabled();
  });

  it("żaden kurs w ścieżce: komunikat zamiast listy kolejności", async () => {
    await renderZDanymi([kurs(1, { title: "Podstawy pomocy", sequence_order: null })]);
    await userEvent.click(screen.getByRole("button", { name: "Zmień kolejność ścieżki" }));
    await screen.findByText("Żaden kurs nie ma jeszcze pozycji w ścieżce.");
  });
});
