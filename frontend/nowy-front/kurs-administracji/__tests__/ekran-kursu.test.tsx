import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";
import { uchwytWysylania } from "@/nowy-front/wysylanie-nagrania/uchwyt";
import { KURS, LEKCJE, PROWADZACY, TEMATY, lekcja, temat, utworzSerwer, type AtrapaSerwera } from "./atrapa-serwera";

/**
 * Próby ekranu kursu administracji w dwóch kolumnach. Atrapa stoi na
 * funkcjach `api`/`apiPaged` obu modułów klienta, więc funkcje danych ekranu
 * wykonują się naprawdę, a próba czyta adres, metodę i ciało każdego żądania.
 */

const back = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

// Stan wysyłania nagrania podaje próba; `null` = żadna lekcja nie ma wysyłania.
const wysylanie = vi.hoisted(() => ({ stan: null as null | { rodzaj: string; lekcja: { id: number; tytul: string; adres: string } } }));
vi.mock("@/nowy-front/wysylanie-nagrania/useWysylanie", () => ({
  useWysylanieLekcji: (idLekcji: number) => (wysylanie.stan !== null && wysylanie.stan.lekcja.id === idLekcji ? wysylanie.stan : null),
}));

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

const UKLAD = "/admin/courses/4/topics/reorder";

async function renderEkranu() {
  const wynik = render(<KursAdministracji idKursu="4" />);
  await screen.findByRole("heading", { level: 2, name: "Tematy i lekcje" });
  // Dane dodatkowe (test kursu) dochodzą po pierwszym rysowaniu.
  await waitFor(() => expect(serwer.wywolania.some((w) => w.sciezka === "/admin/courses/4/tests")).toBe(true));
  return wynik;
}

function kolejnoscLekcji(): string[] {
  return Array.from(document.querySelectorAll("li[data-lekcja]")).map((wiersz) => wiersz.getAttribute("data-lekcja")!);
}

function ogloszenie(): string {
  return document.querySelector("[data-ogloszenia]")?.textContent ?? "";
}

function zapisyUkladu() {
  return serwer.zapisy().filter((zapis) => zapis.sciezka === UKLAD);
}

function odroczony() {
  const oczekujace: { cialo: unknown; przyjmij: (wynik: unknown) => void; odrzuc: (blad: unknown) => void }[] = [];
  serwer.nadpisz(
    "PATCH",
    UKLAD,
    (cialo) =>
      new Promise((przyjmij, odrzuc) => {
        oczekujace.push({ cialo, przyjmij, odrzuc });
      }),
  );
  return oczekujace;
}

beforeEach(() => {
  serwer = utworzSerwer();
  wysylanie.stan = null;
});

