import { describe, expect, it } from "vitest";
import { KURS } from "./pomoce";
import { kontekstKursu } from "../kurs";
import {
  czasCzytaniaMinut,
  minutyObejrzane,
  minutyZSekund,
  numerMinuty,
  podtytul,
  stanPrzycisku,
  wymaganeSekundy,
  zdanieObejrzane,
  zdaniePostepuTematu,
  zdanieZostalo,
} from "../stan";

describe("zdanieZostalo — liczba mnoga po polsku", () => {
  it.each([
    [1, "Została 1 minuta nagrania."],
    [2, "Zostały 2 minuty nagrania."],
    [4, "Zostały 4 minuty nagrania."],
    [5, "Zostało 5 minut nagrania."],
    [12, "Zostało 12 minut nagrania."],
    [14, "Zostało 14 minut nagrania."],
    [22, "Zostały 22 minuty nagrania."],
    [112, "Zostało 112 minut nagrania."],
  ])("%i → %s", (minuty, zdanie) => {
    expect(zdanieZostalo(minuty)).toBe(zdanie);
  });
});

describe("liczby czasu", () => {
  it("minutyZSekund: zaokrąglone, ale nigdy 0 dla dodatniej liczby sekund", () => {
    expect(minutyZSekund(0)).toBe(0);
    expect(minutyZSekund(10)).toBe(1);
    expect(minutyZSekund(1200)).toBe(20);
  });

  it("wymaganeSekundy: z serwera; bez pola z progu procentowego", () => {
    expect(wymaganeSekundy({ required_active_seconds: 960, duration_seconds: 1200, completable_at_percent: 50 })).toBe(960);
    expect(wymaganeSekundy({ duration_seconds: 1200, completable_at_percent: 80 })).toBe(960);
    expect(wymaganeSekundy({ required_active_seconds: null, duration_seconds: 1000, completable_at_percent: 60 })).toBe(600);
  });

  it("minutyObejrzane: pełne minuty, bez przekroczenia wymaganych", () => {
    expect(minutyObejrzane(720, 960)).toEqual({ obejrzane: 12, potrzebne: 16 });
    expect(minutyObejrzane(5000, 960)).toEqual({ obejrzane: 16, potrzebne: 16 });
    expect(minutyObejrzane(0, 0)).toEqual({ obejrzane: 0, potrzebne: 1 });
  });

  it("czasCzytaniaMinut: 200 słów na minutę, od 1; bez treści null", () => {
    expect(czasCzytaniaMinut(null)).toBeNull();
    expect(czasCzytaniaMinut("  \n ")).toBeNull();
    expect(czasCzytaniaMinut("jedno")).toBe(1);
    expect(czasCzytaniaMinut(Array.from({ length: 201 }, () => "a").join(" "))).toBe(2);
  });

  it("podtytul: nagranie i czytanie; bez nagrania samo czytanie", () => {
    expect(podtytul(1200, "jest", "tekst")).toBe("20 min nagrania · około 1 min czytania");
    expect(podtytul(1200, "brak", "tekst")).toBe("około 1 min czytania");
    expect(podtytul(1200, "w-przygotowaniu", null)).toBe("20 min nagrania");
    expect(podtytul(0, "jest", null)).toBe("");
  });

  it("numerMinuty: pełne minuty od 1", () => {
    expect(numerMinuty(0)).toBe(1);
    expect(numerMinuty(720)).toBe(12);
    expect(numerMinuty(754)).toBe(12);
  });
});

describe("zdanieObejrzane", () => {
  it("w trakcie, po spełnieniu warunku i po ukończeniu", () => {
    expect(zdanieObejrzane({ ukonczona: false, mozna: false, aktywneSekundy: 720, wymagane: 960 })).toBe(
      "Obejrzane: 12 z 16 potrzebnych minut. Liczy się czas oglądania, nie przewijanie.",
    );
    expect(zdanieObejrzane({ ukonczona: false, mozna: true, aktywneSekundy: 960, wymagane: 960 })).toBe(
      "Obejrzane: 16 z 16 potrzebnych minut.",
    );
    expect(zdanieObejrzane({ ukonczona: true, mozna: true, aktywneSekundy: 960, wymagane: 960 })).toBe(
      "Lekcja ukończona. Nagranie możesz oglądać dowolnie.",
    );
  });
});

