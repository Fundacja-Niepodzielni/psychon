import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";
import type { CialoLekcji, LekcjaAdmin, MaterialAdmin, StanNagrania, ZlecenieWgrania } from "../dane";

/**
 * Ekran „Lekcja: treść, nagranie, pliki” (administracja): stany bez danych
 * w szablonie formularza, dane w układzie dwóch kolumn — zawsze z jednym
 * `main`; stan zapisu zamiast powiadomienia, zapis treści bez przycinania,
 * licznik znaków, 422 na polu treści, materiały, nagranie dla obu ról
 * administracji, odmowa z powodu roli (403, 0 danych w DOM). Odpowiedź 401
 * w próbie jest błędem podanym wprost przez atrapę funkcji `api`: sprawdza,
 * że ekran i wtedy nie pokazuje danych. W produkcie 401 bez sesji nie dochodzi
 * do ekranu — wspólny klient przenosi wtedy na `/logowanie`.
 * Każda atrapa odpowiedzi serwera ma jawny typ z `../dane`, więc brak albo
 * obcy klucz w atrapie czerwieni `npm run sprawdz-typy`.
 */

const api = vi.fn();
const pobierzJa = vi.fn();
const back = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, refresh: vi.fn(), push, replace: vi.fn() }),
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
const { uchwytWysylania } = await import("@/nowy-front/wysylanie-nagrania/uchwyt");

const LEKCJA: LekcjaAdmin = {
  id: 21,
  course_id: 3,
  title: "Wprowadzenie do wywiadu",
  description: "Krótki opis",
  content: "## Cel lekcji\n\nPierwszy akapit.",
  sequence_order: 1,
  topic_id: 7,
  topic_position: 1,
  video_provider_id: null,
  duration_seconds: 1800,
  materials_count: 2,
  created_at: "2026-09-01T08:00:00Z",
  updated_at: "2026-09-01T08:00:00Z",
};

const INNA_LEKCJA: LekcjaAdmin = { ...LEKCJA, id: 22, title: "Inna lekcja" };

const BRAK_NAGRANIA: StanNagrania = { status: "no_video" };

const GOTOWE_NAGRANIE: StanNagrania = { status: "finished", duration_seconds: 125, preview_embed_url: "https://x.test/e" };

interface Ustawienia {
  rola?: string;
  lekcje?: LekcjaAdmin[];
  nagranie?: StanNagrania;
  patch?: (cialo: CialoLekcji) => LekcjaAdmin;
}

/** Atrapa API: odpowiada na każdą z tras ekranu; reszta tras nie istnieje. */
function ustawApi({ rola = "super_admin", lekcje = [LEKCJA, INNA_LEKCJA], nagranie = BRAK_NAGRANIA, patch }: Ustawienia = {}) {
  pobierzJa.mockResolvedValue({ program_completed_at: null, role: rola });
  api.mockImplementation(async (sciezka: string, opcje?: { method?: string; body?: CialoLekcji }) => {
    const metoda = opcje?.method ?? "GET";
    if (metoda === "GET" && sciezka === "/admin/courses/3/lessons") return lekcje;
    if (metoda === "GET" && sciezka === "/admin/lessons/21/video-status") return nagranie;
    if (metoda === "PATCH" && sciezka === "/admin/lessons/21") {
      const cialo = opcje?.body;
      if (!cialo) throw new Error("Zapis bez ciała");
      return patch ? patch(cialo) : { ...LEKCJA, ...cialo };
    }
    throw new Error(`Nieoczekiwana trasa: ${metoda} ${sciezka}`);
  });
}

function wywolania(metoda: string, sciezka: string) {
  return api.mock.calls.filter(
    ([adres, opcje]) => adres === sciezka && ((opcje as { method?: string } | undefined)?.method ?? "GET") === metoda,
  );
}

async function renderujDane(ustawienia: Ustawienia = {}) {
  ustawApi(ustawienia);
  const wynik = render(<LekcjaEdycja idLekcji={21} idKursu={3} />);
  await screen.findByLabelText(/^Tytuł lekcji/);
  return wynik;
}

function przyciskiGlowne(kontener: HTMLElement): HTMLElement[] {
  return Array.from(kontener.querySelectorAll<HTMLElement>("button")).filter((przycisk) =>
    /primary/.test(przycisk.className),
  );
}

function pole(etykieta: RegExp): HTMLInputElement | HTMLTextAreaElement {
  // Karta „Treść lekcji” i pole treści mają tę samą nazwę (nagłówek karty) — tu chodzi o pole.
  const pola = screen.getAllByLabelText(etykieta).filter((element) => element.matches("input, textarea"));
  expect(pola).toHaveLength(1);
  return pola[0] as HTMLInputElement | HTMLTextAreaElement;
}

function wejsciaPlikow(kontener: HTMLElement): HTMLInputElement[] {
  return Array.from(kontener.querySelectorAll<HTMLInputElement>('input[type="file"]'));
}

function wejscieNagrania(kontener: HTMLElement): HTMLInputElement {
  return kontener.querySelector<HTMLInputElement>('input[type="file"][id$="-nagranie-plik"]')!;
}

function wejscieMaterialu(kontener: HTMLElement): HTMLInputElement {
  return kontener.querySelector<HTMLInputElement>('input[type="file"][id$="-plik-materialu"]')!;
}

/**
 * „Zapisz lekcję” stoi w wąskim pasie i w karcie „Zapis”; na ekranie widać
 * zawsze jeden z nich (zależnie od szerokości okna), w drzewie próby są oba.
 */
function przyciskZapisu(): HTMLElement {
  return screen.getAllByRole("button", { name: "Zapisz lekcję" })[0];
}

function stanZapisu(): HTMLElement {
  return document.querySelector<HTMLElement>('[data-obszar="pasek-waski"] [role="status"]')!;
}

