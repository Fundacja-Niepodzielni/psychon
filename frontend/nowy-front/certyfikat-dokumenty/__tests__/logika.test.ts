import { describe, expect, it } from "vitest";
import {
  nazwaPobraniaDokumentu,
  nazwaWydaniaDokumentu,
  opisWarunku,
  pozycjeListyBrakow,
  stanyRodzajow,
  zdanieOPostepie,
  zdanieOZaliczonychTestach,
} from "../logika";
import {
  DOKUMENT_POROZUMIENIE,
  TYPY_BRAK_PROFILU,
  TYPY_ZASWIADCZENIE_DOSTEPNE,
  TYPY_ZASWIADCZENIE_NIEDOSTEPNE,
  WARUNKI_NIESPELNIONE,
  WARUNKI_SPELNIONE,
} from "./atrapy";

/**
 * Teksty obu ekranów: każde zdanie z liczbą ma kontrolę odmiany (1 · 2–4 · 5+ · 12–14 · 22),
 * każda liczba z serwera przechodzi przez wspólny formater (przecinek zamiast kropki), brak
 * pola jest „brakiem danych”, nie zerem.
 */

const warunek = (nadpisanie: object) => ({ key: "courses" as const, label: "Wszystkie etapy i testy", met: false, ...nadpisanie });

describe("opisWarunku", () => {
  it("liczniki: „Masz {zrobione} z {wymagane}.”, godziny stażu z jednostką i przecinkiem dziesiętnym", () => {
    expect(opisWarunku(warunek({ done: 1, required: 10 }))).toBe("Masz 1 z 10.");
    expect(opisWarunku(warunek({ key: "internship", done: "41.5", required: "72" }))).toBe("Masz 41,5 z 72 godzin.");
    expect(opisWarunku(warunek({ key: "supervision", done: 5, required: 6 }))).toBe("Masz 5 z 6.");
  });

  it("warsztat: tylko zaliczony albo niezaliczony", () => {
    expect(opisWarunku(warunek({ key: "workshop", met: true }))).toBe("Warsztat zaliczony.");
    expect(opisWarunku(warunek({ key: "workshop", met: false }))).toBe("Warsztat jeszcze niezaliczony.");
  });

  it("brak któregokolwiek licznika to „brak danych”, a zero z serwera zostaje zerem", () => {
    expect(opisWarunku(warunek({}))).toBe("Brak danych o postępie.");
    expect(opisWarunku(warunek({ done: 3 }))).toBe("Brak danych o postępie.");
    expect(opisWarunku(warunek({ required: 10 }))).toBe("Brak danych o postępie.");
    expect(opisWarunku(warunek({ done: 0, required: 10 }))).toBe("Masz 0 z 10.");
  });
});

describe("pozycjeListyBrakow", () => {
  it("jedna pozycja na warunek, w kolejności z serwera; odnośnik tylko przy trzech warunkach z ekranem źródłowym", () => {
    const pozycje = pozycjeListyBrakow(WARUNKI_NIESPELNIONE);

    expect(pozycje.map((p) => p.klucz)).toEqual(["courses", "internship", "supervision", "workshop"]);
    expect(pozycje.map((p) => p.akcja?.href)).toEqual(["/panel/kursy", "/panel/staz", "/panel/superwizja", undefined]);
    expect(pozycje.map((p) => p.spelniony)).toEqual([false, false, false, false]);
    expect(pozycje[0].akcja?.etykietaDostepna).toBe("Otwórz kursy: Wszystkie etapy i testy. Masz 1 z 10.");
  });

  it("kontrola dodatnia: flaga z serwera przechodzi bez własnego przeliczania", () => {
    expect(pozycjeListyBrakow(WARUNKI_SPELNIONE).map((p) => p.spelniony)).toEqual([true, true, true, true]);
    expect(
      pozycjeListyBrakow({ eligible: false, conditions: [warunek({ done: 10, required: 10, met: false })] })[0].spelniony,
    ).toBe(false);
  });
});

describe("zdanieOPostepie — odmowa „warunek” według liczby spełnionych", () => {
  const zWarunkami = (spelnionych: number) => ({
    eligible: false,
    conditions: [0, 1, 2, 3].map((i) => warunek({ key: "courses", met: i < spelnionych })),
  });

  it.each([
    [0, "Spełniasz 0 warunków z 4."],
    [1, "Spełniasz 1 warunek z 4."],
    [2, "Spełniasz 2 warunki z 4."],
    [3, "Spełniasz 3 warunki z 4."],
    [4, "Spełniasz 4 warunki z 4."],
  ])("%i spełnionych", (spelnione, zdanie) => {
    expect(zdanieOPostepie(zWarunkami(spelnione))).toBe(zdanie);
  });
});

