import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api/klient";
import {
  GODZINY,
  KURS_STUDENTA_W_TOKU,
  KURS_UKONCZONY,
  KURS_W_TOKU,
  KURS_ZABLOKOWANY,
  LEKCJA_DO_ZROBIENIA,
  LEKCJA_UKONCZONA,
  SZCZEGOL_W_TOKU,
  WARUNKI,
} from "./atrapy";
import { alerty, naglowki, sprawdzJedenH1, sprawdzSpis, type OczekiwanyElement } from "./co-widac";
import { liczPrzyciskiGlowne, szablonPulpitu } from "./kontrole-ekranu";

/**
 * Co widać i co można zrobić w każdym stanie pulpitów uczestnika i studenta:
 * nagłówek, jedyny przycisk główny (jest albo go nie ma), nazwa dostępna każdego
 * elementu, na który da się wejść klawiaturą, w kolejności fokusu, oraz tekst
 * stanu. Jedyny przycisk główny stoi w nagłówku strony; stany bez danych nie mają
 * żadnego. Przyciski „Wstecz” nagłówka i „Odśwież” stanu pustego są drugorzędne.
 *
 * Każdy stan ma kontrolę dodatnią: ten sam ekran z innymi danymi musi mieć inny
 * spis, więc kontrola spisu nie przepuszcza wszystkiego.
 */

const wstecz = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: wstecz, push, replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

const pobierzKursy = vi.fn();
const pobierzSzczegolKursu = vi.fn();
const pobierzWarunkiCertyfikatu = vi.fn();
const pobierzGodzinyStazu = vi.fn();
const pobierzNadchodzaceSuperwizje = vi.fn();

vi.mock("../dane", () => ({
  pobierzKursy: (...args: unknown[]) => pobierzKursy(...args),
  pobierzSzczegolKursu: (...args: unknown[]) => pobierzSzczegolKursu(...args),
  pobierzWarunkiCertyfikatu: (...args: unknown[]) => pobierzWarunkiCertyfikatu(...args),
  pobierzGodzinyStazu: (...args: unknown[]) => pobierzGodzinyStazu(...args),
  pobierzNadchodzaceSuperwizje: (...args: unknown[]) => pobierzNadchodzaceSuperwizje(...args),
}));

const { PulpitUczestnika } = await import("../PulpitUczestnika");
const { PulpitStudenta } = await import("../PulpitStudenta");

function blad(status: number, code: string) {
  return new ApiError({ status, code, message: "komunikat" });
}

/** Wszystkie lekcje etapu ukończone: zostaje już tylko test. */
const SZCZEGOL_WSZYSTKIE_UKONCZONE = {
  ...SZCZEGOL_W_TOKU,
  lessons: [LEKCJA_UKONCZONA, { ...LEKCJA_DO_ZROBIENIA, is_completed: true }],
};

const SZCZEGOL_STUDENTA = { ...SZCZEGOL_W_TOKU, ...KURS_STUDENTA_W_TOKU };

beforeEach(() => {
  wstecz.mockReset();
  push.mockReset();
  pobierzKursy.mockReset();
  pobierzSzczegolKursu.mockReset().mockResolvedValue(SZCZEGOL_W_TOKU);
  pobierzWarunkiCertyfikatu.mockReset().mockResolvedValue(WARUNKI);
  pobierzGodzinyStazu.mockReset().mockResolvedValue(GODZINY);
  pobierzNadchodzaceSuperwizje.mockReset().mockResolvedValue([]);
});

afterEach(cleanup);

/** Odczyty rozstrzygają się w kolejnych mikrozadaniach; ekran jest ustalony, gdy żadne nie czeka. */
async function ustal() {
  await act(async () => {
    await new Promise((gotowe) => setTimeout(gotowe, 0));
  });
}

const WSTECZ: OczekiwanyElement = { rola: "button", nazwa: "Wstecz" };
const ODSWIEZ: OczekiwanyElement = { rola: "button", nazwa: "Odśwież" };

