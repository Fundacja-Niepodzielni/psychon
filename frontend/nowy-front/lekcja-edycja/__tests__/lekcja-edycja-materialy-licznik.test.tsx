import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LekcjaAdmin, MaterialAdmin, StanNagrania } from "../dane";

/**
 * Karta „Pliki do tej lekcji” strony lekcji:
 *  - po wejściu pokazuje WSZYSTKIE pliki lekcji z odczytu serwera
 *    (`GET /admin/lessons/{id}/materials`), w kolejności serwera, w jednym
 *    wspólnym wyglądzie wiersza (nazwa, typ i rozmiar, „Usuń”);
 *  - licznik jest długością tej listy; `materials_count` zasobu lekcji służy
 *    tylko do czasu pierwszej odpowiedzi odczytu;
 *  - dodanie i usunięcie odświeżają listę i licznik bez przeładowania;
 *  - stany: wczytywanie, pusty, błąd odczytu (zdanie + „Spróbuj ponownie”),
 *    odmowa roli, odpowiedź z 200 pozycjami;
 *  - wgrany plik widać raz: jeden wiersz z nazwą i „Usuń”; wiersz stanu jest
 *    tylko w trakcie wgrywania albo przy błędzie.
 */

// Pierwsze odszukanie elementu po renderze ekranu (lista plików, jej stany, pole tytułu) bywa pod obciążeniem wolniejsze niż domyślny limit 1 s:
// dostaje 12 s, a próba 15 s: przy braku elementu próba pada na odszukaniu z czytelnym komunikatem, nie na limicie przypadku.
// Zmierzone na cichym hoście: najdłuższy przypadek tego pliku z 10 biegów trwa maks. 0,33 s (całe odszukanie mieści się w tym czasie).
// Pozostałe oczekiwania i asercje zostają bez zmian.
const PIERWSZE_ODSZUKANIE = { timeout: 12_000 };
vi.setConfig({ testTimeout: 15000 });

const api = vi.fn();
const pobierzJa = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/api/klient", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/api/klient")>();
  return { ...oryginal, api: (...argumenty: unknown[]) => api(...argumenty) };
});

vi.mock("@/lib/api/h01-wspolpraca", () => ({
  pobierzJa: (...argumenty: unknown[]) => pobierzJa(...argumenty),
}));

const { ApiError } = await import("@/lib/api/klient");
const { LekcjaEdycja } = await import("../LekcjaEdycja");

function lekcja(liczbaMaterialow: number): LekcjaAdmin {
  return {
    id: 21,
    course_id: 3,
    title: "Wprowadzenie do wywiadu",
    description: null,
    content: null,
    sequence_order: 1,
    topic_id: 7,
    topic_position: 1,
    video_provider_id: null,
    duration_seconds: 1800,
    materials_count: liczbaMaterialow,
    created_at: null,
    updated_at: null,
  };
}

const BRAK_NAGRANIA: StanNagrania = { status: "no_video" };

function material(id: number, nazwa: string, rozmiar: number | null = 4096): MaterialAdmin {
  return {
    id,
    name: nazwa,
    mime: "application/pdf",
    size: rozmiar,
    lesson_id: 21,
    course_id: null,
    created_at: null,
  };
}

const WGRANY = material(9, "karta.pdf", 4);
const WCZESNIEJSZE = [material(1, "porady.pdf", 2048), material(2, "slajdy.pptx", 1048576), material(3, "mapa.png", 512)];

type Wynik = unknown;
type Odczyt = () => Wynik | Promise<Wynik>;
type Wgranie = () => unknown;

interface Ustawienia {
  /** Pole `materials_count` zasobu lekcji. */
  licznikLekcji?: number;
  odczyt?: Odczyt;
  wgranie?: Wgranie;
  usuniecie?: (id: number) => Wynik;
}

function odczytyListy(): unknown[][] {
  return api.mock.calls.filter(([sciezka, opcje]) => sciezka === "/admin/lessons/21/materials" && !opcje?.method);
}