beforeEach(() => {
  api.mockReset();
  pobierzJa.mockReset();
  back.mockReset();
  push.mockReset();
  vi.unstubAllGlobals();
  // Uchwyt wysyłania żyje ponad ekranami — każda próba zaczyna bez wysyłania.
  uchwytWysylania.porzuc(21);
});

describe("stany ekranu: jeden main, dane w układzie dwóch kolumn", () => {
  function szablon(kontener: HTMLElement, styl = "szablon-formularz") {
    expect(() => jedenMain(kontener)).not.toThrow();
    expect(kontener.querySelector("main")?.getAttribute("data-style-id")).toBe(styl);
  }

  it("ładowanie: szablon, jeden main, brak pól", () => {
    api.mockReturnValue(new Promise(() => {}));
    const { container } = render(<LekcjaEdycja idLekcji={21} idKursu={3} />);
    szablon(container);
    expect(screen.queryByLabelText(/^Tytuł lekcji/)).toBeNull();
  });

  it("dane: układ dwóch kolumn, jeden main, pola wypełnione z serwera", async () => {
    const { container } = await renderujDane();
    szablon(container, "szablon-edycja");
    expect(pole(/^Tytuł lekcji/).value).toBe("Wprowadzenie do wywiadu");
    expect(pole(/^Treść lekcji/).value).toBe("## Cel lekcji\n\nPierwszy akapit.");
    expect(pole(/^Czas trwania w minutach/).value).toBe("30");
    expect(screen.getByRole("heading", { level: 1, name: "Wprowadzenie do wywiadu" })).toBeInTheDocument();
  });

  it.each([
    [403, "odmowa roli"],
    [401, "błąd 401 podany przez atrapę klienta (w produkcie 401 bez sesji przenosi na /logowanie)"],
  ])("%i — %s: rola administracji w tekście, zero danych, szablon", async (status) => {
    ustawApi();
    api.mockRejectedValue(new ApiError({ status, code: status === 401 ? "unauthenticated" : "forbidden", message: "x" }));
    const { container } = render(<LekcjaEdycja idLekcji={21} idKursu={3} />);
    await screen.findByText(/administracji/);
    szablon(container);
    expect(screen.queryByLabelText(/^Tytuł lekcji/)).toBeNull();
    expect(screen.queryByText("Wprowadzenie do wywiadu")).toBeNull();
    expect(container.querySelectorAll("textarea, input").length).toBe(0);
    expect(api).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toMatch(/Brak dostępu|Nie masz uprawnień/);
  });

  it("404 z serwera: stan nie znaleziono w szablonie, zero pól", async () => {
    ustawApi();
    api.mockRejectedValue(new ApiError({ status: 404, code: "not_found", message: "x" }));
    const { container } = render(<LekcjaEdycja idLekcji={21} idKursu={3} />);
    await screen.findByText("Nie znaleziono lekcji");
    szablon(container);
    expect(container.querySelectorAll("textarea, input").length).toBe(0);
  });

  it("lekcji nie ma na liście kursu: stan nie znaleziono", async () => {
    ustawApi({ lekcje: [INNA_LEKCJA] });
    const { container } = render(<LekcjaEdycja idLekcji={21} idKursu={3} />);
    await screen.findByText("Nie znaleziono lekcji");
    szablon(container);
  });

  it("adres bez kursu: nie znaleziono bez żadnego wywołania API", () => {
    ustawApi();
    const { container } = render(<LekcjaEdycja idLekcji={21} idKursu={null} />);
    expect(screen.getByText("Nie znaleziono lekcji")).toBeInTheDocument();
    szablon(container);
    expect(api).not.toHaveBeenCalled();
  });

  it("błąd połączenia: Notice z „Spróbuj ponownie”, ponowienie wczytuje dane", async () => {
    const uzytkownik = userEvent.setup();
    ustawApi();
    api.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { container } = render(<LekcjaEdycja idLekcji={21} idKursu={3} />);
    await screen.findByText("Nie udało się wczytać lekcji");
    szablon(container);
    expect(screen.queryByLabelText(/^Tytuł lekcji/)).toBeNull();

    await uzytkownik.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    await screen.findByLabelText(/^Tytuł lekcji/);
    szablon(container, "szablon-edycja");
  });

  it("po zapisie: jeden main, stan zapisu z godziną", async () => {
    const uzytkownik = userEvent.setup();
    const { container } = await renderujDane();
    fireEvent.change(pole(/^Tytuł lekcji/), { target: { value: "Nowy tytuł" } });
    expect(stanZapisu()).toHaveTextContent(/^Niezapisane: tytuł$/);
    await uzytkownik.click(przyciskZapisu());
    await waitFor(() => expect(stanZapisu()).toHaveTextContent(/^Wszystko zapisane · \d\d:\d\d$/));
    szablon(container, "szablon-edycja");
  });

  it("błąd zapisu (422 z polami): szablon, jeden main", async () => {
    const uzytkownik = userEvent.setup();
    const { container } = await renderujDane({
      patch: () => {
        throw new ApiError({
          status: 422,
          code: "validation_failed",
          message: "Popraw zaznaczone pola.",
          errors: { title: ["Tytuł lekcji może mieć najwyżej 255 znaków."] },
        });
      },
    });
    fireEvent.change(pole(/^Tytuł lekcji/), { target: { value: "Nowy tytuł" } });
    await uzytkownik.click(przyciskZapisu());
    await screen.findAllByText("Tytuł lekcji może mieć najwyżej 255 znaków.");
    szablon(container, "szablon-edycja");
  });
});

