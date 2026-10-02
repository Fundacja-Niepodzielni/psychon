import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AdminCourse } from "@/lib/h08/types";
import type { LekcjaAdmin } from "@/nowy-front/lekcja-edycja/dane";
import {
  BEZ_NAGRANIA,
  KURS,
  lekcja,
  lekcjaZeStanem,
  temat,
  utworzSerwer,
  type AtrapaSerwera,
} from "./atrapa-serwera";

/**
 * Ekran kursu czyta stan nagrania lekcji i braki publikacji z serwera
 * (`video_status`, `video_ready`, `video_pending`, `publication_gaps`,
 * `reason.items`) i pyta o stan nagrania ponownie tylko dla nagrań w drodze.
 * Atrapa stoi na funkcjach `api`/`apiPaged` wspólnego klienta, więc próba
 * liczy prawdziwe żądania ekranu.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

// Stan wysyłania nagrania z tej przeglądarki podaje próba; `null` = nic się nie wysyła.
type StanUchwytu = { rodzaj: string; lekcja: { id: number; tytul: string; adres: string } } & Record<string, unknown>;
const wysylanie = vi.hoisted(() => ({ stan: null as null | StanUchwytu }));
vi.mock("@/nowy-front/wysylanie-nagrania/useWysylanie", () => ({
  useWysylanie: () => wysylanie.stan ?? { rodzaj: "brak" },
  useWysylanieLekcji: (idLekcji: number) =>
    wysylanie.stan !== null && wysylanie.stan.lekcja.id === idLekcji ? wysylanie.stan : null,
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
const { ODSTEP_PYTAN_MS } = await import("../odswiezanie-nagran");

const ADRES_STANU = (id: number) => `/admin/lessons/${id}/video-status`;
const W_DRODZE = { video_ready: false, video_pending: false };

function pytaniaOStan(): string[] {
  return serwer.wywolania.map((w) => w.sciezka).filter((sciezka) => sciezka.endsWith("/video-status"));
}

function odczytyKursu(): number {
  return serwer.wywolania.filter((w) => w.metoda === "GET" && w.sciezka === "/admin/courses/4").length;
}

function ogloszenie(): string {
  return document.querySelector("[data-ogloszenia]")?.textContent ?? "";
}

function wiersz(id: number): HTMLElement {
  return document.querySelector(`li[data-lekcja="${id}"]`) as HTMLElement;
}

function stanWiersza(id: number): string {
  return wiersz(id).querySelector("[data-stan-lekcji]")?.textContent ?? "";
}

function karta(): HTMLElement {
  return screen.getByRole("region", { name: "Publikacja" });
}

async function renderEkranu() {
  const wynik = render(<KursAdministracji idKursu="4" />);
  await screen.findByRole("heading", { level: 2, name: "Tematy i lekcje" });
  await waitFor(() => expect(serwer.wywolania.some((w) => w.sciezka === "/admin/courses/4/tests")).toBe(true));
  return wynik;
}

/** Upływ czasu próbnego razem z odpowiedziami, które w tym czasie wracają. */
async function minelo(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function ustawWidocznosc(stan: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => stan });
  document.dispatchEvent(new Event("visibilitychange"));
}

/** Kurs z czterema lekcjami: gotowa, pusta, z błędem nagrania i z nagraniem w przetwarzaniu. */
const LEKCJE_Z_BRAKAMI = [
  lekcjaZeStanem(21, "Lekcja A"),
  lekcjaZeStanem(22, "Lekcja B", BEZ_NAGRANIA),
  lekcjaZeStanem(23, "Lekcja C", { ...W_DRODZE, video_status: "error" }),
  lekcjaZeStanem(24, "Lekcja D", { ...W_DRODZE, video_status: "processing" }),
];
const TEMATY_Z_BRAKAMI = [temat(7, "Wprowadzenie", 1, [21, 22]), temat(8, "Praktyka", 2, [23, 24])];
const BRAKI = {
  blocking: [
    { code: "lesson_empty", lesson_id: 22 },
    { code: "recording_error", lesson_id: 23 },
  ],
  waiting: [{ code: "recording_in_progress", lesson_id: 24 }],
};
const KURS_Z_BRAKAMI: AdminCourse = { ...KURS, publication_gaps: BRAKI };