async function renderEkranu(ustawienia: Ustawienia = {}) {
  const odczyt = ustawienia.odczyt ?? (() => WCZESNIEJSZE);
  const licznikLekcji = ustawienia.licznikLekcji ?? 3;
  pobierzJa.mockResolvedValue({ program_completed_at: null, role: "project_manager" });
  api.mockImplementation(async (sciezka: string, opcje?: { method?: string }) => {
    const metoda = opcje?.method ?? "GET";
    if (metoda === "GET" && sciezka === "/admin/courses/3/lessons") return [lekcja(licznikLekcji)];
    if (metoda === "GET" && sciezka === "/admin/lessons/21/video-status") return BRAK_NAGRANIA;
    if (metoda === "GET" && sciezka === "/admin/lessons/21/materials") {
      const wynik = await odczyt();
      if (wynik instanceof Error) throw wynik;
      return wynik;
    }
    if (metoda === "POST" && sciezka === "/admin/lessons/21/materials") {
      const wynik = (ustawienia.wgranie ?? (() => WGRANY))();
      if (wynik instanceof Error) throw wynik;
      return wynik;
    }
    const usuwany = /^\/admin\/materials\/(\d+)$/.exec(sciezka);
    if (metoda === "DELETE" && usuwany) {
      const id = Number(usuwany[1]);
      const wynik = ustawienia.usuniecie ? ustawienia.usuniecie(id) : { id, deleted: true };
      if (wynik instanceof Error) throw wynik;
      return wynik;
    }
    throw new Error(`Nieoczekiwana trasa: ${metoda} ${sciezka}`);
  });
  const uzytkownik = userEvent.setup();
  const wynik = render(<LekcjaEdycja idLekcji={21} idKursu={3} />);
  await screen.findByLabelText(/^Tytuł lekcji/, undefined, PIERWSZE_ODSZUKANIE);
  return { ...wynik, uzytkownik };
}

function sekcja(): HTMLElement {
  return screen.getByRole("heading", { level: 2, name: "Pliki do tej lekcji" }).closest("section")!;
}

function lista(): HTMLElement {
  return within(sekcja()).getByRole("list", { name: "Pliki lekcji" });
}

function nazwyNaLiscie(): string[] {
  return within(lista())
    .getAllByRole("listitem")
    .map((wiersz) => wiersz.querySelector("strong")?.textContent ?? "");
}

async function wgraj(container: HTMLElement, uzytkownik: ReturnType<typeof userEvent.setup>, nazwa = "karta.pdf") {
  const wejscie = container.querySelector<HTMLInputElement>('input[type="file"][id$="-plik-materialu"]')!;
  await uzytkownik.upload(wejscie, new File(["%PDF"], nazwa, { type: "application/pdf" }));
}

async function usunPlik(uzytkownik: ReturnType<typeof userEvent.setup>, nazwa: string) {
  await uzytkownik.click(screen.getByRole("button", { name: `Usuń plik ${nazwa}` }));
  await uzytkownik.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Usuń plik" }));
}

