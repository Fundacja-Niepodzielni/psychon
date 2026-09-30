import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/klient";
import type { PytanieSkrzynki, StronaPytan } from "../dane";
import {
  bladPolaOdpowiedzi,
  formatujDate,
  komunikatKoperty,
  liczbaBezOdpowiedzi,
  OPCJE_WIDOKU,
  odmianaPytan,
  opisLicznika,
  opisPytania,
  rodzajBledu,
  stronaDoWczytania,
  tekstPustegoStanu,
  wierszePytan,
  zastapPytanie,
  zdejmijPytanie,
} from "../logika";

const PYTANIE = {
  id: 11,
  lesson_id: 21,
  question: "Jak długo trwa pierwsza rozmowa?",
  answer: null,
  answered_by: null,
  answered_by_name: null,
  answered_at: null,
  created_at: "2026-09-29T10:15:00Z",
  updated_at: "2026-09-29T10:15:00Z",
  user: { id: 17, first_name: "Marta", last_name: "Demo" },
  lesson: { id: 21, title: "Wprowadzenie do wywiadu", course: { id: 3, slug: "wywiad", title: "Wywiad psychologiczny" } },
} satisfies PytanieSkrzynki;

const ODPOWIEDZIANE = {
  ...PYTANIE,
  answer: "Około 40 minut.",
  answered_by: 5,
  answered_by_name: "Joanna Demo",
  answered_at: "2026-09-30T08:00:00Z",
} satisfies PytanieSkrzynki;

const DRUGIE = { ...PYTANIE, id: 12, question: "Drugie pytanie?" } satisfies PytanieSkrzynki;

function blad(status: number, code: string, errors?: Record<string, string[]>) {
  return new ApiError({ status, code, message: "komunikat", errors });
}

describe("rodzajBledu", () => {
  it.each([
    [blad(401, "unauthenticated"), "brak-uprawnien"],
    [blad(403, "forbidden"), "brak-uprawnien"],
    [blad(403, "entry_locked"), "juz-odpowiedziano"],
    [blad(404, "not_found"), "nie-znaleziono"],
    [blad(422, "validation_failed", { answer: ["x"] }), "pola"],
    [blad(500, "unknown_error"), "inny"],
    [blad(403, "access_expired"), "inny"],
    [new TypeError("Failed to fetch"), "inny"],
    ["tekst", "inny"],
  ])("%s → %s", (wejscie, oczekiwane) => {
    expect(rodzajBledu(wejscie)).toBe(oczekiwane);
  });
});

describe("bladPolaOdpowiedzi", () => {
  it("pierwszy komunikat pola answer albo undefined", () => {
    expect(bladPolaOdpowiedzi(blad(422, "validation_failed", { answer: ["Wpisz treść odpowiedzi.", "drugi"] }))).toBe("Wpisz treść odpowiedzi.");
    expect(bladPolaOdpowiedzi(blad(422, "validation_failed", { inne: ["x"] }))).toBeUndefined();
    expect(bladPolaOdpowiedzi(new Error("x"))).toBeUndefined();
  });
});

describe("licznik", () => {
  it("bierze unanswered z meta.extra, a bez niego total albo długość listy", () => {
    expect(liczbaBezOdpowiedzi({ data: [PYTANIE], meta: { current_page: 1, per_page: 25, total: 1, last_page: 1, extra: { unanswered: 7 } } })).toBe(7);
    expect(liczbaBezOdpowiedzi({ data: [PYTANIE], meta: { current_page: 1, per_page: 25, total: 4, last_page: 1 } })).toBe(4);
    expect(liczbaBezOdpowiedzi({ data: [PYTANIE, DRUGIE] })).toBe(2);
  });

  it.each([
    [0, "pytań"],
    [1, "pytanie"],
    [2, "pytania"],
    [4, "pytania"],
    [5, "pytań"],
    [12, "pytań"],
    [14, "pytań"],
    [22, "pytania"],
    [112, "pytań"],
  ])("odmiana %i → %s", (liczba, slowo) => {
    expect(odmianaPytan(liczba)).toBe(slowo);
    expect(opisLicznika(liczba)).toBe(`${liczba} ${slowo} bez odpowiedzi`);
  });
});