describe("przycisk główny", () => {
  it("jeden zielony przycisk w wąskim pasie i jeden w karcie „Zapis”; poza nimi żadnego", async () => {
    const { container } = await renderujDane();
    const pas = container.querySelector<HTMLElement>('[data-obszar="pasek-waski"]')!;
    const karta = container.querySelector<HTMLElement>('[data-obszar="tylko-od-dwoch-kolumn"]')!;
    expect(przyciskiGlowne(pas)).toHaveLength(1);
    expect(przyciskiGlowne(karta)).toHaveLength(1);
    const glowne = przyciskiGlowne(container);
    expect(glowne).toHaveLength(2);
    for (const przycisk of glowne) expect(przycisk).toHaveTextContent("Zapisz lekcję");
  });

  it("„Zapisz lekcję” jest czynny także bez zmian; klik bez zmian nie wysyła żądania", async () => {
    const uzytkownik = userEvent.setup();
    await renderujDane();
    expect(przyciskZapisu()).toBeEnabled();
    await uzytkownik.click(przyciskZapisu());
    expect(wywolania("PATCH", "/admin/lessons/21")).toHaveLength(0);
    expect(stanZapisu()).toHaveTextContent(/^Wszystko zapisane$/);
  });

  it("na stronie nie ma „Anuluj” ani dolnego paska zapisu", async () => {
    const { container } = await renderujDane();
    expect(screen.queryByRole("button", { name: "Anuluj" })).toBeNull();
    expect(container.querySelector('[data-obszar="akcje"]')).toBeNull();
  });

  it("w treści strony nadal tylko przyciski zapisu, gdy otwarte jest pytanie o wyjście", async () => {
    const uzytkownik = userEvent.setup();
    const { container } = await renderujDane();
    fireEvent.change(pole(/^Tytuł lekcji/), { target: { value: "Zmieniony tytuł" } });
    await uzytkownik.click(screen.getByRole("link", { name: "← Wróć do kursu" }));
    await screen.findByRole("dialog");
    expect(przyciskiGlowne(container.querySelector("main") as HTMLElement)).toHaveLength(2);
  });
});

describe("stan zapisu", () => {
  it("wymienia zmienione pola w kolejności ekranu; po cofnięciu zmiany wraca „Wszystko zapisane”", async () => {
    await renderujDane();
    expect(stanZapisu()).toHaveTextContent(/^Wszystko zapisane$/);
    fireEvent.change(pole(/^Treść lekcji/), { target: { value: "inna treść" } });
    fireEvent.change(pole(/^Tytuł lekcji/), { target: { value: "Inny tytuł" } });
    expect(stanZapisu()).toHaveTextContent(/^Niezapisane: tytuł, treść$/);
    fireEvent.change(pole(/^Tytuł lekcji/), { target: { value: LEKCJA.title } });
    fireEvent.change(pole(/^Treść lekcji/), { target: { value: LEKCJA.content } });
    expect(stanZapisu()).toHaveTextContent(/^Wszystko zapisane$/);
  });

  it("stan zapisu jest ogłaszany grzecznie w pasie i w karcie „Zapis”", async () => {
    const { container } = await renderujDane();
    const stany = [
      container.querySelector('[data-obszar="pasek-waski"] [role="status"]'),
      container.querySelector('[data-obszar="tylko-od-dwoch-kolumn"] [role="status"]'),
    ];
    for (const stan of stany) expect(stan).toHaveAttribute("aria-live", "polite");
    expect(within(container.querySelector<HTMLElement>('[data-obszar="tylko-od-dwoch-kolumn"]')!).getByText(
      "Nagranie i pliki zapisują się same.",
    )).toBeInTheDocument();
  });

  it("po zapisie i kolejnej zmianie: „Niezapisane: opis · ostatni zapis HH:MM”", async () => {
    const uzytkownik = userEvent.setup();
    await renderujDane();
    fireEvent.change(pole(/^Tytuł lekcji/), { target: { value: "Nowy tytuł" } });
    await uzytkownik.click(przyciskZapisu());
    await waitFor(() => expect(stanZapisu()).toHaveTextContent(/^Wszystko zapisane · \d\d:\d\d$/));
    fireEvent.change(pole(/^Krótki opis/), { target: { value: "Inny opis" } });
    expect(stanZapisu()).toHaveTextContent(/^Niezapisane: opis · ostatni zapis \d\d:\d\d$/);
  });
});

describe("kolejność kart i karta stanu lekcji", () => {
  it("lewa kolumna w kolejności uczestnika, prawa: zapis, stan, usunięcie (zwinięte)", async () => {
    const { container } = await renderujDane();
    const naglowki = (obszar: string) =>
      Array.from(container.querySelectorAll(`[data-obszar="${obszar}"] section[data-karta]`)).map(
        (karta) => document.getElementById(karta.getAttribute("aria-labelledby") ?? "")?.textContent,
      );
    expect(naglowki("glowna")).toEqual(["Tytuł, opis i czas", "Nagranie", "Treść lekcji", "Pliki do tej lekcji"]);
    expect(naglowki("boczna")).toEqual(["Zapis", "Stan lekcji", "Usunięcie lekcji"]);
    const usuniecie = screen.getByRole("button", { name: "Usunięcie lekcji" });
    expect(usuniecie).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Usuń lekcję" })).toBeNull();
  });

  it("stan lekcji liczy z tego, co zapisane: gotowe i wymaga uwagi", async () => {
    await renderujDane({ lekcje: [{ ...LEKCJA, content: null, duration_seconds: 0, materials_count: 0 }] });
    const karta = screen.getByRole("heading", { level: 2, name: "Stan lekcji" }).closest("section")!;
    expect(within(karta).getByText(/lekcja nie ma treści ani nagrania/)).toBeInTheDocument();
    expect(within(karta).getByText(/czas trwania 0 – uczestnik nie ukończy lekcji/)).toBeInTheDocument();
    expect(karta).toHaveTextContent("Gotowe: tytuł, opis.");
  });

  it("usunięcie lekcji: rozwinięcie karty, pytanie, DELETE i przejście do kursu", async () => {
    const uzytkownik = userEvent.setup();
    await renderujDane();
    const dawne = api.getMockImplementation()!;
    api.mockImplementation(async (sciezka: string, opcje?: { method?: string; body?: CialoLekcji }) => {
      if (opcje?.method === "DELETE" && sciezka === "/admin/lessons/21") return { id: 21, deleted: true };
      return dawne(sciezka, opcje);
    });
    await uzytkownik.click(screen.getByRole("button", { name: "Usunięcie lekcji" }));
    await uzytkownik.click(screen.getByRole("button", { name: "Usuń lekcję" }));
    const okno = await screen.findByRole("dialog");
    expect(wywolania("DELETE", "/admin/lessons/21")).toHaveLength(0);
    await uzytkownik.click(within(okno).getByRole("button", { name: "Usuń lekcję" }));
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    expect(wywolania("DELETE", "/admin/lessons/21")).toHaveLength(1);
  });
});