beforeEach(() => {
  api.mockReset();
  pobierzJa.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("lista plików wgranych wcześniej (S1, S7)", () => {
  it("lekcja z plikami z odczytu pokazuje je wszystkie po wejściu: nazwa, typ i rozmiar, „Usuń”; kolejność z serwera", async () => {
    await renderEkranu();

    await within(sekcja()).findByRole("list", { name: "Pliki lekcji" }, PIERWSZE_ODSZUKANIE);
    expect(nazwyNaLiscie()).toEqual(["porady.pdf", "slajdy.pptx", "mapa.png"]);
    const wiersze = within(lista()).getAllByRole("listitem");
    expect(wiersze[0]).toHaveTextContent("PDF · 2 KB");
    expect(wiersze[1]).toHaveTextContent("PPTX · 1,0 MB");
    expect(wiersze[2]).toHaveTextContent("PNG · 512 B");
    for (const nazwa of ["porady.pdf", "slajdy.pptx", "mapa.png"]) {
      expect(within(sekcja()).getByRole("button", { name: `Usuń plik ${nazwa}` })).toHaveTextContent("Usuń");
    }
  });

  it("odczyt idzie dokładnie pod GET /admin/lessons/{id}/materials, bez parametrów, raz", async () => {
    await renderEkranu();
    await within(sekcja()).findByRole("list", { name: "Pliki lekcji" }, PIERWSZE_ODSZUKANIE);

    expect(api).toHaveBeenCalledWith("/admin/lessons/21/materials");
    expect(odczytyListy()).toEqual([["/admin/lessons/21/materials"]]);
    expect(api.mock.calls.filter(([sciezka]) => String(sciezka).includes("materials?"))).toEqual([]);
  });

  it("zdania roboczego o liście nie ma na ekranie", async () => {
    await renderEkranu();
    await within(sekcja()).findByRole("list", { name: "Pliki lekcji" }, PIERWSZE_ODSZUKANIE);

    expect(within(sekcja()).queryByText(/wcześniej wgranych plików pojawi/)).toBeNull();
    expect(within(sekcja()).queryByText(/na razie widać tylko/)).toBeNull();
  });
});

describe("licznik = długość listy (S2)", () => {
  it("do czasu odpowiedzi odczytu liczy `materials_count` i mówi, że lista się wczytuje", async () => {
    // Odpowiedź odczytu istnieje od początku, niezależnie od chwili, w której żądanie listy
    // wyjdzie: pod obciążeniem maszyny żądanie wychodziło dopiero po `odpowiedz(...)`,
    // odpowiedź trafiała w pustą funkcję i lista nie wczytywała się nigdy.
    let odpowiedz: (pliki: MaterialAdmin[]) => void = () => undefined;
    const lista = new Promise<MaterialAdmin[]>((ok) => (odpowiedz = ok));
    await renderEkranu({ licznikLekcji: 5, odczyt: () => lista });

    expect(within(sekcja()).getByText("Ta lekcja ma 5 plików.")).toBeInTheDocument();
    expect(within(sekcja()).getByText("Wczytywanie listy plików…")).toBeInTheDocument();
    expect(within(sekcja()).queryByRole("list", { name: "Pliki lekcji" })).toBeNull();

    odpowiedz(WCZESNIEJSZE);
    expect(await within(sekcja()).findByText("Ta lekcja ma 3 pliki.", undefined, PIERWSZE_ODSZUKANIE)).toBeInTheDocument();
    expect(within(sekcja()).queryByText("Wczytywanie listy plików…")).toBeNull();
  });

  it("po odpowiedzi licznik to długość listy, także gdy `materials_count` mówił co innego", async () => {
    await renderEkranu({ licznikLekcji: 7, odczyt: () => [material(1, "jedyny.pdf")] });

    expect(await within(sekcja()).findByText("Ta lekcja ma 1 plik.", undefined, PIERWSZE_ODSZUKANIE)).toBeInTheDocument();
    expect(within(sekcja()).queryByText("Ta lekcja ma 7 plików.")).toBeNull();
    expect(nazwyNaLiscie()).toEqual(["jedyny.pdf"]);
  });

  it.each([
    [1, "Ta lekcja ma 1 plik."],
    [2, "Ta lekcja ma 2 pliki."],
    [4, "Ta lekcja ma 4 pliki."],
    [5, "Ta lekcja ma 5 plików."],
    [12, "Ta lekcja ma 12 plików."],
    [22, "Ta lekcja ma 22 pliki."],
    [25, "Ta lekcja ma 25 plików."],
  ])("lista %i plików: forma liczby „%s”", async (liczba, zdanie) => {
    const pliki = Array.from({ length: liczba }, (_, i) => material(i + 1, `plik-${i + 1}.pdf`));
    await renderEkranu({ licznikLekcji: liczba, odczyt: () => pliki });

    // Zdanie z `materials_count` stoi jeszcze przed odpowiedzią odczytu, więc na listę trzeba poczekać osobno.
    await within(sekcja()).findByRole("list", { name: "Pliki lekcji" }, PIERWSZE_ODSZUKANIE);
    expect(await within(sekcja()).findByText(zdanie, undefined, PIERWSZE_ODSZUKANIE)).toBeInTheDocument();
    expect(within(lista()).getAllByRole("listitem")).toHaveLength(liczba);
  });
});

describe("dodanie i usunięcie odświeżają listę i licznik bez przeładowania (S3)", () => {
  it("wgranie pliku dopisuje wiersz na końcu listy (3 → 4), bez drugiego odczytu", async () => {
    const { container, uzytkownik } = await renderEkranu();
    await within(sekcja()).findByRole("list", { name: "Pliki lekcji" }, PIERWSZE_ODSZUKANIE);

    await wgraj(container, uzytkownik);

    expect(await within(sekcja()).findByText("Ta lekcja ma 4 pliki.")).toBeInTheDocument();
    expect(nazwyNaLiscie()).toEqual(["porady.pdf", "slajdy.pptx", "mapa.png", "karta.pdf"]);
    expect(odczytyListy()).toHaveLength(1);
  });

  it("usunięcie pliku z listy: jedno DELETE, wiersz znika, licznik 3 → 2, bez drugiego odczytu", async () => {
    const { uzytkownik } = await renderEkranu();
    await within(sekcja()).findByRole("list", { name: "Pliki lekcji" }, PIERWSZE_ODSZUKANIE);

    await usunPlik(uzytkownik, "slajdy.pptx");

    await waitFor(() => expect(within(sekcja()).getByText("Ta lekcja ma 2 pliki.")).toBeInTheDocument());
    expect(nazwyNaLiscie()).toEqual(["porady.pdf", "mapa.png"]);
    expect(api.mock.calls.filter(([sciezka, opcje]) => opcje?.method === "DELETE" && sciezka === "/admin/materials/2")).toHaveLength(1);
    expect(odczytyListy()).toHaveLength(1);
  });

  it("usunięcie pliku dodanego teraz i wcześniejszego razem: licznik schodzi do zera i stoi stan pusty", async () => {
    const { container, uzytkownik } = await renderEkranu({ licznikLekcji: 1, odczyt: () => [material(1, "porady.pdf")] });
    await within(sekcja()).findByRole("list", { name: "Pliki lekcji" }, PIERWSZE_ODSZUKANIE);
    await wgraj(container, uzytkownik);
    await screen.findByRole("button", { name: "Usuń plik karta.pdf" });

    await usunPlik(uzytkownik, "karta.pdf");
    await waitFor(() => expect(within(sekcja()).getByText("Ta lekcja ma 1 plik.")).toBeInTheDocument());
    await usunPlik(uzytkownik, "porady.pdf");

    await waitFor(() => expect(within(sekcja()).getByText("Ta lekcja nie ma jeszcze plików.")).toBeInTheDocument());
    expect(within(sekcja()).queryByRole("list", { name: "Pliki lekcji" })).toBeNull();
  });

  it("po usunięciu fokus idzie na „Usuń” następnego wiersza; po usunięciu ostatniego — na zdanie licznika", async () => {
    const { uzytkownik } = await renderEkranu();
    await within(sekcja()).findByRole("list", { name: "Pliki lekcji" }, PIERWSZE_ODSZUKANIE);

    await usunPlik(uzytkownik, "porady.pdf");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Usuń plik slajdy.pptx" })));

    await usunPlik(uzytkownik, "mapa.png");
    await waitFor(() => expect(within(sekcja()).getByText("Ta lekcja ma 1 plik.")).toBeInTheDocument());
    const zdanie = within(sekcja()).getByText("Ta lekcja ma 1 plik.").parentElement!;
    expect(document.activeElement).toBe(zdanie);
    expect(document.activeElement).not.toBe(document.body);
  });

  it("odmowa usunięcia: zdanie z nazwą pliku, plik i licznik zostają", async () => {
    const { uzytkownik } = await renderEkranu({
      usuniecie: () => new ApiError({ status: 403, code: "forbidden", message: "This action is unauthorized." }),
    });
    await within(sekcja()).findByRole("list", { name: "Pliki lekcji" }, PIERWSZE_ODSZUKANIE);

    await usunPlik(uzytkownik, "mapa.png");

    expect(
      await within(sekcja()).findByText("Nie usunięto pliku „mapa.png”. Usunięcie pliku nie jest dostępne dla Twojej roli."),
    ).toBeInTheDocument();
    expect(within(sekcja()).queryByText(/unauthorized/i)).toBeNull();
    expect(nazwyNaLiscie()).toEqual(["porady.pdf", "slajdy.pptx", "mapa.png"]);
    expect(within(sekcja()).getByText("Ta lekcja ma 3 pliki.")).toBeInTheDocument();
  });

  it("błąd połączenia przy usuwaniu mówi, którego pliku dotyczy", async () => {
    const { uzytkownik } = await renderEkranu({ usuniecie: () => new Error("Failed to fetch") });
    await within(sekcja()).findByRole("list", { name: "Pliki lekcji" }, PIERWSZE_ODSZUKANIE);

    await usunPlik(uzytkownik, "porady.pdf");

    expect(
      await within(sekcja()).findByText("Nie usunięto pliku „porady.pdf”. Sprawdź połączenie i spróbuj ponownie."),
    ).toBeInTheDocument();
    expect(nazwyNaLiscie()).toHaveLength(3);
  });

  it("plik wgrany, zanim odczyt odpowiedział, nie ginie i nie dubluje się, gdy odczyt już go zawiera", async () => {
    let odpowiedz: (pliki: MaterialAdmin[]) => void = () => undefined;
    const { container, uzytkownik } = await renderEkranu({
      licznikLekcji: 3,
      odczyt: () => new Promise<MaterialAdmin[]>((ok) => (odpowiedz = ok)),
    });

    await wgraj(container, uzytkownik);
    await screen.findByRole("button", { name: "Usuń plik karta.pdf" });
    expect(within(sekcja()).getByText("Ta lekcja ma 4 pliki.")).toBeInTheDocument();

    odpowiedz([...WCZESNIEJSZE, WGRANY]);
    await waitFor(() => expect(nazwyNaLiscie()).toEqual(["porady.pdf", "slajdy.pptx", "mapa.png", "karta.pdf"]));
    expect(within(sekcja()).getByText("Ta lekcja ma 4 pliki.")).toBeInTheDocument();
  });
});

describe("stany ze zdaniem (S4)", () => {
  it("pusta lekcja: „Ta lekcja nie ma jeszcze plików.”, bez listy i bez zdania o wczytywaniu", async () => {
    await renderEkranu({ licznikLekcji: 0, odczyt: () => [] });

    await waitFor(() => expect(within(sekcja()).queryByText("Wczytywanie listy plików…")).toBeNull());
    expect(within(sekcja()).getByText("Ta lekcja nie ma jeszcze plików.")).toBeInTheDocument();
    expect(within(sekcja()).queryByRole("list", { name: "Pliki lekcji" })).toBeNull();
    expect(within(sekcja()).queryByRole("alert")).toBeNull();
  });

  it("błąd odczytu: zdanie bez kodu i trasy, „Spróbuj ponownie” wczytuje listę; licznik z zasobu lekcji", async () => {
    let proby = 0;
    const { uzytkownik } = await renderEkranu({
      odczyt: () => (++proby === 1 ? new ApiError({ status: 500, code: "server_error", message: "SQLSTATE[08006]" }) : WCZESNIEJSZE),
    });

    const alarm = await within(sekcja()).findByRole("alert", undefined, PIERWSZE_ODSZUKANIE);
    expect(alarm).toHaveTextContent("Nie wczytano listy plików");
    expect(alarm).toHaveTextContent(
      "Nie udało się wczytać listy plików. Sprawdź połączenie i spróbuj ponownie. Dodawanie plików działa mimo to.",
    );
    expect(alarm.textContent).not.toMatch(/SQLSTATE|server_error|\/admin|materials|500/);
    expect(within(sekcja()).getByText("Ta lekcja ma 3 pliki.")).toBeInTheDocument();
    expect(within(sekcja()).queryByRole("list", { name: "Pliki lekcji" })).toBeNull();

    await uzytkownik.click(within(alarm).getByRole("button", { name: "Spróbuj ponownie" }));

    await within(sekcja()).findByRole("list", { name: "Pliki lekcji" }, PIERWSZE_ODSZUKANIE);
    expect(nazwyNaLiscie()).toEqual(["porady.pdf", "slajdy.pptx", "mapa.png"]);
    expect(within(sekcja()).queryByRole("alert")).toBeNull();
    expect(odczytyListy()).toHaveLength(2);
  });

  it("błąd odczytu nie blokuje dodawania: plik wgrany mimo błędu stoi na liście, licznik rośnie", async () => {
    const { container, uzytkownik } = await renderEkranu({ odczyt: () => new Error("Failed to fetch") });
    await within(sekcja()).findByRole("alert", undefined, PIERWSZE_ODSZUKANIE);

    await wgraj(container, uzytkownik);

    expect(await within(sekcja()).findByRole("button", { name: "Usuń plik karta.pdf" })).toBeInTheDocument();
    expect(within(sekcja()).getByText("Ta lekcja ma 4 pliki.")).toBeInTheDocument();
    expect(nazwyNaLiscie()).toEqual(["karta.pdf"]);
    expect(within(sekcja()).getByRole("alert")).toBeInTheDocument();
  });

  it("odpowiedź bez listy (zły kształt) to ten sam stan błędu, nie wyjątek", async () => {
    await renderEkranu({ odczyt: () => undefined });

    expect(await within(sekcja()).findByRole("alert", undefined, PIERWSZE_ODSZUKANIE)).toHaveTextContent("Nie wczytano listy plików");
  });

  it("odpowiedź z 200 pozycjami: zdanie, że widać pierwsze 200 plików; z 199 — bez zdania", async () => {
    const plik = (i: number) => material(i, `plik-${i}.pdf`);
    const { unmount } = await renderEkranu({ licznikLekcji: 230, odczyt: () => Array.from({ length: 200 }, (_, i) => plik(i + 1)) });

    expect(await within(sekcja()).findByText("Widać pierwsze 200 plików tej lekcji.", undefined, PIERWSZE_ODSZUKANIE)).toBeInTheDocument();
    expect(within(lista()).getAllByRole("listitem")).toHaveLength(200);
    unmount();

    await renderEkranu({ licznikLekcji: 199, odczyt: () => Array.from({ length: 199 }, (_, i) => plik(i + 1)) });
    await within(sekcja()).findByRole("list", { name: "Pliki lekcji" }, PIERWSZE_ODSZUKANIE);
    expect(within(sekcja()).queryByText(/Widać pierwsze/)).toBeNull();
  });
});

describe("rola bez dostępu do odczytu (S5)", () => {
  it("403 na odczycie: zdanie o roli bez „Spróbuj ponownie”, bez wyjątku w konsoli i bez pustego ekranu; dodawanie działa jak dotąd", async () => {
    const konsola = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { container, uzytkownik } = await renderEkranu({
      odczyt: () => new ApiError({ status: 403, code: "forbidden", message: "This action is unauthorized." }),
    });

    const alarm = await within(sekcja()).findByRole("alert", undefined, PIERWSZE_ODSZUKANIE);
    expect(alarm).toHaveTextContent("Lista plików tej lekcji nie jest dostępna dla Twojej roli.");
    expect(within(alarm).queryByRole("button")).toBeNull();
    expect(within(sekcja()).getByText("Ta lekcja ma 3 pliki.")).toBeInTheDocument();
    expect(container.querySelector('input[type="file"][id$="-plik-materialu"]')).not.toBeNull();

    await wgraj(container, uzytkownik);
    expect(await within(sekcja()).findByRole("button", { name: "Usuń plik karta.pdf" })).toBeInTheDocument();
    expect(konsola).not.toHaveBeenCalled();
  });

  it("403 także przy dodawaniu: odmowa zdaniem w wierszu pliku, jak dotąd", async () => {
    const { container, uzytkownik } = await renderEkranu({
      odczyt: () => new ApiError({ status: 403, code: "forbidden", message: "Brak dostępu do tej akcji." }),
      wgranie: () => new ApiError({ status: 403, code: "forbidden", message: "Brak dostępu do tej akcji." }),
    });
    await within(sekcja()).findByRole("alert", undefined, PIERWSZE_ODSZUKANIE);

    await wgraj(container, uzytkownik);

    expect(await within(sekcja()).findByText("Brak dostępu do tej akcji.", { selector: "[data-stan] *" })).toBeInTheDocument();
    expect(container.querySelector("[data-stan='blad']")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /^Usuń plik karta/ })).toBeNull();
  });
});