describe("wiersze listy", () => {
  it("formatuje datę w czasie polskim, a brak daty nazywa", () => {
    expect(formatujDate("2026-09-29T10:15:00Z")).toBe("29 września 2026, 12:15");
    expect(formatujDate(null)).toBe("—");
  });

  it("opis pytania: autor, kurs, lekcja, data", () => {
    expect(opisPytania(PYTANIE)).toMatch(/^Marta Demo · Wywiad psychologiczny · Wprowadzenie do wywiadu · 29 września 2026, 12:15/);
  });

  it("wiersz niesie treść pytania jako tytuł i akcję „Odpowiedz”, która woła wywołanie z pytaniem", () => {
    const naOdpowiedz = vi.fn();
    const naPodglad = vi.fn();
    const wiersze = wierszePytan([PYTANIE, DRUGIE], naOdpowiedz, naPodglad);
    expect(wiersze.map((wiersz) => [wiersz.id, wiersz.tytul, wiersz.akcja.etykieta])).toEqual([
      ["11", PYTANIE.question, "Odpowiedz"],
      ["12", DRUGIE.question, "Odpowiedz"],
    ]);
    wiersze[1].akcja.onKliknij?.();
    expect(naOdpowiedz).toHaveBeenCalledWith(DRUGIE);
    expect(naPodglad).not.toHaveBeenCalled();
  });

  it("pytanie z odpowiedzią: plakietka „Odpowiedziane” i akcja „Zobacz odpowiedź” wołająca podgląd; bez odpowiedzi — „Oczekuje”", () => {
    const naOdpowiedz = vi.fn();
    const naPodglad = vi.fn();
    const wiersze = wierszePytan([PYTANIE, ODPOWIEDZIANE], naOdpowiedz, naPodglad);
    expect(wiersze.map((wiersz) => [wiersz.plakietka?.tekst, wiersz.plakietka?.wariant, wiersz.akcja.etykieta])).toEqual([
      ["Oczekuje", "pending", "Odpowiedz"],
      ["Odpowiedziane", "ok", "Zobacz odpowiedź"],
    ]);
    wiersze[1].akcja.onKliknij?.();
    expect(naPodglad).toHaveBeenCalledWith(ODPOWIEDZIANE);
    expect(naOdpowiedz).not.toHaveBeenCalled();
  });
});

describe("komunikatKoperty", () => {
  it("komunikat z koperty błędu serwera; bez koperty (brak połączenia, pusty komunikat) undefined", () => {
    expect(komunikatKoperty(blad(500, "server_error"))).toBe("komunikat");
    expect(komunikatKoperty(new ApiError({ status: 500, code: "server_error", message: "" }))).toBeUndefined();
    expect(komunikatKoperty(new TypeError("Failed to fetch"))).toBeUndefined();
    expect(komunikatKoperty("tekst")).toBeUndefined();
  });
});

describe("widok listy", () => {
  it("opcje filtra: „Tylko nieodpowiedziane” pierwsza (domyślna), potem „Pokaż wszystkie”", () => {
    expect(OPCJE_WIDOKU).toEqual([
      { wartosc: "bez-odpowiedzi", etykieta: "Tylko nieodpowiedziane" },
      { wartosc: "wszystkie", etykieta: "Pokaż wszystkie" },
    ]);
  });

  it("osobny stan pusty i tytuł listy dla każdego widoku", () => {
    const bez = tekstPustegoStanu("bez-odpowiedzi");
    const wszystkie = tekstPustegoStanu("wszystkie");
    expect(bez.naglowek).toBe("Brak pytań bez odpowiedzi");
    expect(wszystkie.naglowek).toBe("Nie masz jeszcze żadnych pytań");
    expect(bez.tytulListy).not.toBe(wszystkie.tytulListy);
    expect(bez.tresc).not.toBe(wszystkie.tresc);
  });
});

