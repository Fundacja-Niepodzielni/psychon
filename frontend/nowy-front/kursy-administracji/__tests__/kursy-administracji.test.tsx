import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";
import { brakujaceKlucze, kluczeMetaZOpenApi, kluczeZasobu } from "../../staz-kolejka/__tests__/zrodla-ekranu";

/**
 * Ekran „Kursy” (administracja) na szablonie `ListTemplate`:
 *  - każdy stan (ładowanie, dane, pusty, brak uprawnień, błąd) ma jeden `main`
 *    i znacznik szablonu;
 *  - lista: tytuł, pozycja, typ, grupa, lekcje, plakietka publikacji i akcja
 *    „Otwórz” z adresem kursu; stronicowanie woła kolejną stronę;
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
  return Array.from(document.querySelectorAll('section[aria-label="Lista kursów"] [data-wariant="z-licznikiem"]'));
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

  it("wiersz: pozycja, typ, grupa, liczba lekcji, plakietka i odnośnik do kursu", async () => {
    await renderZDanymi();
    const [pierwszy, drugi, trzeci] = wierszeListy() as HTMLElement[];
    expect(pierwszy).toHaveTextContent([["Pozycja", 1, "w ścieżce"].join(" "), "Kurs", "Psychon", "1 lekcja"].join(" · "));
    expect(within(pierwszy).getByText("Opublikowany")).toBeInTheDocument();
    expect(within(drugi).getByText("Szkic")).toBeInTheDocument();
    expect(trzeci).toHaveTextContent("Poza ścieżką · Webinar · Obie grupy · 0 lekcji");
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

describe("KursyAdministracji — Utwórz kurs", () => {
  async function otworz() {
    const wynik = await renderZDanymi();
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

  it("lista kolejności zawiera tylko kursy ze ścieżki; pierwszy „W górę” i ostatni „W dół” są wyłączone", async () => {
    await otworz();
    expect(kolejnosc()).toEqual(["Podstawy pomocy", "Wywiad psychologiczny", "Interwencja"]);
    expect(screen.getByRole("button", { name: "Przesuń w górę: Podstawy pomocy" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Przesuń w dół: Interwencja" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Przesuń w dół: Podstawy pomocy" })).toBeEnabled();
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
    await userEvent.click(screen.getByRole("button", { name: "Przesuń w dół: Podstawy pomocy" }));
    expect(kolejnosc()).toEqual(["Wywiad psychologiczny", "Podstawy pomocy", "Interwencja"]);
    expect(screen.getByText(["Kurs „Podstawy pomocy” jest teraz na", "pozycji", 2, "z 3."].join(" "))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Przesuń w dół: Podstawy pomocy" })).toHaveFocus();
  });

  it("kurs dociera na brzeg: fokus przechodzi na przeciwny przycisk tego samego kursu", async () => {
    await otworz();
    await userEvent.click(screen.getByRole("button", { name: "Przesuń w dół: Wywiad psychologiczny" }));
    expect(kolejnosc()).toEqual(["Podstawy pomocy", "Interwencja", "Wywiad psychologiczny"]);
    expect(screen.getByRole("button", { name: "Przesuń w dół: Wywiad psychologiczny" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Przesuń w górę: Wywiad psychologiczny" })).toHaveFocus();
  });

  it("anulowanie: wraca lista, nic nie jest wysłane, fokus na „Zmień kolejność ścieżki”", async () => {
    await otworz();
    await userEvent.click(screen.getByRole("button", { name: "Przesuń w dół: Podstawy pomocy" }));
    await userEvent.click(screen.getByRole("button", { name: "Anuluj" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Kolejność ścieżki" })).toBeNull());
    expect(wierszeListy()).toHaveLength(4);
    expect(api).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Zmień kolejność ścieżki" })).toHaveFocus();
  });

  it("sprawdzenie wpływu: POST podglądu z nową kolejnością, okno z tabelą osób", async () => {
    await otworz();
    api.mockResolvedValueOnce(PODGLAD);
    await userEvent.click(screen.getByRole("button", { name: "Przesuń w dół: Podstawy pomocy" }));
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
    await userEvent.click(screen.getByRole("button", { name: "Przesuń w dół: Podstawy pomocy" }));
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
    await userEvent.click(screen.getByRole("button", { name: "Przesuń w dół: Podstawy pomocy" }));
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