describe("pulpity — stany bez danych: co widać i co można zrobić", () => {
  const stany = [
    {
      nazwa: "ładowanie",
      ustaw: () => pobierzKursy.mockReturnValue(new Promise(() => {})),
      oczekiwanie: async () => {},
      h2: [] as string[],
      spis: [WSTECZ],
      alert: [] as string[],
      szkielet: true,
    },
    {
      nazwa: "brak dostępu (403)",
      ustaw: () => pobierzKursy.mockRejectedValue(blad(403, "forbidden")),
      oczekiwanie: async () => {
        await screen.findByRole("heading", { level: 2, name: "Nie masz dostępu do tego ekranu" });
      },
      h2: ["Nie masz dostępu do tego ekranu"],
      spis: [WSTECZ, { rola: "button", nazwa: "Wróć" }],
      alert: [],
      szkielet: false,
    },
    {
      nazwa: "nie znaleziono (404)",
      ustaw: () => pobierzKursy.mockRejectedValue(blad(404, "not_found")),
      oczekiwanie: async () => {
        await screen.findByRole("heading", { level: 2, name: "Nie znaleziono danych pulpitu" });
      },
      h2: ["Nie znaleziono danych pulpitu"],
      spis: [WSTECZ, ODSWIEZ],
      alert: [],
      szkielet: false,
    },
    {
      nazwa: "brak połączenia",
      ustaw: () => pobierzKursy.mockRejectedValue(new TypeError("Failed to fetch")),
      oczekiwanie: async () => {
        await screen.findByRole("alert");
      },
      h2: [],
      spis: [WSTECZ, { rola: "button", nazwa: "Spróbuj ponownie" }],
      alert: ["Brak połączenia", "Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie."],
      szkielet: false,
    },
    {
      nazwa: "błąd serwera (500)",
      ustaw: () => pobierzKursy.mockRejectedValue(blad(500, "server_error")),
      oczekiwanie: async () => {
        await screen.findByRole("alert");
      },
      h2: [],
      spis: [WSTECZ, { rola: "button", nazwa: "Spróbuj ponownie" }],
      alert: ["Nie udało się wczytać pulpitu", "Coś poszło nie tak po naszej stronie. Spróbuj ponownie za chwilę."],
      szkielet: false,
    },
  ];

  describe.each([
    { ekran: "uczestnika", Pulpit: () => <PulpitUczestnika programUkonczony={false} /> },
    { ekran: "studenta", Pulpit: () => <PulpitStudenta /> },
  ])("pulpit $ekran", ({ Pulpit }) => {
    it.each(stany)(
      "$nazwa: jeden main, jeden h1 „Pulpit”, bez przycisku głównego, spis elementów i komunikat",
      async ({ ustaw, oczekiwanie, h2, spis, alert, szkielet }) => {
        ustaw();
        const { container } = render(<Pulpit />);
        await oczekiwanie();
        await ustal();

        szablonPulpitu(container);
        sprawdzJedenH1(container);
        expect(naglowki(container)[0]).toEqual({ poziom: 1, tekst: "Pulpit" });
        expect(naglowki(container).filter((n) => n.poziom === 2).map((n) => n.tekst)).toEqual(h2);
        expect(liczPrzyciskiGlowne(container)).toBe(0);
        sprawdzSpis(container, spis);
        // Błąd odczytu to jeden komunikat z role="alert" (tytuł, zdanie i przycisk w nim); pozostałe stany go nie mają.
        const ogloszone = alerty(container);
        expect(ogloszone).toHaveLength(alert.length === 0 ? 0 : 1);
        for (const fragment of alert) expect(ogloszone[0]).toContain(fragment);
        expect(container.querySelector('[aria-busy="true"]') !== null).toBe(szkielet);
      },
    );

    it("kontrola dodatnia: błąd sieci i dane mają różne spisy — spis błędu czerwieni ekran z danymi", async () => {
      pobierzKursy.mockResolvedValue([KURS_STUDENTA_W_TOKU]);
      pobierzSzczegolKursu.mockResolvedValue(SZCZEGOL_STUDENTA);
      const { container } = render(<Pulpit />);
      await screen.findByRole("heading", { level: 2, name: /^(Twoje kursy|Twoja ścieżka)$/ });
      await ustal();

      expect(() => sprawdzSpis(container, [WSTECZ, { rola: "button", nazwa: "Spróbuj ponownie" }])).toThrow();
      expect(alerty(container)).toEqual([]);
    });
  });
});