describe("zastapPytanie", () => {
  const STRONA = {
    data: [PYTANIE, DRUGIE],
    meta: { current_page: 1, per_page: 25, total: 2, last_page: 1, extra: { unanswered: 2 } },
  } satisfies StronaPytan;

  it("podmienia pytanie na wersję z odpowiedzią, zostawia sumę, zmniejsza licznik o jeden, nie zmienia wejścia", () => {
    const wynik = zastapPytanie(STRONA, ODPOWIEDZIANE);
    expect(wynik.data.map((p) => [p.id, p.answer])).toEqual([
      [11, ODPOWIEDZIANE.answer],
      [12, null],
    ]);
    expect(wynik.meta).toMatchObject({ total: 2, extra: { unanswered: 1 } });
    expect(STRONA.data[0].answer).toBeNull();
    expect(STRONA.meta.extra.unanswered).toBe(2);
  });

  it("pytanie już odpowiedziane nie zmniejsza licznika drugi raz; pytanie spoza strony nic nie zmienia", () => {
    const juz = { data: [ODPOWIEDZIANE, DRUGIE], meta: { ...STRONA.meta, extra: { unanswered: 1 } } } satisfies StronaPytan;
    expect(zastapPytanie(juz, { ...ODPOWIEDZIANE, answer: "Poprawiona." }).meta).toMatchObject({ extra: { unanswered: 1 } });
    expect(zastapPytanie(STRONA, { ...ODPOWIEDZIANE, id: 999 })).toBe(STRONA);
  });

  it("licznik nie schodzi poniżej zera", () => {
    const zero = { data: [PYTANIE], meta: { current_page: 1, per_page: 25, total: 1, last_page: 1, extra: { unanswered: 0 } } } satisfies StronaPytan;
    expect(zastapPytanie(zero, ODPOWIEDZIANE).meta).toMatchObject({ extra: { unanswered: 0 } });
  });
});

describe("zdejmijPytanie i stronaDoWczytania", () => {
  const STRONA = {
    data: [PYTANIE, DRUGIE],
    meta: { current_page: 1, per_page: 25, total: 2, last_page: 1, extra: { unanswered: 2 } },
  } satisfies StronaPytan;

  it("zdejmuje pytanie i zmniejsza sumę oraz licznik o jeden, nie zmieniając wejścia", () => {
    const wynik = zdejmijPytanie(STRONA, 11);
    expect(wynik.data.map((p) => p.id)).toEqual([12]);
    expect(wynik.meta).toMatchObject({ total: 1, extra: { unanswered: 1 } });
    expect(STRONA.data).toHaveLength(2);
    expect(STRONA.meta.total).toBe(2);
  });

  it("pytanie spoza strony nic nie zmienia", () => {
    expect(zdejmijPytanie(STRONA, 999)).toBe(STRONA);
  });

  it("licznik nie schodzi poniżej zera", () => {
    const wynik = zdejmijPytanie({ data: [PYTANIE], meta: { current_page: 1, per_page: 25, total: 0, last_page: 1, extra: { unanswered: 0 } } }, 11);
    expect(wynik.meta).toMatchObject({ total: 0, extra: { unanswered: 0 } });
  });

  it("strona do wczytania: pusta strona 2 przy niepustej skrzynce cofa na ostatnią, w pozostałych przypadkach null", () => {
    const pusta = { data: [], meta: { current_page: 2, per_page: 1, total: 1, last_page: 2, extra: { unanswered: 1 } } } satisfies StronaPytan;
    expect(stronaDoWczytania(pusta, 2)).toBe(1);
    expect(stronaDoWczytania({ data: [], meta: { ...pusta.meta, total: 3, per_page: 1 } }, 2)).toBe(2);
    expect(stronaDoWczytania({ data: [], meta: { ...pusta.meta, total: 0 } }, 1)).toBeNull();
    expect(stronaDoWczytania(STRONA, 1)).toBeNull();
    expect(stronaDoWczytania({ data: [] }, 1)).toBeNull();
  });
});