describe("zapis treści lekcji", () => {
  it("PATCH z dokładnie czterema polami; treść bez przycinania; bez pól tematu", async () => {
    const uzytkownik = userEvent.setup();
    await renderujDane();
    const tresc = "  Akapit z twardym łamaniem  \n\n<script>alert(1)</script>  ";
    fireEvent.change(pole(/^Treść lekcji/), { target: { value: tresc } });
    fireEvent.change(pole(/^Krótki opis/), { target: { value: "" } });
    await uzytkownik.click(przyciskZapisu());

    await waitFor(() => expect(wywolania("PATCH", "/admin/lessons/21")).toHaveLength(1));
    const cialo = (wywolania("PATCH", "/admin/lessons/21")[0][1] as { body: Record<string, unknown> }).body;
    expect(cialo).toEqual({
      title: "Wprowadzenie do wywiadu",
      description: null,
      content: tresc,
      duration_seconds: 1800,
    });
    expect(cialo).not.toHaveProperty("topic_id");
    expect(cialo).not.toHaveProperty("topic_position");
    expect(cialo).not.toHaveProperty("sequence_order");
    await waitFor(() => expect(stanZapisu()).toHaveTextContent(/^Wszystko zapisane · /));
  });

  it("zapis zwraca treść z serwera do formularza i do podglądu", async () => {
    const uzytkownik = userEvent.setup();
    await renderujDane({ patch: (cialo) => ({ ...LEKCJA, ...cialo, title: "Tytuł z serwera" }) });
    fireEvent.change(pole(/^Krótki opis/), { target: { value: "Inny opis" } });
    await uzytkownik.click(przyciskZapisu());
    await waitFor(() => expect(stanZapisu()).toHaveTextContent(/^Wszystko zapisane · /));
    expect(pole(/^Tytuł lekcji/).value).toBe("Tytuł z serwera");
    expect(screen.getByRole("heading", { level: 1, name: "Tytuł z serwera" })).toBeInTheDocument();
  });

  it("pusty tytuł: błąd pola bez żadnego zapytania zapisu", async () => {
    const uzytkownik = userEvent.setup();
    await renderujDane();
    fireEvent.change(pole(/^Tytuł lekcji/), { target: { value: "  " } });
    await uzytkownik.click(przyciskZapisu());
    expect((await screen.findAllByText("Podaj tytuł lekcji.")).length).toBeGreaterThan(0);
    expect(wywolania("PATCH", "/admin/lessons/21")).toHaveLength(0);
  });

  it("422 na treści: komunikat pod polem, treść w formularzu zostaje, brak komunikatu o zapisie", async () => {
    const uzytkownik = userEvent.setup();
    await renderujDane({
      patch: () => {
        throw new ApiError({
          status: 422,
          code: "validation_failed",
          message: "Popraw zaznaczone pola.",
          errors: { content: ["Treść lekcji może mieć najwyżej 20 000 znaków."] },
        });
      },
    });
    const za_dluga = "a".repeat(20001);
    fireEvent.change(pole(/^Treść lekcji/), { target: { value: za_dluga } });
    await uzytkownik.click(przyciskZapisu());

    const komunikaty = await screen.findAllByText("Treść lekcji może mieć najwyżej 20 000 znaków.");
    expect(komunikaty.length).toBeGreaterThan(0);
    expect(pole(/^Treść lekcji/).value).toBe(za_dluga);
    expect(stanZapisu()).toHaveTextContent(/^Niezapisane: treść$/);
    expect(pole(/^Treść lekcji/)).toHaveAttribute("aria-invalid", "true");
  });

  it("błąd połączenia przy zapisie: Notice, wpisane zmiany zostają", async () => {
    const uzytkownik = userEvent.setup();
    await renderujDane({
      patch: () => {
        throw new TypeError("Failed to fetch");
      },
    });
    fireEvent.change(pole(/^Tytuł lekcji/), { target: { value: "Nowy tytuł" } });
    await uzytkownik.click(przyciskZapisu());
    await screen.findByText("Lekcja nie została zapisana");
    expect(screen.getByText(/Sprawdź połączenie/)).toBeInTheDocument();
    expect(pole(/^Tytuł lekcji/).value).toBe("Nowy tytuł");
  });

  it("403 przy zapisie: zdanie o roli, zmiany zostają w formularzu", async () => {
    const uzytkownik = userEvent.setup();
    await renderujDane({
      patch: () => {
        throw new ApiError({ status: 403, code: "forbidden", message: "x" });
      },
    });
    fireEvent.change(pole(/^Tytuł lekcji/), { target: { value: "Nowy tytuł" } });
    await uzytkownik.click(przyciskZapisu());
    expect(await screen.findByText(/nie jest dostępny dla Twojej roli/)).toBeInTheDocument();
    expect(pole(/^Tytuł lekcji/).value).toBe("Nowy tytuł");
  });
});