describe("zdanieOZaliczonychTestach", () => {
  it.each([
    [0, "Masz 0 zaliczonych testów."],
    [1, "Masz 1 zaliczony test."],
    [2, "Masz 2 zaliczone testy."],
    [5, "Masz 5 zaliczonych testów."],
    [12, "Masz 12 zaliczonych testów."],
    [14, "Masz 14 zaliczonych testów."],
    [22, "Masz 22 zaliczone testy."],
  ])("%i", (liczba, zdanie) => {
    expect(zdanieOZaliczonychTestach(liczba)).toBe(zdanie);
  });

  it("brak pola albo null to „brak danych”, nie zero", () => {
    expect(zdanieOZaliczonychTestach(undefined)).toBe("Brak danych o zaliczonych testach.");
    expect(zdanieOZaliczonychTestach(null)).toBe("Brak danych o zaliczonych testach.");
  });
});

describe("stanyRodzajow", () => {
  it("wydany rodzaj jest „Wygenerowano”, bez wyjaśnienia i bez akcji", () => {
    const [porozumienie] = stanyRodzajow([DOKUMENT_POROZUMIENIE], TYPY_ZASWIADCZENIE_NIEDOSTEPNE);
    expect(porozumienie).toMatchObject({
      tytul: "Porozumienie wolontariackie",
      plakietka: { wariant: "ok", tekst: "Wygenerowano" },
      wyjasnienie: null,
      wystawiony: true,
      mozeWygenerowac: false,
      doProfilu: false,
    });
  });

  it("godziny stażu: liczby z serwera z przecinkiem, bez własnego liczenia brakujących godzin", () => {
    const [, zaswiadczenie] = stanyRodzajow([DOKUMENT_POROZUMIENIE], TYPY_ZASWIADCZENIE_NIEDOSTEPNE);
    expect(zaswiadczenie.wyjasnienie).toBe("Zaakceptowane godziny stażu: 41,5 z 72 wymaganych.");
    expect(zaswiadczenie.plakietka).toEqual({ wariant: "warn", tekst: "Jeszcze niedostępny" });
    expect(zaswiadczenie.mozeWygenerowac).toBe(false);
  });

  it("brakujące pola profilu: nazwy po polsku, odnośnik do profilu; nieznane pole wraca bez zmian", () => {
    const [porozumienie, zaswiadczenie] = stanyRodzajow([], TYPY_BRAK_PROFILU);
    expect(porozumienie.wyjasnienie).toBe("Uzupełnij w profilu: telefon, PESEL, ulica z numerem.");
    expect(porozumienie.doProfilu).toBe(true);
    expect(zaswiadczenie.wyjasnienie).toBe("Uzupełnij w profilu: PESEL.");

    const [nieznane] = stanyRodzajow([], {
      ...TYPY_BRAK_PROFILU,
      volunteer_agreement: { available: false, reason: "profile_incomplete", missing_fields: ["nowe_pole"] },
    });
    expect(nieznane.wyjasnienie).toBe("Uzupełnij w profilu: nowe_pole.");
  });

  it("kontrola dodatnia: dostępny rodzaj może być wygenerowany; brak danych o rodzajach to niedostępny", () => {
    const [, zaswiadczenie] = stanyRodzajow([DOKUMENT_POROZUMIENIE], TYPY_ZASWIADCZENIE_DOSTEPNE);
    expect(zaswiadczenie).toMatchObject({ mozeWygenerowac: true, plakietka: { tekst: "Można wygenerować" } });

    const bezDanych = stanyRodzajow([], null);
    expect(bezDanych.map((r) => r.mozeWygenerowac)).toEqual([false, false]);
    expect(bezDanych.map((r) => r.wyjasnienie)).toEqual([null, null]);
  });
});

describe("nazwy działań niosą rodzaj dokumentu i format", () => {
  it("pobranie: co, numer i format; wygenerowanie: co", () => {
    expect(nazwaPobraniaDokumentu(DOKUMENT_POROZUMIENIE)).toBe("Pobierz porozumienie wolontariackie NP/PW/2026/003 (plik PDF)");
    expect(nazwaWydaniaDokumentu("internship_certificate")).toBe("Wygeneruj zaświadczenie o stażu");
  });
});