describe("wgrany plik widać raz", () => {
  it("po udanym wgraniu dokładnie jeden element z nazwą pliku — wiersz z „Usuń”; ogłoszenie o wgraniu zostaje", async () => {
    const { container, uzytkownik } = await renderEkranu();
    await within(sekcja()).findByRole("list", { name: "Pliki lekcji" }, PIERWSZE_ODSZUKANIE);

    await wgraj(container, uzytkownik);
    await screen.findByRole("button", { name: "Usuń plik karta.pdf" });

    expect(within(sekcja()).getAllByText("karta.pdf")).toHaveLength(1);
    expect(container.querySelector("[data-stan]")).toBeNull();
    const ogloszenie = within(sekcja()).getByRole("status");
    expect(ogloszenie).toHaveTextContent("Wgrano plik „karta.pdf”.");
  });

  it("wgranie trwa: wiersz stanu „Wgrywanie…”, jeszcze bez wiersza „Usuń”", async () => {
    let dokoncz: (material: MaterialAdmin) => void = () => undefined;
    const { container, uzytkownik } = await renderEkranu({ wgranie: () => new Promise<MaterialAdmin>((ok) => (dokoncz = ok)) });
    await within(sekcja()).findByRole("list", { name: "Pliki lekcji" }, PIERWSZE_ODSZUKANIE);

    await wgraj(container, uzytkownik);

    expect(await within(sekcja()).findByText("Wgrywanie…")).toBeInTheDocument();
    expect(container.querySelector("[data-stan='przetwarzanie']")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Usuń plik karta.pdf" })).toBeNull();

    dokoncz(WGRANY);
    await screen.findByRole("button", { name: "Usuń plik karta.pdf" });
    expect(within(sekcja()).getAllByText("karta.pdf")).toHaveLength(1);
  });

  it("błąd wgrania: wiersz stanu z komunikatem, brak wiersza „Usuń”, licznik bez zmian", async () => {
    const { container, uzytkownik } = await renderEkranu({
      wgranie: () =>
        new ApiError({
          status: 422,
          code: "validation_failed",
          message: "Popraw zaznaczone pola.",
          errors: { file: ["Plik może mieć najwyżej 10 MB."] },
        }),
    });
    await within(sekcja()).findByRole("list", { name: "Pliki lekcji" }, PIERWSZE_ODSZUKANIE);

    await wgraj(container, uzytkownik, "duzy.pdf");

    expect(await within(sekcja()).findByText("Plik może mieć najwyżej 10 MB.")).toBeInTheDocument();
    expect(container.querySelector("[data-stan='blad']")).not.toBeNull();
    expect(within(sekcja()).getAllByText("duzy.pdf")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /^Usuń plik duzy/ })).toBeNull();
    expect(within(sekcja()).getByText("Ta lekcja ma 3 pliki.")).toBeInTheDocument();
  });
});