describe("licznik znaków treści", () => {
  it("20 000 znaków wielobajtowych mieści się w limicie (40 000 bajtów)", async () => {
    await renderujDane();
    fireEvent.change(pole(/^Treść lekcji/), { target: { value: "ż".repeat(20000) } });
    expect(screen.getByText(/20 000 z 20 000 znaków$/)).toBeInTheDocument();
    expect(screen.queryByText(/Przekroczono limit/)).toBeNull();
  });

  it("20 001 znaków pokazuje przekroczenie limitu o jeden znak", async () => {
    await renderujDane();
    fireEvent.change(pole(/^Treść lekcji/), { target: { value: "ż".repeat(20001) } });
    expect(screen.getByText(/Przekroczono limit o 1 znak \(limit: 20 000\)\./)).toBeInTheDocument();
  });

  it("licznik rośnie razem z wpisywanym tekstem", async () => {
    await renderujDane({ lekcje: [{ ...LEKCJA, content: null }] });
    expect(screen.getByText(/^0 z 20 000 znaków$/)).toBeInTheDocument();
    fireEvent.change(pole(/^Treść lekcji/), { target: { value: "abcde" } });
    expect(screen.getByText(/^5 z 20 000 znaków$/)).toBeInTheDocument();
  });
});

describe("podgląd treści", () => {
  it("podgląd renderuje Markdown jako nagłówek i akapit", async () => {
    await renderujDane();
    const podglad = screen.getByRole("region", { name: "Podgląd treści" });
    expect(within(podglad).getByRole("heading", { name: "Cel lekcji" })).toBeInTheDocument();
    expect(within(podglad).getByText("Pierwszy akapit.")).toBeInTheDocument();
  });

  it("HTML w treści jest tekstem, nie elementem", async () => {
    await renderujDane();
    fireEvent.change(pole(/^Treść lekcji/), { target: { value: '<img src=x onerror="alert(1)"> <script>x</script>' } });
    const podglad = screen.getByRole("region", { name: "Podgląd treści" });
    expect(podglad.querySelector("img")).toBeNull();
    expect(podglad.querySelector("script")).toBeNull();
    expect(podglad.textContent).toContain("<script>x</script>");
  });

  it("pusta treść: zdanie zamiast podglądu", async () => {
    await renderujDane({ lekcje: [{ ...LEKCJA, content: null }] });
    const podglad = screen.getByRole("region", { name: "Podgląd treści" });
    expect(within(podglad).getByText(/Treść lekcji jest pusta/)).toBeInTheDocument();
  });
});

describe("pliki lekcji", () => {
  it("wgranie pliku: multipart z polem file, licznik rośnie, wiersz pliku gotowy", async () => {
    const uzytkownik = userEvent.setup();
    const { container } = await renderujDane();
    expect(screen.getByText("Ta lekcja ma 2 pliki.")).toBeInTheDocument();
    const wgrany: MaterialAdmin = {
      id: 9,
      name: "karta.pdf",
      mime: "application/pdf",
      size: 4,
      lesson_id: 21,
      course_id: null,
      created_at: null,
    };
    api.mockImplementation(async (sciezka: string, opcje?: { method?: string }) => {
      if (sciezka === "/admin/lessons/21/materials" && opcje?.method === "POST") return wgrany;
      throw new Error(`Nieoczekiwana trasa: ${sciezka}`);
    });
    const plik = new File(["%PDF"], "karta.pdf", { type: "application/pdf" });
    await uzytkownik.upload(wejscieMaterialu(container), plik);

    await screen.findByText("Wgrano plik „karta.pdf”.");
    const wywolanie = wywolania("POST", "/admin/lessons/21/materials")[0];
    const cialo = (wywolanie[1] as { body: FormData }).body;
    expect(cialo).toBeInstanceOf(FormData);
    expect((cialo.get("file") as File).name).toBe("karta.pdf");
    expect(screen.getByText("Ta lekcja ma 3 pliki.")).toBeInTheDocument();
    const lista = screen.getByRole("list", { name: "Pliki dodane teraz" });
    expect(within(lista).getByText("PDF · 4 B")).toBeInTheDocument();
    expect(within(lista).getByRole("button", { name: "Usuń plik karta.pdf" })).toBeInTheDocument();
    expect(
      screen.getByText("Uczestnik zobaczy te pliki w tej lekcji, pod treścią, oraz na stronie kursu."),
    ).toBeInTheDocument();
  });

  it("422 na pliku: komunikat serwera w wierszu pliku, licznik bez zmian", async () => {
    const uzytkownik = userEvent.setup();
    const { container } = await renderujDane();
    api.mockRejectedValue(
      new ApiError({
        status: 422,
        code: "validation_failed",
        message: "Popraw zaznaczone pola.",
        errors: { file: ["Plik może mieć najwyżej 10 MB."] },
      }),
    );
    await uzytkownik.upload(wejscieMaterialu(container), new File(["x"], "duzy.pdf", { type: "application/pdf" }));
    expect(await screen.findByText("Plik może mieć najwyżej 10 MB.")).toBeInTheDocument();
    expect(screen.getByText("Ta lekcja ma 2 pliki.")).toBeInTheDocument();
  });
});