describe("pulpit uczestnika — stany z danymi: co widać i co można zrobić", () => {
  const SCIEZKA = [KURS_UKONCZONY, KURS_W_TOKU, KURS_ZABLOKOWANY];
  const LINK_UKONCZONEGO: OczekiwanyElement = {
    rola: "link",
    nazwa: "Otwórz kurs: Podstawy pomocy psychologicznej",
    href: "/panel/kursy/podstawy-pomocy",
  };
  const LINK_W_TOKU: OczekiwanyElement = {
    rola: "link",
    nazwa: "Otwórz kurs: Wywiad psychologiczny",
    href: "/panel/kursy/wywiad-psychologiczny",
  };
  const ZAMKNIETY: OczekiwanyElement = { rola: "button", nazwa: "Zamknięty", nieczynny: true };

  async function pokaz(programUkonczony = false) {
    const wynik = render(<PulpitUczestnika programUkonczony={programUkonczony} />);
    await screen.findByRole("heading", { level: 2, name: "Twoja ścieżka" });
    await ustal();
    return wynik.container;
  }

  it("lekcja do zrobienia: przycisk główny „Wróć do lekcji” czynny, trzy kursy ścieżki, zamknięty bez odnośnika", async () => {
    pobierzKursy.mockResolvedValue(SCIEZKA);
    const container = await pokaz();

    szablonPulpitu(container);
    sprawdzJedenH1(container);
    sprawdzSpis(container, [
      WSTECZ,
      { rola: "button", nazwa: "Wróć do lekcji", glowny: true },
      LINK_UKONCZONEGO,
      LINK_W_TOKU,
      ZAMKNIETY,
      ODSWIEZ,
    ]);
    expect(naglowki(container).map((n) => n.tekst)).toEqual([
      "Pulpit",
      "Struktura wywiadu",
      "Twoja ścieżka",
      "Najbliższe terminy superwizji",
      "Brak zaplanowanych terminów",
    ]);
    expect(screen.getByText("Otworzy się po ukończeniu kursu „Wywiad psychologiczny”.")).toBeInTheDocument();
    expect(alerty(container)).toEqual([]);
  });

  it("zostaje test: przycisk główny „Przejdź do testu” czynny, a nagłówek kroku to „Test sprawdzający”", async () => {
    pobierzKursy.mockResolvedValue(SCIEZKA);
    pobierzSzczegolKursu.mockResolvedValue(SZCZEGOL_WSZYSTKIE_UKONCZONE);
    const container = await pokaz();

    sprawdzSpis(container, [
      WSTECZ,
      { rola: "button", nazwa: "Przejdź do testu", glowny: true },
      LINK_UKONCZONEGO,
      LINK_W_TOKU,
      ZAMKNIETY,
      ODSWIEZ,
    ]);
    expect(screen.getByRole("heading", { level: 2, name: "Test sprawdzający" })).toBeInTheDocument();
    expect(screen.getByText(/Czas na test sprawdzający/)).toBeInTheDocument();
  });

  it("wszystkie etapy ukończone: przycisk główny „Zobacz warunki certyfikatu”, brak kursów zamkniętych", async () => {
    pobierzKursy.mockResolvedValue([KURS_UKONCZONY, { ...KURS_W_TOKU, status: "completed", progress_percent: 100 }]);
    const container = await pokaz();

    sprawdzSpis(container, [
      WSTECZ,
      { rola: "button", nazwa: "Zobacz warunki certyfikatu", glowny: true },
      LINK_UKONCZONEGO,
      LINK_W_TOKU,
      ODSWIEZ,
    ]);
    expect(screen.queryByRole("button", { name: "Zamknięty" })).not.toBeInTheDocument();
  });

  it("program zamknięty: przycisk główny „Przejdź do dalszej współpracy”", async () => {
    pobierzKursy.mockResolvedValue(SCIEZKA);
    const container = await pokaz(true);

    sprawdzSpis(container, [
      WSTECZ,
      { rola: "button", nazwa: "Przejdź do dalszej współpracy", glowny: true },
      LINK_UKONCZONEGO,
      LINK_W_TOKU,
      ZAMKNIETY,
      ODSWIEZ,
    ]);
  });

  it("brak etapu w toku (pierwszy kurs zamknięty): bez przycisku głównego, tylko zamknięty kurs i dwa „Odśwież”", async () => {
    pobierzKursy.mockResolvedValue([KURS_ZABLOKOWANY]);
    const container = await pokaz();

    expect(liczPrzyciskiGlowne(container)).toBe(0);
    sprawdzSpis(container, [WSTECZ, ZAMKNIETY, ODSWIEZ]);
    expect(screen.getByText("Otworzy się po ukończeniu poprzedniego kursu.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Pierwszy krok wkrótce" })).toBeInTheDocument();
  });

  it("pusta ścieżka: bez przycisku głównego, „Odśwież” w ścieżce i w terminach superwizji", async () => {
    pobierzKursy.mockResolvedValue([]);
    const container = await pokaz();

    expect(liczPrzyciskiGlowne(container)).toBe(0);
    sprawdzSpis(container, [WSTECZ, ODSWIEZ, ODSWIEZ]);
    expect(screen.getByRole("heading", { level: 2, name: "Ścieżka jest przygotowywana" })).toBeInTheDocument();
    expect(screen.getByText("Gdy administracja doda pierwszy kurs, pojawi się tutaj.")).toBeInTheDocument();
  });

  it("szczegóły kursu jeszcze się wczytują: karta kroku ma szkielet, nie ma przycisku głównego", async () => {
    pobierzKursy.mockResolvedValue([KURS_W_TOKU]);
    pobierzSzczegolKursu.mockReturnValue(new Promise(() => {}));
    const container = await pokaz();

    expect(liczPrzyciskiGlowne(container)).toBe(0);
    sprawdzSpis(container, [WSTECZ, LINK_W_TOKU, ODSWIEZ]);
    const karta = container.querySelector('[data-karta="nastepny-krok"]');
    expect(karta).not.toBeNull();
    expect(karta?.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByRole("heading", { level: 2, name: "Wywiad psychologiczny" })).not.toBeInTheDocument();
  });

  it("szczegóły kursu nie wczytały się: „Otwórz kurs” w nagłówku i ostrzeżenie w karcie kroku", async () => {
    pobierzKursy.mockResolvedValue([KURS_W_TOKU]);
    pobierzSzczegolKursu.mockRejectedValue(new Error("brak"));
    const container = await pokaz();

    sprawdzSpis(container, [WSTECZ, { rola: "button", nazwa: "Otwórz kurs", glowny: true }, LINK_W_TOKU, ODSWIEZ]);
    expect(screen.getByRole("heading", { level: 3, name: "Szczegóły kursu niedostępne" })).toBeInTheDocument();
    expect(screen.getByText(/możesz otworzyć bieżący kurs/)).toBeInTheDocument();
  });

  it("godziny stażu nie wczytały się: ostrzeżenie w obszarze głównym, reszta ekranu działa", async () => {
    pobierzKursy.mockResolvedValue(SCIEZKA);
    pobierzGodzinyStazu.mockRejectedValue(new Error("brak"));
    const container = await pokaz();

    expect(screen.getByRole("heading", { level: 3, name: "Godziny stażu niedostępne" })).toBeInTheDocument();
    expect(screen.getByText("Nie udało się wczytać godzin stażu.")).toBeInTheDocument();
    sprawdzSpis(container, [
      WSTECZ,
      { rola: "button", nazwa: "Wróć do lekcji", glowny: true },
      LINK_UKONCZONEGO,
      LINK_W_TOKU,
      ZAMKNIETY,
      ODSWIEZ,
    ]);
  });

  it("kontrola dodatnia: przy sprawnych odczytach nie ma żadnego z ostrzeżeń", async () => {
    pobierzKursy.mockResolvedValue(SCIEZKA);
    await pokaz();

    expect(screen.queryByText("Godziny stażu niedostępne")).not.toBeInTheDocument();
    expect(screen.queryByText("Warunki certyfikatu niedostępne")).not.toBeInTheDocument();
    expect(screen.queryByText("Szczegóły kursu niedostępne")).not.toBeInTheDocument();
    expect(screen.queryByText("Terminy superwizji niedostępne")).not.toBeInTheDocument();
  });
});