const LEKCJE_GOTOWE = [lekcjaZeStanem(21, "Lekcja A"), lekcjaZeStanem(22, "Lekcja B"), lekcjaZeStanem(23, "Lekcja C")];
const KURS_GOTOWY: AdminCourse = { ...KURS, publication_gaps: { blocking: [], waiting: [] } };

beforeEach(() => {
  serwer = utworzSerwer();
  wysylanie.stan = null;
});

afterEach(() => {
  vi.useRealTimers();
  // Własność z próby znika; zostaje ta z prototypu dokumentu.
  delete (document as unknown as Record<string, unknown>).visibilityState;
});

describe("ekran kursu — liczba żądań przy wejściu", () => {
  const DZIESIEC = Array.from({ length: 10 }, (_, indeks) => lekcjaZeStanem(41 + indeks, `Lekcja ${indeks + 1}`));
  const TEMAT_DZIESIECIU = [temat(7, "Wprowadzenie", 1, DZIESIEC.map((wpis) => wpis.id))];

  it("10 lekcji z gotowym nagraniem: zero pytań o stan nagrania, pięć żądań ekranu", async () => {
    serwer = utworzSerwer({ lekcje: DZIESIEC, tematy: TEMAT_DZIESIECIU });
    await renderEkranu();
    await act(async () => {
      await Promise.resolve();
    });
    expect(pytaniaOStan()).toEqual([]);
    expect(serwer.wywolania.map((w) => `${w.metoda} ${w.sciezka}`).sort()).toEqual([
      "GET /admin/courses/4",
      "GET /admin/courses/4/assignments",
      "GET /admin/courses/4/lessons",
      "GET /admin/courses/4/tests",
      "GET /admin/courses/4/topics",
    ]);
  });

  it("10 lekcji, dwie z nagraniem w drodze: dwa pytania o stan — tylko o te dwie", async () => {
    const lekcje = DZIESIEC.map((wpis, indeks) =>
      indeks === 2 || indeks === 7 ? { ...wpis, ...W_DRODZE, video_status: "processing" as const } : wpis,
    );
    serwer = utworzSerwer({
      lekcje,
      tematy: TEMAT_DZIESIECIU,
      nagrania: {
        43: { status: "processing", video_status: "processing", ...W_DRODZE },
        48: { status: "processing", video_status: "processing", ...W_DRODZE },
      },
    });
    await renderEkranu();
    await waitFor(() => expect(pytaniaOStan()).toHaveLength(2));
    expect(pytaniaOStan().sort()).toEqual([ADRES_STANU(43), ADRES_STANU(48)]);
  });

  it("odpowiedź starszego serwera (lekcje bez pól stanu): jak dotąd, jedno pytanie na lekcję z nagraniem", async () => {
    serwer = utworzSerwer({
      lekcje: [lekcja(21, "Lekcja A"), { ...lekcja(22, "Lekcja B"), video_provider_id: null }, lekcja(23, "Lekcja C")],
      nagrania: { 23: "error" },
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await renderEkranu();
    await waitFor(() => expect(stanWiersza(23)).toBe("Nagranie: błąd"));
    expect(stanWiersza(22)).toBe("Brak nagrania i treści");
    expect(pytaniaOStan().sort()).toEqual([ADRES_STANU(21), ADRES_STANU(23)]);
    expect(within(karta()).getByRole("heading", { level: 3, name: "Do zrobienia (2)" })).toBeInTheDocument();

    await minelo(4 * ODSTEP_PYTAN_MS);
    expect(pytaniaOStan()).toHaveLength(2);
  });
});

describe("ekran kursu — wiersz lekcji ze stanu serwera", () => {
  it("każdy stan słowem; gotowa z nowym nagraniem ma cichy dopisek; nieustalony jak gotowa", async () => {
    serwer = utworzSerwer({
      kurs: KURS_Z_BRAKAMI,
      lekcje: [
        ...LEKCJE_Z_BRAKAMI,
        lekcjaZeStanem(25, "Lekcja E", { ...W_DRODZE, video_status: "uploading" }),
        lekcjaZeStanem(26, "Lekcja F", { video_status: "processing", video_ready: true, video_pending: true }),
        lekcjaZeStanem(27, "Lekcja G", { video_status: "error", video_ready: true, video_pending: false }),
        lekcjaZeStanem(28, "Lekcja H", { video_status: null, video_status_at: null }),
        lekcjaZeStanem(29, "Lekcja I", { ...BEZ_NAGRANIA, content: "## Treść" }),
      ],
      tematy: [temat(7, "Wprowadzenie", 1, [21, 22, 23, 24, 25, 26, 27, 28, 29])],
      // Odpowiedzi na pytania o nagrania w drodze: stan bez zmian.
      nagrania: {
        24: { status: "processing", ...W_DRODZE, video_status: "processing" },
        25: { status: "processing", ...W_DRODZE, video_status: "uploading" },
        26: { status: "processing", video_status: "processing", video_ready: true, video_pending: true },
      },
    });
    await renderEkranu();
    await waitFor(() => expect(pytaniaOStan()).toHaveLength(3));
    expect([21, 22, 23, 24, 25, 26, 27, 28, 29].map(stanWiersza)).toEqual([
      "Gotowa",
      "Brak nagrania i treści",
      "Nagranie: błąd",
      "Nagranie: przetwarzanie",
      "Nagranie: wysyłanie",
      "Gotowanowe nagranie w drodze",
      "Gotowanowe nagranie: błąd",
      "Gotowa",
      "Gotowa",
    ]);
    expect(wiersz(26).querySelector("[data-dopisek-stanu]")).toHaveTextContent("nowe nagranie w drodze");
    expect(wiersz(27).querySelector("[data-dopisek-stanu]")).toHaveTextContent("nowe nagranie: błąd");
    expect(document.querySelectorAll("[data-dopisek-stanu]")).toHaveLength(2);
  });

  it("zwinięty temat liczy lekcje wymagające uwagi ze stanu serwera; czekanie i nowe nagranie nimi nie są", async () => {
    serwer = utworzSerwer({ kurs: KURS_Z_BRAKAMI, lekcje: LEKCJE_Z_BRAKAMI, tematy: TEMATY_Z_BRAKAMI });
    await renderEkranu();
    await userEvent.click(screen.getByRole("button", { name: "Zwiń temat Wprowadzenie" }));
    await userEvent.click(screen.getByRole("button", { name: "Zwiń temat Praktyka" }));
    const plakietki = screen.getAllByText("1 lekcja wymaga uwagi");
    expect(plakietki).toHaveLength(2);
  });
});

describe("ekran kursu — karta „Publikacja” z braków serwera", () => {
  it("szkic z brakami: „Do zrobienia (n)” z odnośnikami do lekcji, „Czekamy (n)”, „Gotowe: …”", async () => {
    serwer = utworzSerwer({ kurs: KURS_Z_BRAKAMI, lekcje: LEKCJE_Z_BRAKAMI, tematy: TEMATY_Z_BRAKAMI });
    const { container } = await renderEkranu();
    expect(within(karta()).getByText("Kurs jest szkicem. Uczestnicy go nie widzą.")).toBeInTheDocument();
    expect(within(karta()).getByRole("heading", { level: 3, name: "Do zrobienia (2)" })).toBeInTheDocument();
    expect(within(karta()).getByRole("link", { name: "Lekcja 2: brak nagrania i treści." })).toHaveAttribute(
      "href",
      "/admin/kursy/4/lekcje/22",
    );
    expect(within(karta()).getByRole("link", { name: "Lekcja 3: błąd nagrania." })).toHaveAttribute(
      "href",
      "/admin/kursy/4/lekcje/23",
    );
    expect(within(karta()).getByRole("heading", { level: 3, name: "Czekamy (1)" })).toBeInTheDocument();
    expect(within(karta()).getByText("Lekcja 4: nagranie się przetwarza, zwykle 10–30 minut.")).toBeInTheDocument();
    expect(within(karta()).getByText("Gotowe: tytuł, opis, 1 lekcja.")).toBeInTheDocument();
    expect(karta().textContent).not.toMatch(/lesson_empty|recording_error|recording_in_progress/);

    const pas = container.querySelector('[data-obszar="pasek-waski"]') as HTMLElement;
    expect(within(pas).getByRole("link", { name: "do zrobienia 2 rzeczy" })).toHaveAttribute("href", "#publikacja");
    // „Opublikuj kurs” zostaje jedynym przyciskiem głównym: jeden w karcie, jeden w pasie.
    expect(screen.getAllByRole("button", { name: "Opublikuj kurs" })).toHaveLength(2);
  });

  it("lista jest listą serwera: brak opisu kursu nie staje w „Do zrobienia”", async () => {
    serwer = utworzSerwer({ kurs: { ...KURS_GOTOWY, description: null }, lekcje: LEKCJE_GOTOWE });
    await renderEkranu();
    expect(within(karta()).queryByRole("heading", { level: 3 })).toBeNull();
    expect(within(karta()).queryByRole("link", { name: "Kurs nie ma opisu." })).toBeNull();
    expect(within(karta()).getByText("Gotowe: tytuł, 3 lekcje.")).toBeInTheDocument();
  });

  it("szkic gotowy do publikacji: bez list, „Gotowe: …”, publikacja jednym żądaniem", async () => {
    serwer = utworzSerwer({ kurs: KURS_GOTOWY, lekcje: LEKCJE_GOTOWE });
    await renderEkranu();
    expect(within(karta()).queryByRole("heading", { level: 3 })).toBeNull();
    expect(within(karta()).getByText("Gotowe: tytuł, opis, 3 lekcje.")).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("button", { name: "Opublikuj kurs" })[1]);
    expect(await within(karta()).findByText("Kurs jest opublikowany.")).toBeInTheDocument();
    expect(serwer.zapisy()).toEqual([{ sciezka: "/admin/courses/4", metoda: "PATCH", cialo: { is_published: true } }]);
    expect(pytaniaOStan()).toEqual([]);
  });

  it("kurs opublikowany bez braków: stan spokojny, bez list", async () => {
    serwer = utworzSerwer({ kurs: { ...KURS_GOTOWY, is_published: true }, lekcje: LEKCJE_GOTOWE });
    const { container } = await renderEkranu();
    expect(within(karta()).getByText("Kurs jest opublikowany.")).toBeInTheDocument();
    expect(within(karta()).getByText("Zmiany w lekcjach uczestnicy widzą od razu po zapisaniu.")).toBeInTheDocument();
    expect(within(karta()).queryByRole("heading", { level: 3 })).toBeNull();
    expect(within(karta()).queryByText(/^Gotowe:/)).toBeNull();
    const pas = container.querySelector('[data-obszar="pasek-waski"]') as HTMLElement;
    expect(within(pas).queryByRole("link", { name: /uwagi/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Opublikuj kurs" })).toBeNull();
  });

  it("kurs opublikowany z brakami: „Wymaga uwagi (n)” z tymi samymi zdaniami i odnośnikami", async () => {
    serwer = utworzSerwer({
      kurs: { ...KURS_Z_BRAKAMI, is_published: true },
      lekcje: LEKCJE_Z_BRAKAMI,
      tematy: TEMATY_Z_BRAKAMI,
    });
    const { container } = await renderEkranu();
    expect(within(karta()).getByRole("heading", { level: 3, name: "Wymaga uwagi (2)" })).toBeInTheDocument();
    expect(within(karta()).queryByRole("heading", { level: 3, name: /Do zrobienia/ })).toBeNull();
    expect(within(karta()).getByRole("link", { name: "Lekcja 2: brak nagrania i treści." })).toHaveAttribute(
      "href",
      "/admin/kursy/4/lekcje/22",
    );
    expect(within(karta()).getByRole("link", { name: "Lekcja 3: błąd nagrania." })).toHaveAttribute(
      "href",
      "/admin/kursy/4/lekcje/23",
    );
    const pas = container.querySelector('[data-obszar="pasek-waski"]') as HTMLElement;
    expect(within(pas).getByRole("link", { name: "wymagają uwagi: 2" })).toHaveAttribute("href", "#publikacja");
    expect(screen.getAllByRole("link", { name: "Podgląd jako uczestnik" })).toHaveLength(2);
  });

  it("wysyłanie z tej przeglądarki: „Czekamy” mówi procent, a przerwane prowadzi do lekcji", async () => {
    const lekcje = [
      lekcjaZeStanem(21, "Lekcja A"),
      lekcjaZeStanem(22, "Lekcja B", { ...W_DRODZE, video_status: "uploading" }),
      lekcjaZeStanem(23, "Lekcja C"),
    ];
    const kurs = { ...KURS, publication_gaps: { blocking: [], waiting: [{ code: "recording_in_progress", lesson_id: 22 }] } };
    serwer = utworzSerwer({ kurs, lekcje, nagrania: { 22: { status: "processing", video_status: "uploading", ...W_DRODZE } } });
    wysylanie.stan = {
      rodzaj: "wysylanie",
      lekcja: { id: 22, tytul: "Lekcja B", adres: "/admin/kursy/4/lekcje/22" },
      ...{ nazwa: "b.mp4", rozmiar: 1000, wyslano: 620, zostaloSekund: 240, zastepuje: null },
    };
    const { unmount } = await renderEkranu();
    expect(within(karta()).getByRole("heading", { level: 3, name: "Czekamy (1)" })).toBeInTheDocument();
    expect(within(karta()).getByText("Lekcja 2: nagranie się wysyła (62 %).")).toBeInTheDocument();
    unmount();

    wysylanie.stan = {
      rodzaj: "przerwane",
      lekcja: { id: 22, tytul: "Lekcja B", adres: "/admin/kursy/4/lekcje/22" },
      ...{ nazwa: "b.mp4", rozmiar: 1000, wyslano: 620, innyPlik: false, zastepuje: null },
    };
    serwer = utworzSerwer({ kurs, lekcje, nagrania: { 22: { status: "processing", video_status: "uploading", ...W_DRODZE } } });
    await renderEkranu();
    expect(within(karta()).getByRole("link", { name: "Lekcja 2: wysyłanie nagrania przerwane." })).toHaveAttribute(
      "href",
      "/admin/kursy/4/lekcje/22",
    );
  });

  it("po dodaniu lekcji ekran czyta kurs od nowa i pokazuje nowy brak z serwera", async () => {
    serwer = utworzSerwer({ kurs: KURS_GOTOWY, lekcje: LEKCJE_GOTOWE });
    await renderEkranu();
    expect(odczytyKursu()).toBe(1);
    serwer.nadpisz("GET", "/admin/courses/4", () => ({
      ...KURS_GOTOWY,
      lessons_count: 4,
      publication_gaps: { blocking: [{ code: "lesson_empty", lesson_id: 100 }], waiting: [] },
    }));
    await userEvent.click(screen.getByRole("button", { name: "Dodaj lekcję w temacie Praktyka" }));
    await userEvent.type(screen.getByLabelText(/Tytuł nowej lekcji/), "Nowa lekcja{Enter}");

    expect(await within(karta()).findByRole("link", { name: "Lekcja 4: brak nagrania i treści." })).toHaveAttribute(
      "href",
      "/admin/kursy/4/lekcje/100",
    );
    expect(odczytyKursu()).toBe(2);
  });
});

describe("ekran kursu — odmowa publikacji z powodami serwera", () => {
  function odmowa(reason: Record<string, unknown>, message = "Uzupełnij lekcje wskazane na liście braków, zanim opublikujesz kurs.") {
    serwer.nadpisz("PATCH", "/admin/courses/4", () => new ApiError({ status: 422, code: "conditions_not_met", message, reason }));
  }

  it("powody z reason.items: te same zdania i odnośniki, kolejność serwera, bez kodów; fokus na komunikacie", async () => {
    // Kurs wczytany jeszcze bez braków — lekcje popsuły się po wejściu na ekran.
    serwer = utworzSerwer({ kurs: KURS_GOTOWY, lekcje: LEKCJE_Z_BRAKAMI, tematy: TEMATY_Z_BRAKAMI });
    odmowa({
      missing: ["recording_error", "lesson_empty"],
      items: [
        { code: "recording_error", lesson_id: 23 },
        { code: "lesson_empty", lesson_id: 22 },
      ],
    });
    await renderEkranu();
    expect(within(karta()).queryByRole("heading", { level: 3, name: /Do zrobienia/ })).toBeNull();

    await userEvent.click(screen.getAllByRole("button", { name: "Opublikuj kurs" })[1]);

    const komunikat = await within(karta()).findByRole("group", { name: "Nie udało się opublikować (2)" });
    const odnosniki = within(komunikat).getAllByRole("link");
    expect(odnosniki.map((odnosnik) => [odnosnik.textContent, odnosnik.getAttribute("href")])).toEqual([
      ["Lekcja 3: błąd nagrania.", "/admin/kursy/4/lekcje/23"],
      ["Lekcja 2: brak nagrania i treści.", "/admin/kursy/4/lekcje/22"],
    ]);
    expect(karta().textContent).not.toMatch(/recording_error|lesson_empty|conditions_not_met|422/);
    expect(within(karta()).queryByText(/^Gotowe:/)).toBeNull();
    expect(within(karta()).getByText("Kurs jest szkicem. Uczestnicy go nie widzą.")).toBeInTheDocument();
    // Czytnik słyszy powody, a fokus stoi na komunikacie opisanym listą powodów.
    expect(ogloszenie()).toBe(
      "Kurs nie został opublikowany. Lekcja 3: błąd nagrania. Lekcja 2: brak nagrania i treści.",
    );
    await waitFor(() => expect(document.activeElement).toBe(komunikat));
    expect(komunikat).toHaveAttribute("id", "publikacja-odmowa");
    expect(komunikat).toHaveAttribute("tabindex", "-1");
    expect(document.getElementById(komunikat.getAttribute("aria-describedby")!)).toBe(komunikat.querySelector("ul"));
    expect(screen.getAllByRole("button", { name: "Opublikuj kurs" })).toHaveLength(2);
  });

  it("kurs bez lekcji: powód z items, nie zdanie zapasowe z missing", async () => {
    serwer = utworzSerwer({ kurs: KURS_GOTOWY, lekcje: [], tematy: [temat(7, "Wprowadzenie", 1, [])] });
    odmowa(
      { missing: ["lessons"], items: [{ code: "course_without_lessons", lesson_id: null }] },
      "Dodaj co najmniej jedną lekcję, zanim opublikujesz kurs.",
    );
    await renderEkranu();
    await userEvent.click(screen.getAllByRole("button", { name: "Opublikuj kurs" })[1]);
    const komunikat = await within(karta()).findByRole("group", { name: "Nie udało się opublikować (1)" });
    expect(within(komunikat).getByRole("link", { name: "Kurs nie ma jeszcze lekcji." })).toHaveAttribute(
      "href",
      "#tematy-i-lekcje",
    );
  });

  it("kod spoza słownika: zdanie serwera, nigdy pusta karta", async () => {
    serwer = utworzSerwer({ kurs: KURS_GOTOWY, lekcje: LEKCJE_GOTOWE });
    odmowa({ missing: ["nowy_kod"], items: [{ code: "nowy_kod", lesson_id: 21 }] }, "Kurs czeka na zgodę koordynatora.");
    await renderEkranu();
    await userEvent.click(screen.getAllByRole("button", { name: "Opublikuj kurs" })[1]);
    const komunikat = await within(karta()).findByRole("group", { name: "Nie udało się opublikować (1)" });
    expect(within(komunikat).getByText("Kurs czeka na zgodę koordynatora.")).toBeInTheDocument();
    expect(karta().textContent).not.toMatch(/nowy_kod/);
  });

  it("odmowa bez items: jak dotąd — zdanie z reason.missing", async () => {
    serwer = utworzSerwer({ kurs: KURS_GOTOWY, lekcje: LEKCJE_GOTOWE });
    odmowa({ missing: ["lessons"] }, "Dodaj co najmniej jedną lekcję, zanim opublikujesz kurs.");
    await renderEkranu();
    await userEvent.click(screen.getAllByRole("button", { name: "Opublikuj kurs" })[1]);
    const komunikat = await within(karta()).findByRole("group", { name: "Nie udało się opublikować (1)" });
    expect(within(komunikat).getByRole("link", { name: "Dodaj co najmniej jedną lekcję." })).toBeInTheDocument();
  });
});

describe("ekran kursu — pytania o stan nagrania w drodze", () => {
  /** Zapisuje chwilę (czas próbny) każdego pytania o stan lekcji i odpowiada kolejnymi stanami. */
  function kolejneStany(idLekcji: number, stany: Partial<LekcjaAdmin>[]): number[] {
    const chwile: number[] = [];
    serwer.nadpisz("GET", ADRES_STANU(idLekcji), () => {
      const stan = stany[Math.min(chwile.length, stany.length - 1)];
      chwile.push(Date.now());
      return { status: "processing", duration_seconds: 600, preview_embed_url: null, ...stan };
    });
    return chwile;
  }

  const PRZETWARZANE = { ...W_DRODZE, video_status: "processing" as const };
  const GOTOWE = { video_status: "ready" as const, video_ready: true, video_pending: false };
  const BLAD = { ...W_DRODZE, video_status: "error" as const };

  it("pyta tylko o lekcje wysyłane i przetwarzane, nie częściej niż co 30 s na lekcję", async () => {
    serwer = utworzSerwer({
      kurs: KURS_Z_BRAKAMI,
      lekcje: [
        ...LEKCJE_Z_BRAKAMI,
        lekcjaZeStanem(25, "Lekcja E", { ...W_DRODZE, video_status: "uploading" }),
        lekcjaZeStanem(26, "Lekcja F", { video_status: null, video_status_at: null }),
      ],
      tematy: [temat(7, "Wprowadzenie", 1, [21, 22, 23, 24, 25, 26])],
    });
    const przetwarzana = kolejneStany(24, [PRZETWARZANE]);
    const wysylana = kolejneStany(25, [{ ...W_DRODZE, video_status: "uploading" }]);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await renderEkranu();
    await waitFor(() => expect(pytaniaOStan()).toHaveLength(2));

    await minelo(ODSTEP_PYTAN_MS - 10_000);
    expect(pytaniaOStan()).toHaveLength(2);
    await minelo(3 * ODSTEP_PYTAN_MS);

    // Gotowa, pusta, z błędem i nieustalona nie dostały żadnego pytania.
    expect(new Set(pytaniaOStan())).toEqual(new Set([ADRES_STANU(24), ADRES_STANU(25)]));
    for (const chwile of [przetwarzana, wysylana]) {
      expect(chwile.length).toBeGreaterThanOrEqual(3);
      const odstepy = chwile.slice(1).map((chwila, indeks) => chwila - chwile[indeks]);
      expect(Math.min(...odstepy)).toBeGreaterThanOrEqual(ODSTEP_PYTAN_MS);
    }
    expect(odczytyKursu()).toBe(1);
  });

  it("po przejściu w „gotowe” przestaje pytać i czyta kurs od nowa: brak znika z karty", async () => {
    serwer = utworzSerwer({ kurs: KURS_Z_BRAKAMI, lekcje: LEKCJE_Z_BRAKAMI, tematy: TEMATY_Z_BRAKAMI });
    const chwile = kolejneStany(24, [PRZETWARZANE, GOTOWE]);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await renderEkranu();
    await waitFor(() => expect(chwile).toHaveLength(1));
    expect(stanWiersza(24)).toBe("Nagranie: przetwarzanie");
    expect(within(karta()).getByRole("heading", { level: 3, name: "Czekamy (1)" })).toBeInTheDocument();

    serwer.nadpisz("GET", "/admin/courses/4", () => ({ ...KURS, publication_gaps: { ...BRAKI, waiting: [] } }));
    await minelo(ODSTEP_PYTAN_MS + 1_000);
    await waitFor(() => expect(stanWiersza(24)).toBe("Gotowa"));
    expect(chwile).toHaveLength(2);
    await waitFor(() => expect(odczytyKursu()).toBe(2));
    await waitFor(() => expect(within(karta()).queryByRole("heading", { level: 3, name: /Czekamy/ })).toBeNull());
    expect(within(karta()).getByRole("heading", { level: 3, name: "Do zrobienia (2)" })).toBeInTheDocument();

    await minelo(4 * ODSTEP_PYTAN_MS);
    expect(chwile).toHaveLength(2);
    expect(odczytyKursu()).toBe(2);
  });

  it("po przejściu w „błąd” przestaje pytać i czyta kurs od nowa: lekcja staje w „Do zrobienia”", async () => {
    serwer = utworzSerwer({ kurs: KURS_Z_BRAKAMI, lekcje: LEKCJE_Z_BRAKAMI, tematy: TEMATY_Z_BRAKAMI });
    const chwile = kolejneStany(24, [BLAD]);
    serwer.nadpisz("GET", "/admin/courses/4", () => ({
      ...KURS,
      publication_gaps: { blocking: [...BRAKI.blocking, { code: "recording_error", lesson_id: 24 }], waiting: [] },
    }));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<KursAdministracji idKursu="4" />);
    await screen.findByRole("heading", { level: 2, name: "Tematy i lekcje" });
    await waitFor(() => expect(stanWiersza(24)).toBe("Nagranie: błąd"));
    expect(await within(karta()).findByRole("link", { name: "Lekcja 4: błąd nagrania." })).toHaveAttribute(
      "href",
      "/admin/kursy/4/lekcje/24",
    );
    expect(within(karta()).getByRole("heading", { level: 3, name: "Do zrobienia (3)" })).toBeInTheDocument();

    await minelo(4 * ODSTEP_PYTAN_MS);
    expect(chwile).toHaveLength(1);
  });

  it("karta przeglądarki w tle: zero pytań; po powrocie jedno, a w tle znowu cisza", async () => {
    serwer = utworzSerwer({ kurs: KURS_Z_BRAKAMI, lekcje: LEKCJE_Z_BRAKAMI, tematy: TEMATY_Z_BRAKAMI });
    const chwile = kolejneStany(24, [PRZETWARZANE]);
    ustawWidocznosc("hidden");
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await renderEkranu();
    await minelo(4 * ODSTEP_PYTAN_MS);
    expect(chwile).toHaveLength(0);

    await act(async () => ustawWidocznosc("visible"));
    await waitFor(() => expect(chwile).toHaveLength(1));
    // Powrót do karty przed upływem odstępu nie daje drugiego pytania.
    await act(async () => ustawWidocznosc("hidden"));
    await act(async () => ustawWidocznosc("visible"));
    expect(chwile).toHaveLength(1);

    await act(async () => ustawWidocznosc("hidden"));
    await minelo(4 * ODSTEP_PYTAN_MS);
    expect(chwile).toHaveLength(1);
  });

  it("gotowa lekcja z nowym nagraniem w drodze: pyta o nie, a błąd nowego nagrania nie robi z niej braku", async () => {
    const lekcje = [
      lekcjaZeStanem(21, "Lekcja A", { video_status: "processing", video_ready: true, video_pending: true }),
      lekcjaZeStanem(22, "Lekcja B"),
      lekcjaZeStanem(23, "Lekcja C"),
    ];
    serwer = utworzSerwer({ kurs: KURS_GOTOWY, lekcje });
    const chwile = kolejneStany(21, [
      { video_status: "processing", video_ready: true, video_pending: true },
      { video_status: "error", video_ready: true, video_pending: false },
    ]);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await renderEkranu();
    await waitFor(() => expect(chwile).toHaveLength(1));
    expect(stanWiersza(21)).toBe("Gotowanowe nagranie w drodze");
    expect(within(karta()).queryByRole("heading", { level: 3 })).toBeNull();

    await minelo(ODSTEP_PYTAN_MS + 1_000);
    await waitFor(() => expect(stanWiersza(21)).toBe("Gotowanowe nagranie: błąd"));
    expect(within(karta()).queryByRole("heading", { level: 3 })).toBeNull();
    expect(within(karta()).getByText("Gotowe: tytuł, opis, 3 lekcje.")).toBeInTheDocument();

    await minelo(4 * ODSTEP_PYTAN_MS);
    expect(chwile).toHaveLength(2);
  });

  it("brak odpowiedzi o stanie nie zmienia ekranu; następne pytanie po pełnym odstępie", async () => {
    serwer = utworzSerwer({ kurs: KURS_Z_BRAKAMI, lekcje: LEKCJE_Z_BRAKAMI, tematy: TEMATY_Z_BRAKAMI });
    const chwile: number[] = [];
    serwer.nadpisz("GET", ADRES_STANU(24), () => {
      chwile.push(Date.now());
      return new ApiError({ status: 502, code: "bunny_error", message: "Dostawca nie odpowiada." });
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await renderEkranu();
    await waitFor(() => expect(chwile).toHaveLength(1));
    expect(stanWiersza(24)).toBe("Nagranie: przetwarzanie");
    await minelo(ODSTEP_PYTAN_MS + 1_000);
    expect(chwile).toHaveLength(2);
    expect(chwile[1] - chwile[0]).toBeGreaterThanOrEqual(ODSTEP_PYTAN_MS);
    expect(stanWiersza(24)).toBe("Nagranie: przetwarzanie");
    expect(odczytyKursu()).toBe(1);
  });
});