describe("zdaniePostepuTematu", () => {
  const temat = { id: 7, tytul: "T", razem: 7, ukonczone: 2, numerBiezacej: 3, segmenty: [] };

  it("w trakcie i po ukończeniu", () => {
    expect(zdaniePostepuTematu(temat, false)).toBe("2 z 7 lekcji ukończone · jesteś w lekcji 3");
    expect(zdaniePostepuTematu({ ...temat, ukonczone: 3 }, true)).toBe("3 z 7 lekcji ukończone · następna to lekcja 4");
  });

  it("ostatnia lekcja tematu bez zdania o następnej", () => {
    expect(zdaniePostepuTematu({ ...temat, ukonczone: 7, numerBiezacej: 7 }, true)).toBe("7 z 7 lekcji ukończone");
  });
});

describe("stanPrzycisku — jeden przycisk i jedno zdanie we wszystkich stanach", () => {
  const baza = {
    ukonczona: false,
    nagranie: "jest" as const,
    mozna: false,
    aktywneSekundy: 720,
    wymagane: 960,
    kontekst: kontekstKursu(KURS, 21, false),
    maTest: true,
  };

  it("brakuje czasu: nieczynny z liczbą minut", () => {
    expect(stanPrzycisku(baza)).toMatchObject({
      etykieta: "Oznacz lekcję jako ukończoną",
      zdanie: "Zostały 4 minuty nagrania.",
      czynny: false,
      cel: { rodzaj: "ukoncz" },
    });
  });

  it("brakuje mniej niż minuty: „Została 1 minuta nagrania.”", () => {
    expect(stanPrzycisku({ ...baza, aktywneSekundy: 930 }).zdanie).toBe("Została 1 minuta nagrania.");
  });

  it("można ukończyć: czynny", () => {
    expect(stanPrzycisku({ ...baza, mozna: true, aktywneSekundy: 960 })).toMatchObject({
      zdanie: "Możesz zaznaczyć lekcję jako ukończoną.",
      czynny: true,
    });
  });

  it("bez nagrania: czynny od początku", () => {
    expect(stanPrzycisku({ ...baza, nagranie: "brak" })).toMatchObject({
      zdanie: "Przeczytaj lekcję i oznacz ją jako ukończoną.",
      czynny: true,
    });
  });

  it("w przygotowaniu i nie działa: nieczynny, także gdy serwer już uznał warunek", () => {
    expect(stanPrzycisku({ ...baza, nagranie: "w-przygotowaniu" })).toMatchObject({
      zdanie: "Nagranie nie jest jeszcze gotowe. Lekcję ukończysz po jego obejrzeniu.",
      czynny: false,
    });
    expect(stanPrzycisku({ ...baza, nagranie: "nie-dziala", mozna: true })).toMatchObject({
      zdanie: "Lekcję ukończysz, gdy nagranie zacznie działać.",
      czynny: false,
    });
  });

  it("ukończona: przycisk do następnej lekcji z jej tytułem i czasem", () => {
    expect(stanPrzycisku({ ...baza, ukonczona: true, kontekst: kontekstKursu(KURS, 21, true) })).toMatchObject({
      etykieta: "Przejdź do lekcji 4",
      zdanie: "Następna: „Rozmowa, która nie ocenia” (16 min).",
      czynny: true,
      cel: { rodzaj: "lekcja", id: 22 },
    });
  });

  it("ostatnia lekcja tematu: przejście do następnego tematu", () => {
    expect(stanPrzycisku({ ...baza, ukonczona: true, kontekst: kontekstKursu(KURS, 25, true) })).toMatchObject({
      etykieta: "Przejdź do następnego tematu",
      zdanie: "Temat ukończony. Następny: „Rozmowa z osobą w kryzysie”.",
      cel: { rodzaj: "lekcja", id: 31 },
    });
  });

  it("ostatnia lekcja kursu: z testem „Przejdź do testu”, bez testu powrót do kursu", () => {
    const ostatnia = kontekstKursu(KURS, 31, true);
    expect(stanPrzycisku({ ...baza, ukonczona: true, kontekst: ostatnia, maTest: true })).toMatchObject({
      etykieta: "Przejdź do testu",
      zdanie: "Wszystkie lekcje ukończone. Został test.",
      cel: { rodzaj: "test" },
    });
    expect(stanPrzycisku({ ...baza, ukonczona: true, kontekst: ostatnia, maTest: false })).toMatchObject({
      etykieta: "Wróć do kursu",
      zdanie: "Wszystkie lekcje ukończone.",
      cel: { rodzaj: "kurs" },
    });
  });

  it("bez odczytu kursu: ukończona lekcja prowadzi z powrotem do kursu", () => {
    expect(stanPrzycisku({ ...baza, ukonczona: true, kontekst: null })).toMatchObject({
      etykieta: "Wróć do kursu",
      czynny: true,
      cel: { rodzaj: "kurs" },
    });
  });
});