describe("nagranie", () => {
  it("Super Admin: obszar upuszczania nagrania jest aktywny, opiekun projektu widzi powód", async () => {
    const administrator = await renderujDane({ rola: "super_admin" });
    expect(wejsciaPlikow(administrator.container)).toHaveLength(2);
    expect(screen.queryByText(/tylko Super Admin/)).toBeNull();
    administrator.unmount();

    const opiekun = await renderujDane({ rola: "project_manager" });
    expect(wejsciaPlikow(opiekun.container)).toHaveLength(1);
    expect(screen.getByText(/Nagranie może wgrać tylko Super Admin/)).toBeInTheDocument();
  });

  it("opiekun projektu: stan nagrania z serwera widoczny, wgrywania brak", async () => {
    await renderujDane({
      rola: "project_manager",
      nagranie: GOTOWE_NAGRANIE,
    });
    expect(screen.getByText("Nagranie jest gotowe. Czas trwania: 2 min 5 s.")).toBeInTheDocument();
  });

  it("Super Admin: zlecenie wgrania z samym tytułem, potem wysyłka do dostawcy", async () => {
    const uzytkownik = userEvent.setup();
    const { container } = await renderujDane({ rola: "super_admin" });
    const zlecenie: ZlecenieWgrania = {
      video_id: "vid-1",
      upload_url: "https://video.test/tusupload",
      library_id: "77",
      expiration_time: 1790000000,
      signature: "sig",
    };
    const ponowny: StanNagrania = { status: "processing", duration_seconds: 0, preview_embed_url: "https://x.test/e" };
    api.mockImplementation(async (sciezka: string, opcje?: { method?: string }) => {
      if (sciezka === "/admin/lessons/21/video-uploads" && opcje?.method === "POST") return zlecenie;
      if (sciezka === "/admin/lessons/21/video-status") return ponowny;
      throw new Error(`Nieoczekiwana trasa: ${sciezka}`);
    });
    const dostawca = vi.fn(async (_adres: string, opcje: { method: string }) =>
      opcje.method === "POST"
        ? new Response(null, { status: 201, headers: { Location: "https://video.test/tusupload/abc" } })
        : new Response(null, { status: 204, headers: { "Upload-Offset": "5" } }),
    );
    vi.stubGlobal("fetch", dostawca);

    await uzytkownik.upload(wejscieNagrania(container), new File(["12345"], "nagranie.mp4", { type: "video/mp4" }));

    await waitFor(() => expect(container.querySelector('[data-stan-nagrania="przetwarzanie"]')).not.toBeNull());
    const wywolanie = wywolania("POST", "/admin/lessons/21/video-uploads")[0];
    expect((wywolanie[1] as { body: unknown }).body).toEqual({ title: "Wprowadzenie do wywiadu" });
    expect(dostawca).toHaveBeenCalledTimes(2);
    const karta = screen.getByRole("heading", { level: 2, name: "Nagranie" }).closest("section")!;
    expect(within(karta).getByText("Możesz wszystko zamknąć – nagranie przetworzy się samo.")).toBeInTheDocument();
    expect(within(karta).queryByRole("progressbar")).toBeNull();
    expect(screen.getByText(/nagranie się przetwarza/)).toBeInTheDocument();
  });

  it("plik, który nie jest wideo: błąd w wierszu, zero zapytań o wgranie", async () => {
    const uzytkownik = userEvent.setup();
    const { container } = await renderujDane({ rola: "super_admin" });
    await uzytkownik.upload(wejscieNagrania(container), new File(["x"], "notatki.pdf", { type: "application/pdf" }));
    expect(await screen.findByText("Wybierz plik wideo.")).toBeInTheDocument();
    expect(wywolania("POST", "/admin/lessons/21/video-uploads")).toHaveLength(0);
  });

  it("odmowa 403 przy zleceniu wgrania: komunikat w wierszu pliku", async () => {
    const uzytkownik = userEvent.setup();
    const { container } = await renderujDane({ rola: "super_admin" });
    api.mockRejectedValue(new ApiError({ status: 403, code: "forbidden", message: "Nie masz dostępu do tej sekcji." }));
    await uzytkownik.upload(wejscieNagrania(container), new File(["x"], "n.mp4", { type: "video/mp4" }));
    expect(await screen.findByText("Nie masz dostępu do tej sekcji.")).toBeInTheDocument();
    expect(container.querySelector('[data-stan-nagrania="brak"]')).not.toBeNull();
  });

  it("błąd odczytu stanu nagrania nie blokuje edycji tekstu", async () => {
    ustawApi();
    const dawne = api.getMockImplementation()!;
    api.mockImplementation(async (sciezka: string, opcje?: { method?: string; body?: unknown }) => {
      if (sciezka === "/admin/lessons/21/video-status") {
        throw new ApiError({ status: 503, code: "video_not_configured", message: "x" });
      }
      return dawne(sciezka, opcje);
    });
    render(<LekcjaEdycja idLekcji={21} idKursu={3} />);
    await screen.findByLabelText(/^Tytuł lekcji/);
    expect(screen.getByText("Nie udało się sprawdzić stanu nagrania.")).toBeInTheDocument();
  });
});