describe("pulpit studenta — stany z danymi: co widać i co można zrobić", () => {
  const LINK_KURSU: OczekiwanyElement = {
    rola: "link",
    nazwa: "Otwórz kurs: Webinar o superwizji",
    href: "/panel/kursy/webinar-superwizja",
  };
  const KONTAKT: OczekiwanyElement = { rola: "link", nazwa: "kontakt@niepodzielni.com", href: "mailto:kontakt@niepodzielni.com" };

  async function pokaz() {
    const wynik = render(<PulpitStudenta />);
    await screen.findByRole("heading", { level: 2, name: "Twoje kursy" });
    await ustal();
    return wynik.container;
  }

  beforeEach(() => {
    pobierzSzczegolKursu.mockResolvedValue(SZCZEGOL_STUDENTA);
  });

  it("kurs w toku: przycisk główny „Wznów lekcję” czynny, odnośnik do kursu i kontakt", async () => {
    pobierzKursy.mockResolvedValue([KURS_STUDENTA_W_TOKU]);
    const container = await pokaz();

    szablonPulpitu(container);
    sprawdzJedenH1(container);
    sprawdzSpis(container, [WSTECZ, { rola: "button", nazwa: "Wznów lekcję", glowny: true }, LINK_KURSU, KONTAKT]);
    expect(screen.getByRole("heading", { level: 2, name: "Struktura wywiadu" })).toBeInTheDocument();
  });

  it("szczegóły kursu jeszcze się wczytują: karta kroku ma szkielet, nie ma przycisku głównego", async () => {
    pobierzKursy.mockResolvedValue([KURS_STUDENTA_W_TOKU]);
    pobierzSzczegolKursu.mockReturnValue(new Promise(() => {}));
    const container = await pokaz();

    expect(liczPrzyciskiGlowne(container)).toBe(0);
    sprawdzSpis(container, [WSTECZ, LINK_KURSU, KONTAKT]);
    const karta = container.querySelector('[data-karta="nastepny-krok"]');
    expect(karta?.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it("wszystkie lekcje kursu ukończone: przycisk główny „Otwórz kurs” i zdanie o ukończonych lekcjach", async () => {
    pobierzKursy.mockResolvedValue([KURS_STUDENTA_W_TOKU]);
    pobierzSzczegolKursu.mockResolvedValue({ ...SZCZEGOL_STUDENTA, lessons: SZCZEGOL_WSZYSTKIE_UKONCZONE.lessons });
    const container = await pokaz();

    sprawdzSpis(container, [WSTECZ, { rola: "button", nazwa: "Otwórz kurs", glowny: true }, LINK_KURSU, KONTAKT]);
    expect(screen.getByText(/masz już za sobą wszystkie lekcje/)).toBeInTheDocument();
  });

  it("brak kursu w toku (jedyny kurs zamknięty): „Brak kursu w toku”, bez przycisku głównego, zamknięty kurs nieczynny", async () => {
    pobierzKursy.mockResolvedValue([{ ...KURS_STUDENTA_W_TOKU, status: "locked", progress_percent: 0 }]);
    const container = await pokaz();

    expect(liczPrzyciskiGlowne(container)).toBe(0);
    sprawdzSpis(container, [WSTECZ, { rola: "button", nazwa: "Zamknięty", nieczynny: true }, KONTAKT]);
    expect(screen.getByRole("heading", { level: 2, name: "Brak kursu w toku" })).toBeInTheDocument();
    expect(screen.getByText("Gdy któryś kurs będzie w toku, pojawi się tutaj lekcja do wznowienia.")).toBeInTheDocument();
  });

  it("kontrola dodatnia: ten sam kurs w toku daje „Wznów lekcję”, a zamknięty — „Brak kursu w toku”", async () => {
    pobierzKursy.mockResolvedValue([KURS_STUDENTA_W_TOKU]);
    await pokaz();
    expect(screen.queryByRole("heading", { level: 2, name: "Brak kursu w toku" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Wznów lekcję" })).toBeInTheDocument();
  });

  it("pusta lista kursów: bez przycisku głównego, „Odśwież” i kontakt", async () => {
    pobierzKursy.mockResolvedValue([]);
    const container = await pokaz();

    expect(liczPrzyciskiGlowne(container)).toBe(0);
    sprawdzSpis(container, [WSTECZ, ODSWIEZ, KONTAKT]);
    expect(screen.getByRole("heading", { level: 2, name: "Nie masz jeszcze żadnego kursu" })).toBeInTheDocument();
  });

  it("wszystkie kursy ukończone: komunikat bez przycisku głównego", async () => {
    pobierzKursy.mockResolvedValue([{ ...KURS_STUDENTA_W_TOKU, status: "completed", progress_percent: 100 }]);
    pobierzSzczegolKursu.mockRejectedValue(new Error("nie powinno być wołane"));
    const container = await pokaz();

    expect(liczPrzyciskiGlowne(container)).toBe(0);
    sprawdzSpis(container, [WSTECZ, LINK_KURSU, KONTAKT]);
    expect(screen.getByRole("heading", { level: 2, name: "Ukończone kursy" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Wszystkie Twoje kursy są ukończone. Dobra robota.")).toBeInTheDocument());
  });

  it("szczegóły kursu nie wczytały się: „Otwórz kurs” w nagłówku i ostrzeżenie w karcie kroku", async () => {
    pobierzKursy.mockResolvedValue([KURS_STUDENTA_W_TOKU]);
    pobierzSzczegolKursu.mockRejectedValue(new Error("brak"));
    const container = await pokaz();

    sprawdzSpis(container, [WSTECZ, { rola: "button", nazwa: "Otwórz kurs", glowny: true }, LINK_KURSU, KONTAKT]);
    expect(screen.getByRole("heading", { level: 3, name: "Szczegóły kursu niedostępne" })).toBeInTheDocument();
  });
});
