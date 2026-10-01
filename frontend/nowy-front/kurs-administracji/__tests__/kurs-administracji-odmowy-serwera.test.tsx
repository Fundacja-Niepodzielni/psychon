import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LEKCJE, TEMATY, lekcja, temat, utworzSerwer, type AtrapaSerwera } from "./atrapa-serwera";

/**
 * Próby ekranu kursu administracji dla odmów serwera:
 *  1) wygasła sesja (401), brak roli (403) i brak kursu (404) to trzy różne
 *     stany — zdanie o roli pada wyłącznie przy 403;
 *  2) odmowa zapisu układu, który na serwerze już się zmienił, daje czynność
 *     „Wczytaj aktualny układ”;
 *  3) odmowa danych kursu bez błędu na którymkolwiek polu formularza ma
 *     komunikat nad formularzem;
 *  4) temat z lekcjami nie dostaje okna z potwierdzeniem, które serwer na
 *     pewno odrzuci, a odmowa serwera stoi w oknie;
 *  5) błąd, który nie dotyczy nazwy tematu, nie jest błędem pola „Nazwa tematu”.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

let serwer: AtrapaSerwera;
vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return {
    ...oryginal,
    api: (...a: [string, { method?: string; body?: unknown }?]) => serwer.api(...a),
    apiPaged: (...a: [string]) => serwer.apiPaged(...a),
  };
});
vi.mock("@/lib/api", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...oryginal,
    api: (...a: [string, { method?: string; body?: unknown }?]) => serwer.api(...a),
    apiPaged: (...a: [string]) => serwer.apiPaged(...a),
  };
});

const { KursAdministracji } = await import("../KursAdministracji");
const { ApiError } = await import("@/lib/api/klient");

const ZDANIE_ROLI = "Ta funkcja jest dostępna tylko dla administracji.";

function odmowa(status: number, code: string, message: string, errors?: Record<string, string[]>) {
  return new ApiError({ status, code, message, errors });
}
const BRAK_SESJI = () => odmowa(401, "unauthenticated", "Brak ważnego tokenu.");
const BRAK_ROLI = () => odmowa(403, "forbidden", "Brak dostępu.");
const BRAK_ZASOBU = () => odmowa(404, "not_found", "Nie znaleziono zasobu.");

async function renderEkranu() {
  const wynik = render(<KursAdministracji idKursu="4" />);
  await screen.findByRole("heading", { level: 3, name: "Wprowadzenie" });
  return wynik;
}

function zapisy(metoda: string, sciezka: string) {
  return serwer.zapisy().filter((w) => w.metoda === metoda && w.sciezka === sciezka);
}

function odczyty(sciezka: string) {
  return serwer.wywolania.filter((w) => w.metoda === "GET" && w.sciezka === sciezka).length;
}

async function wybierz(etykieta: RegExp, opcja: string) {
  await userEvent.click(screen.getByRole("combobox", { name: etykieta }));
  await userEvent.click(await screen.findByRole("option", { name: opcja }));
}

beforeEach(() => {
  vi.clearAllMocks();
  serwer = utworzSerwer();
});

describe("odczyt kursu i tematów — trzy różne odmowy", () => {
  it.each([
    ["kursu", "/admin/courses/4"],
    ["tematów", "/admin/courses/4/topics"],
  ])("401 przy odczycie %s: „Sesja wygasła”, bez zdania o roli", async (_co, sciezka) => {
    serwer.nadpisz("GET", sciezka, BRAK_SESJI);
    render(<KursAdministracji idKursu="4" />);

    expect(await screen.findByText("Sesja wygasła")).toBeInTheDocument();
    expect(screen.getByText("Zaloguj się ponownie, aby wrócić do kursu.")).toBeInTheDocument();
    expect(screen.queryByText(ZDANIE_ROLI)).toBeNull();
    expect(screen.getAllByRole("main")).toHaveLength(1);
  });

  it.each([
    ["kursu", "/admin/courses/4"],
    ["tematów", "/admin/courses/4/topics"],
  ])("404 przy odczycie %s: „Nie znaleziono kursu” z odnośnikiem do listy, bez zdania o roli", async (_co, sciezka) => {
    serwer.nadpisz("GET", sciezka, BRAK_ZASOBU);
    render(<KursAdministracji idKursu="4" />);

    expect(await screen.findByText("Nie znaleziono kursu")).toBeInTheDocument();
    expect(screen.getByText("Kurs nie istnieje albo został usunięty.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Wróć do listy kursów" })).toHaveAttribute("href", "/admin/kursy");
    expect(screen.queryByText(ZDANIE_ROLI)).toBeNull();
    expect(screen.queryByText("Sesja wygasła")).toBeNull();
  });

  it.each([
    ["kursu", "/admin/courses/4"],
    ["tematów", "/admin/courses/4/topics"],
  ])("403 przy odczycie %s: zdanie o roli, bez „Sesja wygasła”", async (_co, sciezka) => {
    serwer.nadpisz("GET", sciezka, BRAK_ROLI);
    render(<KursAdministracji idKursu="4" />);

    expect(await screen.findByText(ZDANIE_ROLI)).toBeInTheDocument();
    expect(screen.queryByText("Sesja wygasła")).toBeNull();
    expect(screen.queryByText("Nie znaleziono kursu")).toBeNull();
  });
});

describe("czynność w sekcji po wygaśnięciu sesji", () => {
  it("„Przypisz prowadzącego” z odpowiedzią 401 mówi o sesji, z odpowiedzią 403 o roli", async () => {
    await renderEkranu();
    const sekcja = document.getElementById("prowadzacy")!;
    await within(sekcja).findByText("Cały kurs: brak prowadzącego");
    await wybierz(/^Prowadzący/, "Joanna Demo");

    serwer.nadpisz("POST", "/admin/courses/4/assignments", BRAK_SESJI);
    await userEvent.click(within(sekcja).getByRole("button", { name: "Przypisz prowadzącego" }));
    expect(await within(sekcja).findByText("Sesja wygasła. Zaloguj się ponownie.")).toBeInTheDocument();
    expect(within(sekcja).queryByText("Ta operacja nie jest dostępna dla Twojej roli.")).toBeNull();

    serwer.nadpisz("POST", "/admin/courses/4/assignments", BRAK_ROLI);
    await userEvent.click(within(sekcja).getByRole("button", { name: "Przypisz prowadzącego" }));
    expect(await within(sekcja).findByText("Ta operacja nie jest dostępna dla Twojej roli.")).toBeInTheDocument();
    expect(within(sekcja).queryByText("Sesja wygasła. Zaloguj się ponownie.")).toBeNull();
  });
});

describe("publikacja po wygaśnięciu sesji", () => {
  it("„Opublikuj kurs” z odpowiedzią 401 mówi o sesji, nie o roli", async () => {
    await renderEkranu();
    serwer.nadpisz("PATCH", "/admin/courses/4", BRAK_SESJI);
    await userEvent.click(screen.getByRole("button", { name: "Opublikuj kurs" }));

    expect(await screen.findByText("Nie udało się opublikować kursu")).toBeInTheDocument();
    expect(screen.getByText("Sesja wygasła. Zaloguj się ponownie.")).toBeInTheDocument();
    expect(screen.queryByText(ZDANIE_ROLI)).toBeNull();
  });
});

describe("zapis układu, który na serwerze już się zmienił", () => {
  it("odmowa 422 zapisu układu: „Wczytaj aktualny układ” czyta kurs od nowa i zdejmuje lokalne zmiany", async () => {
    await renderEkranu();
    serwer.nadpisz("PATCH", "/admin/courses/4/topics/reorder", () =>
      odmowa(422, "validation_failed", "Popraw zaznaczone pola.", {
        topics: [
          "Lekcje w tematach muszą obejmować wszystkie lekcje tego kursu — każdą dokładnie raz, bez pominięć i obcych identyfikatorów.",
        ],
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Lekcja A” niżej" }));
    await userEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));

    const komunikat = (await screen.findByText("Zmiana nie została zapisana")).closest("[role='alert']") as HTMLElement;
    expect(
      within(komunikat).getByText(
        "Układ kursu na serwerze jest inny niż na tym ekranie. Wczytaj aktualny układ — niezapisane zmiany z tego ekranu przepadną.",
      ),
    ).toBeInTheDocument();
    const odczytyTematow = odczyty("/admin/courses/4/topics");
    const odczytyLekcji = odczyty("/admin/courses/4/lessons");

    // Na serwerze jest już czwarta lekcja, dopisana przez kogoś innego.
    serwer.nadpisz("GET", "/admin/courses/4/lessons", () => [...LEKCJE, lekcja(24, "Lekcja D")]);
    serwer.nadpisz("GET", "/admin/courses/4/topics", () => [TEMATY[0], temat(8, "Praktyka", 2, [23, 24])]);
    await userEvent.click(within(komunikat).getByRole("button", { name: "Wczytaj aktualny układ" }));

    expect(await screen.findByRole("button", { name: "Edytuj lekcję „Lekcja D”" })).toBeInTheDocument();
    expect(odczyty("/admin/courses/4/topics")).toBe(odczytyTematow + 1);
    expect(odczyty("/admin/courses/4/lessons")).toBe(odczytyLekcji + 1);
    expect(screen.queryByText("Zmiana nie została zapisana")).toBeNull();
    expect(screen.queryByRole("button", { name: "Zapisz zmiany" })).toBeNull();
    const pierwszyTemat = screen.getByRole("heading", { level: 3, name: "Wprowadzenie" }).closest("section")!;
    expect(Array.from(pierwszyTemat.querySelectorAll("li[data-lekcja]")).map((li) => li.getAttribute("data-lekcja"))).toEqual([
      "21",
      "22",
    ]);
  });

  it("błąd sieci przy zapisie układu nie proponuje wczytania układu", async () => {
    await renderEkranu();
    serwer.nadpisz("PATCH", "/admin/courses/4/topics/reorder", () => new TypeError("Failed to fetch"));
    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Lekcja A” niżej" }));
    await userEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));

    expect(await screen.findByText("Zmiana nie została zapisana")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Wczytaj aktualny układ" })).toBeNull();
    expect(screen.getByRole("button", { name: "Zapisz zmiany" })).toBeInTheDocument();
  });
});

describe("dane kursu — odmowa bez błędu na polu formularza", () => {
  async function zapiszFormularz() {
    await userEvent.click(screen.getByRole("button", { name: "Zmień dane kursu" }));
    const formularz = screen.getByRole("form", { name: "Dane kursu" });
    await userEvent.click(within(formularz).getByRole("button", { name: "Zapisz zmiany" }));
  }

  it("422 z błędem pola, którego formularz nie ma: zdanie serwera nad formularzem", async () => {
    await renderEkranu();
    serwer.nadpisz("PATCH", "/admin/courses/4", () =>
      odmowa(422, "validation_failed", "Popraw zaznaczone pola.", { sequence_order: ["Ta pozycja w ścieżce jest zajęta."] }),
    );
    await zapiszFormularz();

    const komunikat = (await screen.findByText("Dane kursu nie zostały zapisane")).closest("[role='alert']") as HTMLElement;
    expect(within(komunikat).getByText("Ta pozycja w ścieżce jest zajęta.")).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Dane kursu" })).toBeInTheDocument();
  });

  it("422 bez listy błędów: komunikat serwera nad formularzem", async () => {
    await renderEkranu();
    serwer.nadpisz("PATCH", "/admin/courses/4", () => odmowa(422, "validation_failed", "Popraw zaznaczone pola."));
    await zapiszFormularz();

    const komunikat = (await screen.findByText("Dane kursu nie zostały zapisane")).closest("[role='alert']") as HTMLElement;
    expect(within(komunikat).getByText("Popraw zaznaczone pola.")).toBeInTheDocument();
  });

  it("422 z błędem znanego pola zostaje przy polu, bez komunikatu nad formularzem", async () => {
    await renderEkranu();
    serwer.nadpisz("PATCH", "/admin/courses/4", () =>
      odmowa(422, "validation_failed", "Popraw zaznaczone pola.", { title: ["Tytuł jest za długi."] }),
    );
    await zapiszFormularz();

    expect(await screen.findAllByText("Tytuł jest za długi.")).not.toHaveLength(0);
    expect(screen.queryByText("Dane kursu nie zostały zapisane")).toBeNull();
  });
});

describe("usuwanie tematu", () => {
  it("temat z lekcjami: bez okna i bez żądania, zdanie z liczbą lekcji przy liście tematów, fokus zostaje na przycisku", async () => {
    await renderEkranu();
    const usun = screen.getByRole("button", { name: "Usuń temat „Wprowadzenie”" });
    await userEvent.click(usun);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(serwer.zapisy()).toEqual([]);
    const lista = usun.closest("section")!;
    expect(
      within(lista).getByText("Temat „Wprowadzenie” ma 2 lekcje. Przenieś je do innego tematu, a potem usuń temat."),
    ).toBeInTheDocument();
    expect(usun).toHaveFocus();

    await userEvent.click(screen.getByRole("button", { name: "Usuń temat „Praktyka”" }));
    expect(
      within(lista).getByText("Temat „Praktyka” ma 1 lekcję. Przenieś ją do innego tematu, a potem usuń temat."),
    ).toBeInTheDocument();
    expect(within(lista).queryByText(/Temat „Wprowadzenie” ma/)).toBeNull();
  });

  it("temat pusty na serwerze, ale z lekcją przeniesioną na ekranie: też bez okna i bez żądania", async () => {
    serwer = utworzSerwer({ tematy: [temat(7, "Wprowadzenie", 1, [21, 22, 23]), temat(8, "Praktyka", 2, [])] });
    await renderEkranu();
    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Lekcja C” na początek tematu „Praktyka”" }));
    await userEvent.click(screen.getByRole("button", { name: "Usuń temat „Praktyka”" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(zapisy("DELETE", "/admin/topics/8")).toEqual([]);
    expect(
      screen.getByText("Temat „Praktyka” ma 1 lekcję. Przenieś ją do innego tematu, a potem usuń temat."),
    ).toBeInTheDocument();
  });

  it("temat opróżniony tylko na ekranie: bez okna, zdanie każe najpierw zapisać zmiany", async () => {
    serwer = utworzSerwer({ tematy: [temat(7, "Wprowadzenie", 1, [21, 22]), temat(8, "Praktyka", 2, [23])] });
    await renderEkranu();
    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Lekcja C” na koniec tematu „Wprowadzenie”" }));
    await userEvent.click(screen.getByRole("button", { name: "Usuń temat „Praktyka”" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(zapisy("DELETE", "/admin/topics/8")).toEqual([]);
    expect(
      screen.getByText(
        "Temat „Praktyka” ma lekcje na serwerze, bo zmiany w drzewie nie są jeszcze zapisane. Zapisz zmiany, a potem usuń temat.",
      ),
    ).toBeInTheDocument();
  });

  it("temat pusty: odmowa serwera stoi w oknie, okno zostaje, drzewo bez zmian", async () => {
    serwer = utworzSerwer({ tematy: [...TEMATY, temat(9, "Pusty", 3, [])] });
    await renderEkranu();
    serwer.nadpisz("DELETE", "/admin/topics/9", () =>
      odmowa(422, "conditions_not_met", "Temat ma lekcje."),
    );
    await userEvent.click(screen.getByRole("button", { name: "Usuń temat „Pusty”" }));
    const okno = screen.getByRole("dialog", { name: "Usunąć temat „Pusty”?" });
    await userEvent.click(within(okno).getByRole("button", { name: "Usuń temat" }));

    expect(
      await within(okno).findByText("Tego tematu nie można usunąć, bo ma lekcje. Przenieś je najpierw do innego tematu."),
    ).toBeInTheDocument();
    expect(within(okno).getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(within(document.getElementById("lekcje")!).queryByText("Zmiana nie została zapisana")).toBeNull();
    expect(screen.getByRole("heading", { level: 3, name: "Pusty" })).toBeInTheDocument();
  });

  it("temat pusty: udane usunięcie zamyka okno i zdejmuje temat", async () => {
    serwer = utworzSerwer({ tematy: [...TEMATY, temat(9, "Pusty", 3, [])] });
    await renderEkranu();
    serwer.nadpisz("DELETE", "/admin/topics/9", () => ({ id: 9, deleted: true }));
    await userEvent.click(screen.getByRole("button", { name: "Usuń temat „Pusty”" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Usuń temat" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("heading", { level: 3, name: "Pusty" })).toBeNull();
    expect(zapisy("DELETE", "/admin/topics/9")).toHaveLength(1);
  });
});

describe("okno nazwy tematu — błąd, który nie dotyczy nazwy", () => {
  async function otworzZmianeNazwy() {
    await renderEkranu();
    await userEvent.click(screen.getByRole("button", { name: "Zmień nazwę tematu „Wprowadzenie”" }));
    const okno = screen.getByRole("dialog", { name: "Zmień nazwę tematu" });
    return { okno, pole: within(okno).getByLabelText(/^Nazwa tematu/) };
  }

  it("błąd sieci: komunikat w oknie, pole „Nazwa tematu” bez błędu", async () => {
    const { okno, pole } = await otworzZmianeNazwy();
    serwer.nadpisz("PATCH", "/admin/topics/7", () => new TypeError("Failed to fetch"));
    await userEvent.click(within(okno).getByRole("button", { name: "Zapisz nazwę" }));

    const komunikat = await within(okno).findByRole("alert");
    expect(within(komunikat).getByText("Nazwa tematu nie została zapisana")).toBeInTheDocument();
    expect(
      within(komunikat).getByText("Nie udało się połączyć z serwerem. Spróbuj ponownie za chwilę."),
    ).toBeInTheDocument();
    expect(pole).not.toHaveAccessibleDescription(/Nie udało się/);
    expect(pole).toHaveValue("Wprowadzenie");
  });

  it("odmowa 403: komunikat w oknie, nie przy polu", async () => {
    const { okno, pole } = await otworzZmianeNazwy();
    serwer.nadpisz("PATCH", "/admin/topics/7", BRAK_ROLI);
    await userEvent.click(within(okno).getByRole("button", { name: "Zapisz nazwę" }));

    expect(await within(okno).findByRole("alert")).toHaveTextContent("Brak dostępu.");
    expect(pole).not.toHaveAccessibleDescription(/Brak dostępu/);
  });

  it("odmowa 422 na nazwie: zdanie serwera przy polu, bez osobnego komunikatu", async () => {
    const { okno, pole } = await otworzZmianeNazwy();
    serwer.nadpisz("PATCH", "/admin/topics/7", () =>
      odmowa(422, "validation_failed", "Popraw zaznaczone pola.", { title: ["Nazwa tematu jest za długa."] }),
    );
    await userEvent.click(within(okno).getByRole("button", { name: "Zapisz nazwę" }));

    await waitFor(() => expect(pole).toHaveAccessibleDescription(/Nazwa tematu jest za długa\./));
    expect(within(okno).queryByText("Nazwa tematu nie została zapisana")).toBeNull();
  });

  it("okno „Nowy temat”: błąd sieci też stoi w oknie pod własnym tytułem", async () => {
    await renderEkranu();
    serwer.nadpisz("POST", "/admin/courses/4/topics", () => new TypeError("Failed to fetch"));
    await userEvent.click(screen.getByRole("button", { name: "Dodaj temat" }));
    const okno = screen.getByRole("dialog", { name: "Nowy temat" });
    await userEvent.type(within(okno).getByLabelText(/^Nazwa tematu/), "Podsumowanie");
    await userEvent.click(within(okno).getByRole("button", { name: "Dodaj temat" }));

    expect(await within(okno).findByRole("alert")).toHaveTextContent("Temat nie został dodany");
    expect(within(okno).getByLabelText(/^Nazwa tematu/)).not.toHaveAccessibleDescription(/Nie udało się/);
  });
});
