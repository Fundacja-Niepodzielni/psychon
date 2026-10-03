import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ApiError } from "@/lib/api/klient";
import { jedenMain } from "@/design-system/szablony/__tests__/jeden-main";
import { alerty, naglowki, sprawdzJedenH1, sprawdzSpis, type OczekiwanyElement } from "@/nowy-front/pulpit/__tests__/co-widac";
import { kursSzkicu, odpowiedzBezTestu, odpowiedzSerwera, TYTULY_LEKCJI } from "./atrapy";
import type { KursUczestnika as DaneKursu } from "../dane";

/**
 * Co widać i co można zrobić w każdym stanie strony kursu uczestnika: nagłówek,
 * jedyny przycisk główny (jest, z powodem obok, albo go nie ma), nazwa dostępna
 * każdego elementu, na który da się wejść klawiaturą, w kolejności fokusu,
 * zdanie wyjaśniające nieczynny przycisk testu i tekst stanu. Stany bez danych
 * nie mają przycisku głównego ani okruszków.
 *
 * Każdy stan ma kontrolę dodatnią: ten sam ekran z innymi danymi musi mieć inny
 * spis, więc kontrola spisu nie przepuszcza wszystkiego.
 */

const api = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
}));

const { KursUczestnika } = await import("../KursUczestnika");

const SLUG = "pierwsza-pomoc-psychologiczna";

beforeEach(() => {
  push.mockReset();
  api.mockReset();
});

afterEach(cleanup);

async function pokaz(kurs: DaneKursu, podglad = false, rola: string | null = null) {
  api.mockImplementation(() => Promise.resolve(kurs));
  let wynik: ReturnType<typeof render> | undefined;
  await act(async () => {
    wynik = render(<KursUczestnika slug={SLUG} podglad={podglad} rola={rola} />);
  });
  await screen.findByRole("heading", { level: 1 });
  return wynik!.container;
}

async function pokazBlad(blad: unknown) {
  api.mockImplementation(() => Promise.reject(blad));
  let wynik: ReturnType<typeof render> | undefined;
  await act(async () => {
    wynik = render(<KursUczestnika slug={SLUG} />);
  });
  await screen.findByRole("heading", { level: 1 });
  return wynik!.container;
}