describe("nagranie: wysyłanie i przerwanie", () => {
  const ZLECENIE: ZlecenieWgrania = {
    video_id: "vid-1",
    upload_url: "https://video.test/tusupload",
    library_id: "77",
    expiration_time: 1790000000,
    signature: ["pod", "pis"].join(""),
  };

  async function zacznijWysylanie() {
    const uzytkownik = userEvent.setup();
    const { container, unmount } = await renderujDane({ rola: "super_admin" });
    const dawne = api.getMockImplementation()!;
    api.mockImplementation(async (sciezka: string, opcje?: { method?: string; body?: CialoLekcji }) => {
      if (sciezka === "/admin/lessons/21/video-uploads" && opcje?.method === "POST") return ZLECENIE;
      return dawne(sciezka, opcje);
    });
    // Dostawca przyjmuje utworzenie wgrania, a kawałek pliku wisi do przerwania.
    const dostawca = vi.fn(
      (_adres: string, opcje: { method: string; signal?: AbortSignal }) =>
        new Promise<Response>((ok, blad) => {
          if (opcje.method === "POST") {
            ok(new Response(null, { status: 201, headers: { Location: "https://video.test/tusupload/abc" } }));
            return;
          }
          opcje.signal?.addEventListener("abort", () => blad(new DOMException("Przerwano", "AbortError")));
        }),
    );
    vi.stubGlobal("fetch", dostawca);
    await uzytkownik.upload(wejscieNagrania(container), new File(["12345"], "nagranie.mp4", { type: "video/mp4" }));
    await waitFor(() => expect(dostawca).toHaveBeenCalledTimes(2));
    return { uzytkownik, container, unmount };
  }

  it("w trakcie: nazwa pliku, etapy, pasek postępu, zdanie o karcie przeglądarki; stan lekcji czeka", async () => {
    const { container } = await zacznijWysylanie();
    const karta = container.querySelector<HTMLElement>('[data-stan-nagrania="wysylanie"]')!;
    expect(within(karta).getByText("nagranie.mp4")).toBeInTheDocument();
    expect(within(karta).getByRole("progressbar")).toBeInTheDocument();
    expect(within(karta).getByText("1. Wysyłanie (teraz)")).toHaveAttribute("aria-current", "step");
    expect(karta).toHaveTextContent("Nie zamykaj karty przeglądarki do końca wysyłania.");
    expect(karta.textContent).not.toMatch(/stron/);
    expect(screen.getByText(/nagranie się wysyła/)).toBeInTheDocument();
  });

  it("zamknięcie karty przeglądarki pyta także w trakcie wysyłania, bez niezapisanego tekstu", async () => {
    await zacznijWysylanie();
    const zdarzenie = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(zdarzenie);
    expect(zdarzenie.defaultPrevented).toBe(true);
  });

  it("zdanie o przejściu do kursu i innych lekcji zamiast prośby o zostanie w lekcji", async () => {
    const { container } = await zacznijWysylanie();
    const karta = container.querySelector<HTMLElement>('[data-stan-nagrania="wysylanie"]')!;
    expect(
      within(karta).getByText("Możesz przejść do kursu i innych lekcji – wysyłanie trwa dalej, a postęp widać na liście lekcji."),
    ).toBeInTheDocument();
    expect(karta.textContent).not.toMatch(/Zostań w tej lekcji/);
  });

  it("odmontowanie ekranu lekcji nie przerywa wysyłania; po powrocie karta pokazuje to samo wysyłanie", async () => {
    const { container, unmount } = await zacznijWysylanie();
    expect(container.querySelector('[data-stan-nagrania="wysylanie"]')).not.toBeNull();
    unmount();
    expect(uchwytWysylania.stan().rodzaj).toBe("wysylanie");

    const ponownie = render(<LekcjaEdycja idLekcji={21} idKursu={3} />);
    await screen.findByLabelText(/^Tytuł lekcji/);
    const karta = ponownie.container.querySelector<HTMLElement>('[data-stan-nagrania="wysylanie"]')!;
    expect(within(karta).getByText("nagranie.mp4")).toBeInTheDocument();
  });

  it("„Przerwij wysyłanie”: stan przerwany ze zdaniem i wyborem tego samego pliku; stan lekcji wymaga uwagi", async () => {
    const { uzytkownik, container } = await zacznijWysylanie();
    await uzytkownik.click(screen.getByRole("button", { name: "Przerwij wysyłanie" }));
    await waitFor(() => expect(container.querySelector('[data-stan-nagrania="przerwane"]')).not.toBeNull());
    const karta = container.querySelector<HTMLElement>('[data-stan-nagrania="przerwane"]')!;
    expect(within(karta).getByText(/^Wysyłanie stanęło przy 0/)).toBeInTheDocument();
    expect(within(karta).getByText("Wybierz plik, żeby dokończyć")).toBeInTheDocument();
    expect(within(karta).getByRole("button", { name: "Wyślij inny plik od nowa" })).toBeInTheDocument();
    expect(screen.getByText(/wysyłanie nagrania przerwane/)).toBeInTheDocument();
  });

  it("po przerwaniu inny plik: „To nie jest ten sam plik”, zero nowych pozwoleń", async () => {
    const { uzytkownik, container } = await zacznijWysylanie();
    await uzytkownik.click(screen.getByRole("button", { name: "Przerwij wysyłanie" }));
    await waitFor(() => expect(container.querySelector('[data-stan-nagrania="przerwane"]')).not.toBeNull());
    const zlecen = wywolania("POST", "/admin/lessons/21/video-uploads").length;
    await uzytkownik.upload(wejscieNagrania(container), new File(["inna treść"], "inne.mp4", { type: "video/mp4" }));
    expect(await screen.findByText("To nie jest ten sam plik")).toBeInTheDocument();
    expect(wywolania("POST", "/admin/lessons/21/video-uploads")).toHaveLength(zlecen);
  });
});