describe("ekran kursu — odczyt i układ", () => {
  it("czyta wyłącznie trasy administracji i stoi w jednym main", async () => {
    const { container } = await renderEkranu();
    expect(serwer.sciezkiGrupy("instructor")).toEqual([]);
    expect(serwer.sciezkiGrupy("admin")).toEqual(
      expect.arrayContaining(["/admin/courses/4", "/admin/courses/4/lessons", "/admin/courses/4/topics"]),
    );
    expect(() => jedenMain(container)).not.toThrow();
    expect(container.querySelector("main")?.dataset.styleId).toBe("szablon-edycja");
  });

  it("karty w kolejności ekranu; dawnych sekcji i paska zapisu nie ma", async () => {
    await renderEkranu();
    const naglowki = screen.getAllByRole("heading", { level: 2 }).map((naglowek) => naglowek.textContent);
    expect(naglowki).toEqual([
      "Tematy i lekcje",
      "Publikacja",
      "Ustawienia kursu",
      "Starsze pliki kursu",
      "Usunięcie kursu",
    ]);
    expect(screen.getByText("Uczestnik przechodzi kurs w tej kolejności. Na końcu jest test.")).toBeInTheDocument();
    for (const nazwa of ["Tematy kursu", "Materiały kursu", "Dane kursu", "Zaproszenia na kurs"]) {
      expect(screen.queryByRole("heading", { name: nazwa })).toBeNull();
    }
    for (const nazwa of ["Zapisz zmiany", "Zapisz kolejność", "Porzuć zmiany", "Cofnij", "Edytuj"]) {
      expect(screen.queryByRole("button", { name: nazwa })).toBeNull();
    }
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByText("Kolejność")).toBeNull();
  });

  it("wiersz lekcji: numer, tytuł z podpowiedzią, drobne dane, stan i „Otwórz” do strony lekcji", async () => {
    await renderEkranu();
    const wiersz = document.querySelector('li[data-lekcja="22"]') as HTMLElement;
    expect(within(wiersz).getByText("2")).toBeInTheDocument();
    expect(within(wiersz).getByText("Lekcja B")).toHaveAttribute("title", "Lekcja B");
    expect(within(wiersz).getByText("10 min · bez plików")).toBeInTheDocument();
    await waitFor(() => expect(within(wiersz).getByText("Gotowa")).toBeInTheDocument());
    expect(within(wiersz).getByRole("link", { name: "Otwórz lekcję 2: Lekcja B" })).toHaveAttribute(
      "href",
      "/admin/kursy/4/lekcje/22",
    );
    // Strzałki stoją przed numerem: pierwsze elementy fokusowalne wiersza.
    const fokusowalne = Array.from(wiersz.querySelectorAll("button, a")).map((w) => w.getAttribute("aria-label"));
    expect(fokusowalne).toEqual([
      "Przenieś „Lekcja B” wyżej",
      "Przenieś „Lekcja B” niżej",
      "Otwórz lekcję 2: Lekcja B",
    ]);
  });

  it("prowadzący i liczba plików wchodzą do wiersza tylko z danych", async () => {
    serwer = utworzSerwer({
      lekcje: [{ ...lekcja(21, "Lekcja A"), materials_count: 2 }, lekcja(22, "Lekcja B"), lekcja(23, "Lekcja C")],
      przypisania: [
        { id: 1, course_id: 4, lesson_id: null, instructor: PROWADZACY[0] },
        { id: 2, course_id: 4, lesson_id: 22, instructor: PROWADZACY[1] },
      ],
    });
    await renderEkranu();
    expect(await screen.findByText("10 min · Joanna Demo · 2 pliki")).toBeInTheDocument();
    expect(screen.getByText("10 min · Adam Demo · bez plików")).toBeInTheDocument();
  });

  it("stan nagrania z serwera: przetwarzanie czeka, błąd jest do zrobienia", async () => {
    serwer = utworzSerwer({ nagrania: { 22: "processing", 23: "error" } });
    await renderEkranu();
    expect(await screen.findByText("Nagranie: przetwarzanie")).toBeInTheDocument();
    expect(await screen.findByText("Nagranie: błąd")).toBeInTheDocument();

    const karta = screen.getByRole("region", { name: "Publikacja" });
    expect(within(karta).getByRole("heading", { level: 3, name: "Do zrobienia (1)" })).toBeInTheDocument();
    expect(within(karta).getByRole("link", { name: "Lekcja 3: błąd nagrania." })).toHaveAttribute(
      "href",
      "/admin/kursy/4/lekcje/23",
    );
    expect(within(karta).getByRole("heading", { level: 3, name: "Czekamy (1)" })).toBeInTheDocument();
    expect(within(karta).getByText("Lekcja 2: nagranie się przetwarza, zwykle 10–30 minut.")).toBeInTheDocument();
    expect(within(karta).getByText("Gotowe: tytuł, opis, 1 lekcja.")).toBeInTheDocument();
  });

  it("wiersz lekcji, której nagranie się wysyła: procent z paskiem zamiast stanu z serwera; inne wiersze bez zmian", async () => {
    wysylanie.stan = {
      rodzaj: "wysylanie",
      lekcja: { id: 22, tytul: "Lekcja B", adres: "/admin/kursy/4/lekcje/22" },
      ...{ nazwa: "b.mp4", rozmiar: 1000, wyslano: 620, zostaloSekund: 240, zastepuje: null },
    };
    await renderEkranu();
    const wiersz = document.querySelector('li[data-lekcja="22"]') as HTMLElement;
    const miejsce = wiersz.querySelector<HTMLElement>('[data-wysylanie-w-wierszu="wysylanie"]')!;
    expect(miejsce.textContent!.replace(/ /g, " ")).toBe("Wysyłanie 62 %");
    expect(within(miejsce).getByRole("progressbar", { name: "Wysyłanie nagrania lekcji Lekcja B" })).toHaveAttribute(
      "aria-valuenow",
      "62",
    );
    expect(within(wiersz).queryByText("Gotowa")).toBeNull();
    expect(document.querySelectorAll("[data-wysylanie-w-wierszu]")).toHaveLength(1);
    // Kolejność fokusu wiersza bez zmian: pasek postępu nie jest kontrolką.
    expect(Array.from(wiersz.querySelectorAll("button, a"))).toHaveLength(3);
  });

  it("wiersz lekcji z przerwanym wysyłaniem mówi „Wysyłanie przerwane”", async () => {
    wysylanie.stan = {
      rodzaj: "przerwane",
      lekcja: { id: 23, tytul: "Lekcja C", adres: "/admin/kursy/4/lekcje/23" },
      ...{ nazwa: "c.mp4", rozmiar: 1000, wyslano: 480, innyPlik: false, zastepuje: null },
    };
    await renderEkranu();
    const wiersz = document.querySelector('li[data-lekcja="23"]') as HTMLElement;
    expect(wiersz.querySelector('[data-wysylanie-w-wierszu="przerwane"]')).toHaveTextContent("Wysyłanie przerwane");
    expect(document.querySelector('li[data-lekcja="22"] [data-wysylanie-w-wierszu]')).toBeNull();
  });

  it("zwinięty temat z lekcją do poprawy mówi „1 lekcja wymaga uwagi”", async () => {
    serwer = utworzSerwer({ nagrania: { 23: "error" } });
    await renderEkranu();
    await screen.findByText("Nagranie: błąd");
    expect(screen.queryByText("1 lekcja wymaga uwagi")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Zwiń temat Praktyka" }));
    expect(screen.getByText("1 lekcja wymaga uwagi")).toBeInTheDocument();
    expect(document.querySelector('li[data-lekcja="23"]')).toBeNull();
    expect(screen.getByRole("button", { name: "Rozwiń temat Praktyka" })).toHaveAttribute("aria-expanded", "false");
  });

  it("pas tematu: nazwa, „n lekcji · m min”", async () => {
    await renderEkranu();
    const pas = screen.getByRole("region", { name: "Temat Wprowadzenie" });
    expect(within(pas).getByRole("heading", { level: 3, name: "Wprowadzenie" })).toBeInTheDocument();
    expect(within(pas).getByText("2 lekcje · 20 min")).toBeInTheDocument();
  });

  it("test na koniec kursu: odnośnik do pytań tylko wtedy, gdy serwer poda test", async () => {
    await renderEkranu();
    expect(await screen.findByRole("link", { name: "Otwórz pytania" })).toHaveAttribute(
      "href",
      "/admin/testy/31/pytania",
    );
  });

  it("kurs bez testu: wiersz mówi to słowem, odnośnika nie ma", async () => {
    serwer = utworzSerwer({ test: null });
    await renderEkranu();
    expect(await screen.findByText("Kurs nie ma testu")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Otwórz pytania" })).toBeNull();
  });

  it("„Starsze pliki kursu” są tylko wtedy, gdy kurs ma pliki poza lekcjami", async () => {
    await renderEkranu();
    const karta = screen.getByRole("region", { name: "Starsze pliki kursu" });
    expect(within(karta).getByText("Kurs ma 1 plik dodany wcześniej, poza lekcjami.")).toBeInTheDocument();
    expect(within(karta).getByText("Nowe pliki dodawaj w lekcjach.")).toBeInTheDocument();
    expect(within(karta).queryByRole("button")).toBeNull();
  });

  it("kurs bez plików poza lekcjami nie ma karty „Starsze pliki kursu”", async () => {
    serwer = utworzSerwer({ kurs: { ...KURS, materials_count: 0 } });
    await renderEkranu();
    expect(screen.queryByRole("region", { name: "Starsze pliki kursu" })).toBeNull();
  });
});

describe("ekran kursu — stany bez kursu", () => {
  it("ładowanie", async () => {
    serwer.nadpisz("GET", "/admin/courses/4", () => new Promise(() => {}));
    render(<KursAdministracji idKursu="4" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Wczytywanie kursu" })).toBeInTheDocument();
  });

  it("odmowa roli przy odczycie tematów", async () => {
    serwer.nadpisz("GET", "/admin/courses/4/topics", () => new ApiError({ status: 403, code: "forbidden", message: "x" }));
    render(<KursAdministracji idKursu="4" />);
    expect((await screen.findAllByText(/administracji/)).length).toBeGreaterThan(0);
    expect(screen.queryByRole("heading", { level: 2, name: "Tematy i lekcje" })).toBeNull();
  });

  it("błąd odczytu: „Spróbuj ponownie” czyta kurs od nowa", async () => {
    let proby = 0;
    serwer.nadpisz("GET", "/admin/courses/4/topics", () => {
      proby += 1;
      return proby === 1 ? new Error("sieć") : TEMATY;
    });
    render(<KursAdministracji idKursu="4" />);
    await userEvent.click(await screen.findByRole("button", { name: "Spróbuj ponownie" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Tematy i lekcje" })).toBeInTheDocument();
  });
});

describe("ekran kursu — publikacja", () => {
  it("szkic: zdanie stanu i jeden przycisk główny w pasie, jeden w karcie od dwóch kolumn", async () => {
    const { container } = await renderEkranu();
    const karta = screen.getByRole("region", { name: "Publikacja" });
    expect(within(karta).getByText("Kurs jest szkicem. Uczestnicy go nie widzą.")).toBeInTheDocument();

    const wPasie = container.querySelectorAll('[data-obszar="pasek-waski"] button');
    const wKarcie = container.querySelectorAll('[data-obszar="tylko-od-dwoch-kolumn"] button');
    expect(Array.from(wPasie).map((p) => p.textContent)).toEqual(["Opublikuj kurs"]);
    expect(Array.from(wKarcie).map((p) => p.textContent)).toEqual(["Opublikuj kurs"]);
    // Poza tymi dwoma miejscami (arkusz pokazuje zawsze jedno) przycisku nie ma.
    expect(screen.getAllByRole("button", { name: "Opublikuj kurs" })).toHaveLength(2);
    expect(screen.queryByRole("link", { name: "Podgląd jako uczestnik" })).toBeNull();
  });

  it("„Opublikuj kurs” wysyła jedno żądanie i karta przechodzi w stan opublikowany", async () => {
    await renderEkranu();
    await userEvent.click(screen.getAllByRole("button", { name: "Opublikuj kurs" })[1]);

    const karta = screen.getByRole("region", { name: "Publikacja" });
    expect(await within(karta).findByText("Kurs jest opublikowany.")).toBeInTheDocument();
    expect(serwer.zapisy()).toEqual([{ sciezka: "/admin/courses/4", metoda: "PATCH", cialo: { is_published: true } }]);
    expect(within(karta).getByText("Zmiany w lekcjach uczestnicy widzą od razu po zapisaniu.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Opublikuj kurs" })).toBeNull();
    const podglady = screen.getAllByRole("link", { name: "Podgląd jako uczestnik" });
    expect(podglady).toHaveLength(2);
    expect(podglady[0]).toHaveAttribute("href", "/panel/kursy/wywiad-psychologiczny");
    expect(screen.getByRole("heading", { level: 2, name: "Cofnięcie publikacji i usunięcie kursu" })).toBeInTheDocument();
    expect(ogloszenie()).toBe("Kurs został opublikowany.");
    await waitFor(() => expect(document.activeElement?.id).toBe("publikacja-tytul"));
  });

  it("odmowa serwera: powody stają w miejscu listy, fokus idzie na nagłówek karty, czytnik słyszy powód", async () => {
    serwer = utworzSerwer({ kurs: { ...KURS, description: null } });
    serwer.nadpisz(
      "PATCH",
      "/admin/courses/4",
      () =>
        new ApiError({
          status: 422,
          code: "conditions_not_met",
          message: "Kurs nie spełnia warunków publikacji.",
          reason: { missing: ["lessons"] },
        }),
    );
    await renderEkranu();
    const karta = screen.getByRole("region", { name: "Publikacja" });
    expect(within(karta).getByRole("link", { name: "Kurs nie ma opisu." })).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("button", { name: "Opublikuj kurs" })[1]);

    expect(await within(karta).findByRole("heading", { level: 3, name: "Nie udało się opublikować (1)" })).toBeInTheDocument();
    expect(within(karta).getByRole("link", { name: "Dodaj co najmniej jedną lekcję." })).toBeInTheDocument();
    expect(within(karta).queryByRole("link", { name: "Kurs nie ma opisu." })).toBeNull();
    expect(within(karta).queryByText(/^Gotowe:/)).toBeNull();
    expect(within(karta).getByText("Kurs jest szkicem. Uczestnicy go nie widzą.")).toBeInTheDocument();
    expect(ogloszenie()).toBe("Kurs nie został opublikowany. Dodaj co najmniej jedną lekcję.");
    await waitFor(() => expect(document.activeElement?.id).toBe("publikacja-tytul"));
  });

  it("odmowa bez listy braków: zdanie serwera w karcie", async () => {
    serwer.nadpisz(
      "PATCH",
      "/admin/courses/4",
      () => new ApiError({ status: 422, code: "validation_failed", message: "Kurs jest warunkiem innego etapu." }),
    );
    await renderEkranu();
    await userEvent.click(screen.getAllByRole("button", { name: "Opublikuj kurs" })[0]);
    const karta = screen.getByRole("region", { name: "Publikacja" });
    expect(await within(karta).findByText("Kurs jest warunkiem innego etapu.")).toBeInTheDocument();
  });

  it("kurs opublikowany: braki nazywają się „Wymaga uwagi”, a cofnięcie publikacji pyta w oknie", async () => {
    serwer = utworzSerwer({ kurs: { ...KURS, is_published: true }, nagrania: { 23: "error" } });
    await renderEkranu();
    const karta = screen.getByRole("region", { name: "Publikacja" });
    expect(await within(karta).findByRole("heading", { level: 3, name: "Wymaga uwagi (1)" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Opublikuj kurs" })).toBeNull();

    const przelacznik = screen.getByRole("button", { name: "Cofnięcie publikacji i usunięcie kursu" });
    expect(przelacznik).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Cofnij publikację" })).toBeNull();
    await userEvent.click(przelacznik);
    expect(
      screen.getByText("Po cofnięciu publikacji kurs wraca do szkicu i uczestnicy przestają go widzieć."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Usunięty kurs znika razem z lekcjami, nagraniami i plikami. Tego nie da się cofnąć."),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cofnij publikację" }));
    const okno = screen.getByRole("dialog");
    expect(serwer.zapisy()).toEqual([]);
    await userEvent.click(within(okno).getByRole("button", { name: "Cofnij publikację" }));

    expect(await within(karta).findByText("Kurs jest szkicem. Uczestnicy go nie widzą.")).toBeInTheDocument();
    expect(serwer.zapisy()).toEqual([{ sciezka: "/admin/courses/4", metoda: "PATCH", cialo: { is_published: false } }]);
    expect(screen.getAllByRole("button", { name: "Opublikuj kurs" })).toHaveLength(2);
  });

  it("usunięcie kursu: karta zwinięta, zdanie ze skutkiem, pytanie w oknie, potem stan „kurs usunięty”", async () => {
    await renderEkranu();
    expect(screen.queryByRole("button", { name: "Usuń kurs" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Usunięcie kursu" }));
    expect(
      screen.getByText("Kurs zniknie razem z lekcjami, nagraniami i plikami. Tego nie da się cofnąć."),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Usuń kurs" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Usuń kurs" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Kurs usunięty" })).toBeInTheDocument();
    expect(serwer.zapisy()).toEqual([{ sciezka: "/admin/courses/4", metoda: "DELETE", cialo: undefined }]);
  });
});

describe("ekran kursu — ustawienia rozwijane w miejscu", () => {
  function wiersze() {
    const karta = screen.getByRole("region", { name: "Ustawienia kursu" });
    return Array.from(karta.querySelectorAll<HTMLButtonElement>("h3 > button[aria-expanded]"));
  }

  it("trzy wiersze ze stanem, wszystkie zwinięte; wiersza zdjęcia nie ma", async () => {
    await renderEkranu();
    expect(wiersze().map((w) => w.getAttribute("aria-expanded"))).toEqual(["false", "false", "false"]);
    expect(wiersze()[0]).toHaveTextContent("Opis i dane kursu");
    expect(wiersze()[0]).toHaveTextContent("Kurs · grupa PsychON · 2. miejsce w ścieżce");
    expect(wiersze()[1]).toHaveTextContent("Prowadzący");
    expect(wiersze()[2]).toHaveTextContent("Zaproszenia");
    expect(screen.queryByText("Zdjęcie kursu")).toBeNull();
    expect(screen.getByText("Pliki do pobrania dodajesz w lekcjach.")).toBeInTheDocument();
  });

  it("naraz otwarty jest najwyżej jeden wiersz; ponowne kliknięcie zwija", async () => {
    await renderEkranu();
    await userEvent.click(wiersze()[0]);
    expect(wiersze().map((w) => w.getAttribute("aria-expanded"))).toEqual(["true", "false", "false"]);
    expect(screen.getByRole("button", { name: "Zapisz dane kursu" })).toBeInTheDocument();

    await userEvent.click(wiersze()[1]);
    expect(wiersze().map((w) => w.getAttribute("aria-expanded"))).toEqual(["false", "true", "false"]);
    expect(screen.queryByRole("button", { name: "Zapisz dane kursu" })).toBeNull();
    expect(await screen.findByRole("button", { name: "Przypisz prowadzącego" })).toBeInTheDocument();

    await userEvent.click(wiersze()[2]);
    expect(wiersze().map((w) => w.getAttribute("aria-expanded"))).toEqual(["false", "false", "true"]);
    expect(screen.queryByRole("button", { name: "Przypisz prowadzącego" })).toBeNull();

    await userEvent.click(wiersze()[2]);
    expect(wiersze().map((w) => w.getAttribute("aria-expanded"))).toEqual(["false", "false", "false"]);
  });

  it("wiersz „Prowadzący” pokazuje prowadzącego całego kursu z danych", async () => {
    serwer = utworzSerwer({ przypisania: [{ id: 1, course_id: 4, lesson_id: null, instructor: PROWADZACY[0] }] });
    await renderEkranu();
    await waitFor(() => expect(wiersze()[1]).toHaveTextContent("Joanna Demo, cały kurs"));
  });

  it("„Zapisz dane kursu” wysyła te same pola co dotąd i jest przyciskiem zwykłym", async () => {
    await renderEkranu();
    await userEvent.click(wiersze()[0]);
    const opis = screen.getByRole("textbox", { name: "Opis kursu" });
    await userEvent.clear(opis);
    await userEvent.type(opis, "Nowy opis.");
    const zapisz = screen.getByRole("button", { name: "Zapisz dane kursu" });
    expect(zapisz.closest('[data-obszar="tylko-od-dwoch-kolumn"], [data-obszar="pasek-waski"]')).toBeNull();
    await userEvent.click(zapisz);

    await waitFor(() => expect(serwer.zapisy()).toHaveLength(1));
    expect(serwer.zapisy()[0]).toEqual({
      sciezka: "/admin/courses/4",
      metoda: "PATCH",
      cialo: {
        title: "Wywiad psychologiczny",
        description: "Nowy opis.",
        slug: "wywiad-psychologiczny",
        type: "course",
        product_group: "psychon",
      },
    });
    expect(await screen.findByText("Zapisano.")).toBeInTheDocument();
    expect(ogloszenie()).toBe("Zapisano dane kursu.");
    expect(wiersze()[0]).toHaveAttribute("aria-expanded", "true");
  });

  it("brak opisu: odnośnik z karty „Publikacja” rozwija wiersz danych i stawia na nim fokus", async () => {
    serwer = utworzSerwer({ kurs: { ...KURS, description: null } });
    await renderEkranu();
    await userEvent.click(screen.getByRole("link", { name: "Kurs nie ma opisu." }));
    expect(wiersze()[0]).toHaveAttribute("aria-expanded", "true");
    expect(document.activeElement).toBe(wiersze()[0]);
  });
});

describe("ekran kursu — dodawanie lekcji", () => {
  it("pole otwiera się przyciskiem, a po dodaniu zostaje otwarte z fokusem; czytnik słyszy numer i tytuł", async () => {
    await renderEkranu();
    expect(screen.queryByRole("textbox", { name: /Tytuł nowej lekcji/ })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Dodaj lekcję w temacie Wprowadzenie" }));
    const pole = screen.getByRole("textbox", { name: "Tytuł nowej lekcji w temacie Wprowadzenie" });
    expect(document.activeElement).toBe(pole);
    expect(screen.getByText("Resztę uzupełnisz po otwarciu lekcji.")).toBeInTheDocument();

    await userEvent.type(pole, "Nowa lekcja{Enter}");

    await waitFor(() => expect(kolejnoscLekcji()).toEqual(["21", "22", "100", "23"]));
    expect(serwer.zapisy()).toEqual([
      {
        sciezka: "/admin/courses/4/lessons",
        metoda: "POST",
        cialo: { title: "Nowa lekcja", description: null, duration_seconds: 0, topic_id: 7 },
      },
    ]);
    const poDodaniu = screen.getByRole("textbox", { name: "Tytuł nowej lekcji w temacie Wprowadzenie" });
    expect(poDodaniu).toHaveValue("");
    expect(document.activeElement).toBe(poDodaniu);
    expect(ogloszenie()).toBe("Dodano lekcję 3: Nowa lekcja");
    // Nowy wiersz stoi nad polem, w tym samym temacie.
    const tematNowej = document.querySelector('li[data-lekcja="100"]')?.closest("[data-temat]");
    expect(tematNowej).toBe(poDodaniu.closest("[data-temat]"));
    expect(
      document.querySelector('li[data-lekcja="100"]')!.compareDocumentPosition(poDodaniu) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("przycisk „Dodaj lekcję” w polu działa tak samo jak Enter; „Anuluj” zamyka pole i oddaje fokus", async () => {
    await renderEkranu();
    await userEvent.click(screen.getByRole("button", { name: "Dodaj lekcję w temacie Praktyka" }));
    await userEvent.type(screen.getByRole("textbox", { name: /Tytuł nowej lekcji/ }), "Druga");
    await userEvent.click(screen.getByRole("button", { name: "Dodaj lekcję" }));
    await waitFor(() => expect(kolejnoscLekcji()).toEqual(["21", "22", "23", "100"]));

    await userEvent.click(screen.getByRole("button", { name: "Anuluj" }));
    expect(screen.queryByRole("textbox", { name: /Tytuł nowej lekcji/ })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Dodaj lekcję w temacie Praktyka" }));
  });

  it("pusty tytuł: zdanie przy polu, zero żądań", async () => {
    await renderEkranu();
    await userEvent.click(screen.getByRole("button", { name: "Dodaj lekcję w temacie Wprowadzenie" }));
    await userEvent.click(screen.getByRole("button", { name: "Dodaj lekcję" }));
    expect(screen.getByText("Podaj tytuł lekcji.")).toBeInTheDocument();
    expect(serwer.zapisy()).toEqual([]);
  });

  it("odmowa serwera: zdanie przy polu, wpisany tytuł zostaje", async () => {
    serwer.nadpisz(
      "POST",
      "/admin/courses/4/lessons",
      () =>
        new ApiError({
          status: 422,
          code: "validation_failed",
          message: "Popraw zaznaczone pola.",
          errors: { title: ["Tytuł jest za długi."] },
        }),
    );
    await renderEkranu();
    await userEvent.click(screen.getByRole("button", { name: "Dodaj lekcję w temacie Wprowadzenie" }));
    const pole = screen.getByRole("textbox", { name: /Tytuł nowej lekcji/ });
    await userEvent.type(pole, "Tytuł{Enter}");
    expect(await screen.findByText("Tytuł jest za długi.")).toBeInTheDocument();
    expect(pole).toHaveValue("Tytuł");
    expect(kolejnoscLekcji()).toEqual(["21", "22", "23"]);
  });

  it("w pustym temacie pole stoi otwarte od wejścia, bez fokusu i bez „Anuluj”", async () => {
    serwer = utworzSerwer({ tematy: [...TEMATY, temat(9, "Zakończenie", 3, [])] });
    await renderEkranu();
    const pole = screen.getByRole("textbox", { name: "Tytuł nowej lekcji w temacie Zakończenie" });
    expect(document.activeElement).not.toBe(pole);
    expect(screen.queryByRole("button", { name: "Anuluj" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Dodaj lekcję w temacie Zakończenie" })).toBeNull();
    expect(screen.getByRole("button", { name: "Dodaj lekcję w temacie Wprowadzenie" })).toBeInTheDocument();
  });
});

describe("ekran kursu — kolejność zapisuje się sama", () => {
  it("strzałka przenosi wiersz od razu i wysyła cały układ tą samą trasą co dotąd", async () => {
    await renderEkranu();
    const wDol = screen.getByRole("button", { name: "Przenieś „Lekcja A” niżej" });
    await userEvent.click(wDol);

    expect(kolejnoscLekcji()).toEqual(["22", "21", "23"]);
    await waitFor(() => expect(zapisyUkladu()).toHaveLength(1));
    expect(zapisyUkladu()[0]).toEqual({
      sciezka: UKLAD,
      metoda: "PATCH",
      cialo: {
        topics: [
          { id: 7, lesson_ids: [22, 21] },
          { id: 8, lesson_ids: [23] },
        ],
      },
    });
    expect(ogloszenie()).toBe("Przeniesiono „Lekcja A” na miejsce 2 z 2.");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Przenieś „Lekcja A” niżej" }));
  });

  it("z końca tematu lekcja przechodzi na początek następnego, a fokus idzie za nią", async () => {
    await renderEkranu();
    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Lekcja B” niżej" }));
    await waitFor(() => expect(zapisyUkladu()).toHaveLength(1));
    expect(zapisyUkladu()[0].cialo).toEqual({
      topics: [
        { id: 7, lesson_ids: [21] },
        { id: 8, lesson_ids: [22, 23] },
      ],
    });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Przenieś „Lekcja B” niżej" }));
    expect(ogloszenie()).toBe("Przeniesiono „Lekcja B” do tematu „Praktyka”, miejsce 1 z 2.");
  });

  it("świadek współistnienia: wiersz z trwającym wysyłaniem nagrania ma strzałki i stan wysyłania, a zamiana miejsc nie przerywa wysyłania ani nie gubi stanu wiersza", async () => {
    wysylanie.stan = {
      rodzaj: "wysylanie",
      lekcja: { id: 22, tytul: "Lekcja B", adres: "/admin/kursy/4/lekcje/22" },
      ...{ nazwa: "b.mp4", rozmiar: 1000, wyslano: 620, zostaloSekund: 240, zastepuje: null },
    };
    const przerwij = vi.spyOn(uchwytWysylania, "przerwij");
    const porzuc = vi.spyOn(uchwytWysylania, "porzuc");
    await renderEkranu();

    function wierszB() {
      return document.querySelector('li[data-lekcja="22"]') as HTMLElement;
    }
    function sprawdzWiersz() {
      const wiersz = wierszB();
      expect(wiersz.querySelectorAll("[data-strzalka]")).toHaveLength(2);
      const miejsce = wiersz.querySelector<HTMLElement>('[data-wysylanie-w-wierszu="wysylanie"]')!;
      expect(miejsce.textContent!.replace(/ /g, " ")).toBe("Wysyłanie 62 %");
      expect(within(miejsce).getByRole("progressbar", { name: "Wysyłanie nagrania lekcji Lekcja B" })).toHaveAttribute("aria-valuenow", "62");
      expect(document.querySelectorAll("[data-wysylanie-w-wierszu]")).toHaveLength(1);
    }
    sprawdzWiersz();

    // Zamiana w obrębie tematu: wiersz B jedzie w górę, stan wysyłania zostaje w nim.
    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Lekcja B” wyżej" }));
    await waitFor(() => expect(zapisyUkladu()).toHaveLength(1));
    expect(kolejnoscLekcji()).toEqual(["22", "21", "23"]);
    sprawdzWiersz();

    // Przejście do następnego tematu przemontowuje wiersz — stan wysyłania wraca z uchwytu.
    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Lekcja B” niżej" }));
    await waitFor(() => expect(zapisyUkladu()).toHaveLength(2));
    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Lekcja B” niżej" }));
    await waitFor(() => expect(zapisyUkladu()).toHaveLength(3));
    expect(zapisyUkladu()[2].cialo).toEqual({
      topics: [
        { id: 7, lesson_ids: [21] },
        { id: 8, lesson_ids: [22, 23] },
      ],
    });
    sprawdzWiersz();

    expect(przerwij).not.toHaveBeenCalled();
    expect(porzuc).not.toHaveBeenCalled();
  });

  it("świadek: kolejność zmieniają tylko strzałki po lewej — bez przeciągania i bez przełącznika „Kolejność”", async () => {
    const { container } = await renderEkranu();
    expect(container.querySelectorAll("[draggable]")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Kolejność" })).toBeNull();
    const wiersz = screen.getByRole("button", { name: "Przenieś „Lekcja B” wyżej" }).closest("li")!;
    const strzalki = wiersz.querySelectorAll("[data-strzalka]");
    expect(strzalki).toHaveLength(2);
    expect(wiersz.firstElementChild!.contains(strzalki[0])).toBe(true);
    expect(wiersz.children[1].textContent).toBe("2");
  });

  it("pierwsza lekcja w górę i ostatnia w dół są niedostępne i nic nie wysyłają", async () => {
    await renderEkranu();
    const wGore = screen.getByRole("button", { name: "Przenieś „Lekcja A” wyżej" });
    const wDol = screen.getByRole("button", { name: "Przenieś „Lekcja C” niżej" });
    expect(wGore).toHaveAttribute("aria-disabled", "true");
    expect(wDol).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(wGore);
    await userEvent.click(wDol);
    expect(serwer.zapisy()).toEqual([]);
    expect(kolejnoscLekcji()).toEqual(["21", "22", "23"]);
  });

  it("ruch w trakcie zapisu czeka: po zakończeniu poprzedniego idzie jedno żądanie z najnowszym układem", async () => {
    await renderEkranu();
    const oczekujace = odroczony();

    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Lekcja A” niżej" }));
    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Lekcja A” niżej" }));
    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Lekcja C” wyżej" }));

    expect(kolejnoscLekcji()).toEqual(["22", "23", "21"]);
    expect(oczekujace).toHaveLength(1);
    expect(oczekujace[0].cialo).toEqual({
      topics: [
        { id: 7, lesson_ids: [22, 21] },
        { id: 8, lesson_ids: [23] },
      ],
    });

    oczekujace[0].przyjmij(TEMATY);
    await waitFor(() => expect(oczekujace).toHaveLength(2));
    expect(oczekujace[1].cialo).toEqual({
      topics: [
        { id: 7, lesson_ids: [22] },
        { id: 8, lesson_ids: [23, 21] },
      ],
    });
    oczekujace[1].przyjmij(TEMATY);
    await waitFor(() => expect(zapisyUkladu()).toHaveLength(2));
    expect(kolejnoscLekcji()).toEqual(["22", "23", "21"]);
  });

  it("odmowa: wiersze wracają, komunikat stoi w karcie i trafia do czytnika", async () => {
    serwer.nadpisz(
      "PATCH",
      UKLAD,
      () => new ApiError({ status: 422, code: "validation_failed", message: "Układ kursu zmienił się na serwerze." }),
    );
    await renderEkranu();
    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Lekcja A” niżej" }));

    const karta = screen.getByRole("region", { name: "Tematy i lekcje" });
    expect(await within(karta).findByText("Kolejność nie została zapisana")).toBeInTheDocument();
    expect(kolejnoscLekcji()).toEqual(["21", "22", "23"]);
    expect(within(karta).getByText(/Układ kursu zmienił się na serwerze\. Wiersze wróciły na poprzednie miejsca\./)).toBeInTheDocument();
    expect(ogloszenie()).toMatch(/^Kolejność nie została zapisana\. .*Wiersze wróciły na poprzednie miejsca\.$/);
  });

  it("odmowa po dwóch ruchach cofa oba: ekran wraca do układu potwierdzonego przez serwer", async () => {
    await renderEkranu();
    const oczekujace = odroczony();
    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Lekcja A” niżej" }));
    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Lekcja A” niżej" }));
    expect(kolejnoscLekcji()).toEqual(["22", "21", "23"]);

    oczekujace[0].odrzuc(new Error("sieć"));
    await waitFor(() => expect(kolejnoscLekcji()).toEqual(["21", "22", "23"]));
    expect(oczekujace).toHaveLength(1);
  });

  it("kolejny ruch po odmowie zdejmuje komunikat i zapisuje się normalnie", async () => {
    let proby = 0;
    serwer.nadpisz("PATCH", UKLAD, () => {
      proby += 1;
      return proby === 1 ? new Error("sieć") : TEMATY;
    });
    await renderEkranu();
    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Lekcja A” niżej" }));
    expect(await screen.findByText("Kolejność nie została zapisana")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Przenieś „Lekcja A” niżej" }));
    expect(screen.queryByText("Kolejność nie została zapisana")).toBeNull();
    await waitFor(() => expect(zapisyUkladu()).toHaveLength(2));
    expect(kolejnoscLekcji()).toEqual(["22", "21", "23"]);
  });
});

describe("ekran kursu — tematy", () => {
  async function otworzWiecej(nazwa: string) {
    const przycisk = screen.getByRole("button", { name: `Więcej działań tematu ${nazwa}` });
    await userEvent.click(przycisk);
    return przycisk;
  }

  it("„Więcej” jest zwinięte; po otwarciu ma działania tematu i zdanie o usuwaniu", async () => {
    await renderEkranu();
    expect(screen.queryByRole("button", { name: "Usuń temat" })).toBeNull();
    const przycisk = await otworzWiecej("Wprowadzenie");
    expect(przycisk).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByRole("button", { name: "Przenieś temat wyżej" })).toBeNull();
    expect(screen.getByRole("button", { name: "Przenieś temat niżej" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Usuń temat" })).toBeInTheDocument();
    expect(
      screen.getByText("Najpierw zapytamy i powiemy, co stanie się z lekcjami tego tematu."),
    ).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "Usuń temat" })).toBeNull();
    expect(document.activeElement).toBe(przycisk);
  });

  it("„Przenieś temat niżej” zapisuje się samo tą samą trasą układu, lekcje zostają w tematach", async () => {
    await renderEkranu();
    await otworzWiecej("Wprowadzenie");
    await userEvent.click(screen.getByRole("button", { name: "Przenieś temat niżej" }));

    expect(kolejnoscLekcji()).toEqual(["23", "21", "22"]);
    await waitFor(() => expect(zapisyUkladu()).toHaveLength(1));
    expect(zapisyUkladu()[0].cialo).toEqual({
      topics: [
        { id: 8, lesson_ids: [23] },
        { id: 7, lesson_ids: [21, 22] },
      ],
    });
    expect(ogloszenie()).toBe("Przeniesiono temat „Wprowadzenie” na miejsce 2 z 2.");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Więcej działań tematu Wprowadzenie" }));
  });

  it("temat z lekcjami: okno mówi, co stanie się z lekcjami, i niczego nie usuwa", async () => {
    await renderEkranu();
    await otworzWiecej("Wprowadzenie");
    await userEvent.click(screen.getByRole("button", { name: "Usuń temat" }));

    const okno = screen.getByRole("dialog");
    expect(within(okno).getByText(/Temat ma 2 lekcje\. Lekcje nie znikają razem z tematem/)).toBeInTheDocument();
    await userEvent.click(within(okno).getByRole("button", { name: "Rozumiem" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(serwer.zapisy()).toEqual([]);
    expect(screen.getByRole("heading", { level: 3, name: "Wprowadzenie" })).toBeInTheDocument();
  });

  it("pusty temat: po potwierdzeniu znika jednym żądaniem usunięcia", async () => {
    serwer = utworzSerwer({ tematy: [...TEMATY, temat(9, "Zakończenie", 3, [])] });
    serwer.nadpisz("DELETE", "/admin/topics/9", () => ({ id: 9, deleted: true }));
    await renderEkranu();
    await otworzWiecej("Zakończenie");
    await userEvent.click(screen.getByRole("button", { name: "Usuń temat" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Usuń temat" }));

    await waitFor(() => expect(screen.queryByRole("heading", { level: 3, name: "Zakończenie" })).toBeNull());
    expect(serwer.zapisy()).toEqual([{ sciezka: "/admin/topics/9", metoda: "DELETE", cialo: undefined }]);
    expect(ogloszenie()).toBe("Usunięto temat „Zakończenie”.");
  });

  it("„+ Dodaj temat” stoi pod drzewem i dopisuje temat na końcu", async () => {
    await renderEkranu();
    await userEvent.click(screen.getByRole("button", { name: "+ Dodaj temat" }));
    await userEvent.type(within(screen.getByRole("dialog")).getByRole("textbox", { name: /Nazwa tematu/ }), "Nowy{Enter}");

    expect(await screen.findByRole("heading", { level: 3, name: "Nowy" })).toBeInTheDocument();
    expect(serwer.zapisy()).toEqual([{ sciezka: "/admin/courses/4/topics", metoda: "POST", cialo: { title: "Nowy" } }]);
    const tematy = screen.getAllByRole("heading", { level: 3 }).map((naglowek) => naglowek.textContent);
    expect(tematy.slice(0, 3)).toEqual(["Wprowadzenie", "Praktyka", "Nowy"]);
  });

  it("„Zmień nazwę” zapisuje nazwę tematu", async () => {
    serwer.nadpisz("PATCH", "/admin/topics/7", (cialo) => ({ ...TEMATY[0], title: (cialo as { title: string }).title }));
    await renderEkranu();
    await userEvent.click(screen.getByRole("button", { name: "Zmień nazwę tematu Wprowadzenie" }));
    const pole = within(screen.getByRole("dialog")).getByRole("textbox", { name: /Nazwa tematu/ });
    expect(pole).toHaveValue("Wprowadzenie");
    await userEvent.clear(pole);
    await userEvent.type(pole, "Początek{Enter}");

    expect(await screen.findByRole("heading", { level: 3, name: "Początek" })).toBeInTheDocument();
    expect(serwer.zapisy()).toEqual([{ sciezka: "/admin/topics/7", metoda: "PATCH", cialo: { title: "Początek" } }]);
  });

  it("kurs bez tematów: zdanie i „+ Dodaj temat”", async () => {
    serwer = utworzSerwer({ lekcje: [], tematy: [], kurs: { ...KURS, lessons_count: 0 } });
    await renderEkranu();
    expect(screen.getByText(/Kurs nie ma jeszcze tematów/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Dodaj temat" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kurs nie ma jeszcze lekcji." })).toBeInTheDocument();
    expect(LEKCJE).toHaveLength(3);
  });
});