describe("strona kursu — stany bez danych: co widać i co można zrobić", () => {
  const BLAD_SERWERA = new ApiError({ status: 500, code: "server_error", message: "Błąd" });
  const BRAK_SIECI = new TypeError("Failed to fetch");
  const ZDANIE_KURS_ZAMKNIETY = "Ukończ poprzedni kurs.";

  const stany = [
    {
      nazwa: "błąd odczytu (500)",
      blad: BLAD_SERWERA,
      h2: "Nie udało się wczytać kursu",
      alert: ["Nie udało się wczytać kursu", "Coś poszło nie tak po naszej stronie. Spróbuj ponownie za chwilę."],
      przycisk: "Spróbuj ponownie",
      cel: null,
    },
    {
      nazwa: "brak połączenia",
      blad: BRAK_SIECI,
      h2: "Brak połączenia",
      alert: ["Brak połączenia", "Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie."],
      przycisk: "Spróbuj ponownie",
      cel: null,
    },
    {
      nazwa: "kurs zamknięty kolejnością (403)",
      blad: new ApiError({ status: 403, code: "course_locked", message: ZDANIE_KURS_ZAMKNIETY }),
      h2: "Nie masz dostępu do tego ekranu",
      alert: [],
      przycisk: "Wróć do pulpitu",
      cel: "/panel/pulpit",
    },
    {
      nazwa: "nie znaleziono kursu (404)",
      blad: new ApiError({ status: 404, code: "not_found", message: "Nie znaleziono zasobu." }),
      h2: "Nie znaleziono kursu",
      alert: [],
      przycisk: "Wróć do listy",
      cel: "/panel/kursy",
    },
    {
      nazwa: "dostęp wygasł (403)",
      blad: new ApiError({ status: 403, code: "access_expired", message: "Dostęp wygasł." }),
      h2: "Twój dostęp wygasł.",
      alert: [],
      przycisk: "Wróć do kursów",
      cel: "/panel/kursy",
    },
  ];

  it.each(stany)(
    "$nazwa: jeden main, jeden h1 „Kurs”, h2 stanu, jeden przycisk drugorzędny bez przycisku głównego i okruszków",
    async ({ blad, h2, alert, przycisk, cel }) => {
      const container = await pokazBlad(blad);

      jedenMain(container);
      sprawdzJedenH1(container);
      expect(naglowki(container)).toEqual([
        { poziom: 1, tekst: "Kurs" },
        { poziom: 2, tekst: h2 },
      ]);
      sprawdzSpis(container, [{ rola: "button", nazwa: przycisk }]);
      expect(screen.queryByRole("link")).not.toBeInTheDocument();

      // Błąd odczytu i brak sieci są ogłaszane od razu (role="alert"); odmowy to osobny ekran z nagłówkiem na fokusie.
      const ogloszone = alerty(container);
      expect(ogloszone).toHaveLength(alert.length === 0 ? 0 : 1);
      for (const fragment of alert) expect(ogloszone[0]).toContain(fragment);

      // Przycisk robi dokładnie jedno: albo ponawia odczyt, albo prowadzi pod wskazany adres.
      expect(push).not.toHaveBeenCalled();
      const odczyty = api.mock.calls.length;
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: przycisk }));
      });
      if (cel === null) {
        expect(push).not.toHaveBeenCalled();
        expect(api).toHaveBeenCalledTimes(odczyty + 1);
      } else {
        expect(push).toHaveBeenCalledTimes(1);
        expect(push).toHaveBeenCalledWith(cel);
        expect(api).toHaveBeenCalledTimes(odczyty);
      }
    },
  );

  it("kurs zamknięty kolejnością: zdanie z serwera stoi na ekranie, a nagłówek odmowy ma fokus", async () => {
    await pokazBlad(stany[2].blad);
    expect(screen.getByText(ZDANIE_KURS_ZAMKNIETY)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Nie masz dostępu do tego ekranu" })).toHaveFocus();
  });

  it("dostęp wygasł: zdanie na czas przekierowania i nagłówek z fokusem", async () => {
    await pokazBlad(stany[4].blad);
    expect(screen.getByText("Za chwilę przeniesiemy Cię na stronę z informacją o wygaśnięciu dostępu.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Twój dostęp wygasł." })).toHaveFocus();
  });

  it("ładowanie: jeden main, h1 „Kurs”, komunikat o ładowaniu ogłaszany przez status, szkielet, nic do naciśnięcia", async () => {
    api.mockImplementation(() => new Promise(() => {}));
    let container!: HTMLElement;
    await act(async () => {
      container = render(<KursUczestnika slug={SLUG} />).container;
    });

    jedenMain(container);
    sprawdzJedenH1(container);
    expect(naglowki(container)).toEqual([{ poziom: 1, tekst: "Kurs" }]);
    sprawdzSpis(container, []);
    expect(screen.getByRole("status")).toHaveTextContent("Ładowanie kursu…");
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(alerty(container)).toEqual([]);
  });

  it("kontrola dodatnia: błąd odczytu i dane mają różne spisy — spis błędu czerwieni stronę z danymi", async () => {
    const container = await pokaz(kursSzkicu({ ukonczone: 2, zamknieteOd: 4 }));
    expect(() => sprawdzSpis(container, [{ rola: "button", nazwa: "Spróbuj ponownie" }])).toThrow();
    expect(alerty(container)).toEqual([]);
  });
});