describe("góra strony: powrót i sąsiednie lekcje", () => {
  const TRZECIA: LekcjaAdmin = { ...LEKCJA, id: 23, title: "Trzecia lekcja", sequence_order: 3 };
  const DRUGA: LekcjaAdmin = { ...INNA_LEKCJA, sequence_order: 2 };

  it("pierwsza lekcja: „Poprzednia” nieczynna, „Następna” prowadzi do kolejnej z jej tytułem w nazwie", async () => {
    await renderujDane({ lekcje: [TRZECIA, LEKCJA, DRUGA] });
    const nawigacja = screen.getByRole("navigation", { name: "Nawigacja lekcji" });
    const poprzednia = within(nawigacja).getByRole("link", { name: "Poprzednia lekcja: brak, to pierwsza lekcja kursu" });
    expect(poprzednia).toHaveAttribute("aria-disabled", "true");
    expect(poprzednia).not.toHaveAttribute("href");
    const nastepna = within(nawigacja).getByRole("link", { name: "Następna lekcja: Inna lekcja" });
    expect(nastepna.getAttribute("href")).toMatch(/22/);
    expect(nastepna).toHaveTextContent(/^Następna lekcja$/);
    expect(screen.getByText("lekcja 1 z 3")).toBeInTheDocument();
  });

  it("jedyna lekcja kursu: oba odnośniki nieczynne, klik nigdzie nie prowadzi", async () => {
    const uzytkownik = userEvent.setup();
    await renderujDane({ lekcje: [LEKCJA] });
    const nawigacja = screen.getByRole("navigation", { name: "Nawigacja lekcji" });
    const nastepna = within(nawigacja).getByRole("link", { name: "Następna lekcja: brak, to ostatnia lekcja kursu" });
    expect(nastepna).toHaveAttribute("aria-disabled", "true");
    await uzytkownik.click(nastepna);
    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("lekcja 1 z 1")).toBeInTheDocument();
  });

  it("bez zmian „Następna lekcja” przechodzi od razu, bez pytania", async () => {
    const uzytkownik = userEvent.setup();
    await renderujDane();
    const nastepna = screen.getByRole("link", { name: "Następna lekcja: Inna lekcja" });
    await uzytkownik.click(nastepna);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(nastepna.getAttribute("href"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("wyjście z niezapisanym tekstem", () => {
  async function otworzPytanie(nazwaOdnosnika: string, ustawienia: Ustawienia = {}) {
    const uzytkownik = userEvent.setup();
    await renderujDane(ustawienia);
    fireEvent.change(pole(/^Treść lekcji/), { target: { value: "coś innego" } });
    const odnosnik = screen.getByRole("link", { name: nazwaOdnosnika });
    await uzytkownik.click(odnosnik);
    const okno = await screen.findByRole("dialog", { name: "Zapisać zmiany przed przejściem?" });
    return { uzytkownik, odnosnik, okno };
  }

  it("bez zmian „← Wróć do kursu” przechodzi od razu", async () => {
    const uzytkownik = userEvent.setup();
    await renderujDane();
    const odnosnik = screen.getByRole("link", { name: "← Wróć do kursu" });
    await uzytkownik.click(odnosnik);
    expect(push).toHaveBeenCalledWith(odnosnik.getAttribute("href"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("pytanie ma trzy przyciski, fokus stoi na „Zostań”, okno nazywa niezapisane pola", async () => {
    const { okno } = await otworzPytanie("← Wróć do kursu");
    expect(within(okno).getAllByRole("button").map((przycisk) => przycisk.textContent).sort()).toEqual(
      ["Przejdź bez zapisu", "Zapisz i przejdź", "Zostań"],
    );
    expect(within(okno).getByRole("button", { name: "Zostań" })).toHaveFocus();
    expect(within(okno).getByText(/Niezapisane: treść\./)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("„Zostań”: okno znika, nic nie idzie do serwera, fokus wraca na odnośnik, tekst zostaje", async () => {
    const { uzytkownik, odnosnik, okno } = await otworzPytanie("Następna lekcja: Inna lekcja");
    await uzytkownik.click(within(okno).getByRole("button", { name: "Zostań" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(push).not.toHaveBeenCalled();
    expect(wywolania("PATCH", "/admin/lessons/21")).toHaveLength(0);
    expect(odnosnik).toHaveFocus();
    expect(pole(/^Treść lekcji/).value).toBe("coś innego");
  });

  it("klawisz Escape działa jak „Zostań”", async () => {
    const { uzytkownik, odnosnik } = await otworzPytanie("← Wróć do kursu");
    await uzytkownik.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(push).not.toHaveBeenCalled();
    expect(odnosnik).toHaveFocus();
  });

  it("„Przejdź bez zapisu”: przejście pod adres odnośnika, zero zapisu", async () => {
    const { uzytkownik, odnosnik, okno } = await otworzPytanie("← Wróć do kursu");
    await uzytkownik.click(within(okno).getByRole("button", { name: "Przejdź bez zapisu" }));
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(odnosnik.getAttribute("href"));
    expect(wywolania("PATCH", "/admin/lessons/21")).toHaveLength(0);
  });

  it("„Zapisz i przejdź”: jeden zapis, potem przejście pod adres odnośnika", async () => {
    const { uzytkownik, odnosnik, okno } = await otworzPytanie("Następna lekcja: Inna lekcja");
    await uzytkownik.click(within(okno).getByRole("button", { name: "Zapisz i przejdź" }));
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    expect(push).toHaveBeenCalledWith(odnosnik.getAttribute("href"));
    const zapisy = wywolania("PATCH", "/admin/lessons/21");
    expect(zapisy).toHaveLength(1);
    expect((zapisy[0][1] as { body: CialoLekcji }).body.content).toBe("coś innego");
  });

  it("„Zapisz i przejdź” przy błędzie zapisu: zostaje na stronie, pokazuje błąd, tekst zostaje", async () => {
    const { uzytkownik, okno } = await otworzPytanie("← Wróć do kursu", {
      patch: () => {
        throw new TypeError("Failed to fetch");
      },
    });
    await uzytkownik.click(within(okno).getByRole("button", { name: "Zapisz i przejdź" }));
    await screen.findByText("Lekcja nie została zapisana");
    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(pole(/^Treść lekcji/).value).toBe("coś innego");
    expect(stanZapisu()).toHaveTextContent(/^Niezapisane: treść$/);
  });

  it("„Zapisz i przejdź” przy błędzie pola: zostaje, błąd pod polem, fokus w polu z błędem", async () => {
    const { uzytkownik, okno } = await otworzPytanie("← Wróć do kursu", {
      patch: () => {
        throw new ApiError({
          status: 422,
          code: "validation_failed",
          message: "Popraw zaznaczone pola.",
          errors: { content: ["Treść lekcji może mieć najwyżej 20 000 znaków."] },
        });
      },
    });
    await uzytkownik.click(within(okno).getByRole("button", { name: "Zapisz i przejdź" }));
    await screen.findAllByText("Treść lekcji może mieć najwyżej 20 000 znaków.");
    expect(push).not.toHaveBeenCalled();
    await waitFor(() => expect(pole(/^Treść lekcji/)).toHaveFocus());
  });

  it("zamknięcie karty przeglądarki: pyta tylko przy niezapisanym tekście", async () => {
    await renderujDane();
    const bezZmian = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(bezZmian);
    expect(bezZmian.defaultPrevented).toBe(false);

    fireEvent.change(pole(/^Tytuł lekcji/), { target: { value: "Zmieniony" } });
    const zeZmiana = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(zeZmiana);
    expect(zeZmiana.defaultPrevented).toBe(true);
  });
});

describe("trasy ekranu", () => {
  it("odczyt tylko listy lekcji kursu, roli i stanu nagrania; bez tras tematów", async () => {
    await renderujDane();
    const adresy = api.mock.calls.map(([adres, opcje]) => `${(opcje as { method?: string } | undefined)?.method ?? "GET"} ${adres}`);
    expect(adresy.sort()).toEqual(["GET /admin/courses/3/lessons", "GET /admin/lessons/21/video-status"]);
    expect(pobierzJa).toHaveBeenCalledTimes(1);
  });
});