describe("strona kursu — stany z danymi: co widać i co można zrobić", () => {
  const KURSY: OczekiwanyElement = { rola: "link", nazwa: "Kursy", href: "/panel/kursy" };
  const WROC_DO_LISTY: OczekiwanyElement = { rola: "link", nazwa: "Wróć do listy kursów", href: "/panel/kursy" };
  const GORA = [KURSY, WROC_DO_LISTY];

  /** Wiersz lekcji o numerze 1–7 z etykietą akcji; adres niesie kurs, a w podglądzie parametr podglądu. */
  function lekcja(numer: number, etykieta: "Rozpocznij lekcję" | "Kontynuuj" | "Otwórz ponownie", podglad = false): OczekiwanyElement {
    return {
      rola: "link",
      nazwa: `${etykieta}: lekcja ${numer}, ${TYTULY_LEKCJI[numer - 1]}`,
      href: `/panel/lekcje/${20 + numer}?kurs=${SLUG}${podglad ? "&podglad=1" : ""}`,
    };
  }
  const lekcjeOtwarte = (ile: number) => Array.from({ length: ile }, (_, i) => lekcja(i + 1, "Otwórz ponownie"));

  const TEST_NIECZYNNY = (zostalo: number): OczekiwanyElement => ({
    rola: "button",
    nazwa: "Przejdź do testu",
    nieczynny: true,
    opis: `Test odblokuje się, gdy ukończysz wszystkie lekcje. Zostało: ${zostalo}.`,
  });

  const naglowkiKursu = (zTestem: boolean) => [
    { poziom: 1, tekst: "Pierwsza pomoc psychologiczna" },
    { poziom: 2, tekst: "Kryzys i jego przebieg" },
    { poziom: 2, tekst: "Rozmowa wspierająca" },
    ...(zTestem ? [{ poziom: 2, tekst: "Test końcowy" }] : []),
  ];

  it("nierozpoczęty: przycisk główny „Rozpocznij lekcję 1” z powodem obok, test nieczynny z zdaniem „Zostało: 7.”", async () => {
    const container = await pokaz(kursSzkicu({ ukonczone: 0, zamknieteOd: 2 }));

    jedenMain(container);
    sprawdzJedenH1(container);
    expect(naglowki(container)).toEqual(naglowkiKursu(true));
    sprawdzSpis(container, [
      ...GORA,
      { rola: "link", nazwa: "Rozpocznij lekcję 1", glowny: true, opis: "„Czym jest kryzys psychiczny”", href: `/panel/lekcje/21?kurs=${SLUG}` },
      lekcja(1, "Rozpocznij lekcję"),
      TEST_NIECZYNNY(7),
    ]);
    // Lekcje 2–7 są zamknięte: kłódka i zdanie, bez przycisku i odnośnika.
    expect(document.querySelectorAll("[data-zamknieta]")).toHaveLength(6);
    expect(screen.getByText("Po ukończeniu lekcji 1")).toBeInTheDocument();
    expect(screen.getByText("Po ukończeniu lekcji 6")).toBeInTheDocument();
    expect(screen.getByText("0 z 7 lekcji ukończone")).toBeInTheDocument();
  });

  it("w toku: przycisk główny „Kontynuuj lekcję 3”, ukończone lekcje „Otwórz ponownie”, test nieczynny z zdaniem „Zostało: 5.”", async () => {
    const container = await pokaz(kursSzkicu({ ukonczone: 2, zamknieteOd: 4 }));

    sprawdzSpis(container, [
      ...GORA,
      { rola: "link", nazwa: "Kontynuuj lekcję 3", glowny: true, opis: "„Rozpoznawanie kryzysu psychicznego”", href: `/panel/lekcje/23?kurs=${SLUG}` },
      lekcja(1, "Otwórz ponownie"),
      lekcja(2, "Otwórz ponownie"),
      lekcja(3, "Kontynuuj"),
      TEST_NIECZYNNY(5),
    ]);
    expect(naglowki(container)).toEqual(naglowkiKursu(true));
    expect(document.querySelectorAll("[data-zamknieta]")).toHaveLength(4);
    expect(screen.getByText("2 z 7 lekcji ukończone")).toBeInTheDocument();
  });

  it("zostaje test: przycisk główny „Przejdź do testu” z powodem obok, karta testu ma czynny odnośnik z opisem", async () => {
    const container = await pokaz(kursSzkicu({ ukonczone: 7 }));

    sprawdzSpis(container, [
      ...GORA,
      {
        rola: "link",
        nazwa: "Przejdź do testu",
        glowny: true,
        opis: "Wszystkie lekcje ukończone. Został test.",
        href: `/panel/kursy/${SLUG}/test`,
      },
      ...lekcjeOtwarte(7),
      {
        rola: "link",
        nazwa: "Przejdź do testu",
        opis: "Możesz już podejść do testu.",
        href: `/panel/kursy/${SLUG}/test`,
      },
    ]);
    expect(document.querySelectorAll("[data-zamknieta]")).toHaveLength(0);
    expect(screen.getByText("Lekcje ukończone")).toBeInTheDocument();
  });

  it("wszystkie lekcje ukończone, ale serwer trzyma test zamknięty: bez przycisku głównego, karta testu nieczynna z powodem", async () => {
    const container = await pokaz(odpowiedzSerwera({ ukonczone: 7, kurs: { test_locked: true } }));

    sprawdzSpis(container, [
      ...GORA,
      ...lekcjeOtwarte(7),
      { rola: "button", nazwa: "Przejdź do testu", nieczynny: true, opis: "Test jest jeszcze zamknięty." },
    ]);
  });

  it("kurs ukończony i test zaliczony: „Kurs ukończony”, bez przycisku głównego, karta testu mówi „Test zaliczony.”", async () => {
    const container = await pokaz(odpowiedzSerwera({ ukonczone: 7, kurs: { test_passed: true } }));

    sprawdzSpis(container, [
      ...GORA,
      ...lekcjeOtwarte(7),
      { rola: "link", nazwa: "Przejdź do testu", opis: "Test zaliczony.", href: `/panel/kursy/${SLUG}/test` },
    ]);
    expect(screen.getByText("Kurs ukończony")).toBeInTheDocument();
    expect(naglowki(container)).toEqual(naglowkiKursu(true));
  });

  it("kurs bez testu w trakcie: bez karty testu, przycisk główny prowadzi do lekcji 4", async () => {
    const container = await pokaz(odpowiedzBezTestu(3));

    sprawdzSpis(container, [
      ...GORA,
      { rola: "link", nazwa: "Kontynuuj lekcję 4", glowny: true, opis: "„Rozmowa, która nie ocenia”", href: `/panel/lekcje/24?kurs=${SLUG}` },
      lekcja(1, "Otwórz ponownie"),
      lekcja(2, "Otwórz ponownie"),
      lekcja(3, "Otwórz ponownie"),
      lekcja(4, "Kontynuuj"),
    ]);
    expect(naglowki(container)).toEqual(naglowkiKursu(false));
    expect(screen.queryByRole("heading", { level: 2, name: "Test końcowy" })).not.toBeInTheDocument();
  });

  it("kurs bez testu, wszystkie lekcje ukończone: zwykły odnośnik „Wróć do kursów” zamiast przycisku głównego", async () => {
    const container = await pokaz(odpowiedzBezTestu(7));

    sprawdzSpis(container, [...GORA, { rola: "link", nazwa: "Wróć do kursów", href: "/panel/kursy" }, ...lekcjeOtwarte(7)]);
    expect(screen.getByText("Kurs ukończony")).toBeInTheDocument();
    expect(naglowki(container)).toEqual(naglowkiKursu(false));
  });

  it("kurs bez lekcji: zdanie o braku lekcji, bez przycisku głównego, tylko powrót do listy kursów", async () => {
    const container = await pokaz({ ...kursSzkicu({ ukonczone: 0 }), lessons: [] });

    sprawdzSpis(container, GORA);
    expect(naglowki(container)).toEqual([
      { poziom: 1, tekst: "Pierwsza pomoc psychologiczna" },
      { poziom: 2, tekst: "Lekcje" },
    ]);
    expect(screen.getByText("Ten kurs nie ma jeszcze opublikowanych lekcji.")).toBeInTheDocument();
  });

  it("podgląd personelu: pas z odnośnikiem do edycji kursu jest pierwszy w kolejności fokusu, odnośniki niosą parametr podglądu", async () => {
    const container = await pokaz(kursSzkicu({ ukonczone: 2, zamknieteOd: 4 }), true, "project_manager");

    sprawdzSpis(container, [
      { rola: "link", nazwa: "Wróć do edycji kursu", href: "/admin/kursy/2" },
      ...GORA,
      {
        rola: "link",
        nazwa: "Kontynuuj lekcję 3",
        glowny: true,
        opis: "„Rozpoznawanie kryzysu psychicznego”",
        href: `/panel/lekcje/23?kurs=${SLUG}&podglad=1`,
      },
      lekcja(1, "Otwórz ponownie", true),
      lekcja(2, "Otwórz ponownie", true),
      lekcja(3, "Kontynuuj", true),
      lekcja(4, "Rozpocznij lekcję", true),
      lekcja(5, "Rozpocznij lekcję", true),
      lekcja(6, "Rozpocznij lekcję", true),
      lekcja(7, "Rozpocznij lekcję", true),
      TEST_NIECZYNNY(5),
    ]);
    // W podglądzie nie ma lekcji zamkniętych kłódką: wszystkie mają odnośnik.
    expect(document.querySelectorAll("[data-zamknieta]")).toHaveLength(0);
  });

  it("kontrola dodatnia: ten sam kurs bez podglądu ma zamknięte lekcje, więc spis z podglądu czerwieni zwykłą stronę", async () => {
    const container = await pokaz(kursSzkicu({ ukonczone: 2, zamknieteOd: 4 }), false, "project_manager");

    expect(document.querySelectorAll("[data-zamknieta]")).toHaveLength(4);
    expect(() => sprawdzSpis(container, [{ rola: "link", nazwa: "Wróć do edycji kursu", href: "/admin/kursy/2" }])).toThrow();
    expect(screen.queryByRole("link", { name: "Wróć do edycji kursu" })).not.toBeInTheDocument();
  });

  it("zamknięta lekcja nie ma przycisku ani odnośnika, a przycisk testu nieczynny nic nie otwiera po naciśnięciu", async () => {
    await pokaz(kursSzkicu({ ukonczone: 0, zamknieteOd: 2 }));
    const zamknieta = document.querySelector<HTMLElement>('[data-lekcja="22"]');
    expect(zamknieta).not.toBeNull();
    expect(zamknieta?.querySelectorAll("a, button")).toHaveLength(0);

    const test = screen.getByRole("button", { name: "Przejdź do testu" });
    expect(test).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(test);
    expect(push).not.toHaveBeenCalled();
  });
});
