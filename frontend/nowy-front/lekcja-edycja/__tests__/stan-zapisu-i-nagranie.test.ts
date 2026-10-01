import { describe, expect, it } from "vitest";
import type { StanFormularza } from "../formularz";
import {
  formatRozmiaru,
  miejsceWKursie,
  opisPliku,
  procentWyslania,
  rodzajPliku,
  stanKartyZSerwera,
  stanLekcji,
  szacujPozostalyCzas,
  zdaniePostepu,
  zdaniePrzerwania,
  ZDANIE_BLEDU_PRZETWARZANIA,
  type StanKartyNagrania,
} from "../nagranie";
import { godzinaZapisu, opisStanuZapisu, zdanieStanuZapisu, zmienionePola } from "../stan-zapisu";

/**
 * Zdania strony lekcji liczone bez Reacta: stan zapisu tekstu, stany karty
 * nagrania z odpowiedzi serwera, rozmiary i postęp, karta „Stan lekcji”,
 * miejsce lekcji w kursie.
 */

const NBSP = String.fromCharCode(160);

const ZAPISANY: StanFormularza = { title: "Tytuł", description: "Opis", content: "Treść", duration: "30" };

describe("stan zapisu tekstu", () => {
  it("bez zmian: pusta lista i „Wszystko zapisane” bez godziny przed pierwszym zapisem", () => {
    expect(zmienionePola(ZAPISANY, { ...ZAPISANY })).toEqual([]);
    expect(zdanieStanuZapisu(opisStanuZapisu([], null))).toBe("Wszystko zapisane");
  });

  it("zmienione pola w stałej kolejności: tytuł, opis, czas, treść", () => {
    const zmieniony: StanFormularza = { title: "Inny", description: "Inny", content: "Inna", duration: "31" };
    expect(zmienionePola(zmieniony, ZAPISANY)).toEqual(["tytuł", "opis", "czas", "treść"]);
    expect(zmienionePola({ ...ZAPISANY, content: "Inna", title: "Inny" }, ZAPISANY)).toEqual(["tytuł", "treść"]);
  });

  it("biały znak na końcu treści to zmiana — treść zapisuje się bez przycinania", () => {
    expect(zmienionePola({ ...ZAPISANY, content: "Treść " }, ZAPISANY)).toEqual(["treść"]);
  });

  it("zdania z godziną ostatniego zapisu", () => {
    expect(zdanieStanuZapisu(opisStanuZapisu(["tytuł", "treść"], "10:42"))).toBe(
      "Niezapisane: tytuł, treść · ostatni zapis 10:42",
    );
    expect(zdanieStanuZapisu(opisStanuZapisu(["opis"], null))).toBe("Niezapisane: opis");
    expect(zdanieStanuZapisu(opisStanuZapisu([], "10:42"))).toBe("Wszystko zapisane · 10:42");
  });

  it("godzina ma zawsze dwie cyfry godzin i minut", () => {
    expect(godzinaZapisu(new Date(2026, 9, 1, 9, 5))).toBe("09:05");
    expect(godzinaZapisu(new Date(2026, 9, 1, 23, 59))).toBe("23:59");
  });
});

describe("stan karty nagrania z odpowiedzi serwera", () => {
  it.each<[string, Parameters<typeof stanKartyZSerwera>[0], StanKartyNagrania]>([
    ["brak odpowiedzi", null, { rodzaj: "nieznany" }],
    ["brak nagrania", { status: "no_video" }, { rodzaj: "brak" }],
    ["przetwarzanie", { status: "processing", duration_seconds: 0, preview_embed_url: "x" }, { rodzaj: "przetwarzanie" }],
    ["gotowe", { status: "finished", duration_seconds: 125, preview_embed_url: "x" }, { rodzaj: "gotowe", czasSekundy: 125 }],
    ["błąd", { status: "error", duration_seconds: 0, preview_embed_url: "x" }, { rodzaj: "blad", zdanie: ZDANIE_BLEDU_PRZETWARZANIA }],
  ])("%s", (_nazwa, odpowiedz, stan) => {
    expect(stanKartyZSerwera(odpowiedz)).toEqual(stan);
  });
});

describe("rozmiary, postęp i rodzaj pliku", () => {
  it.each([
    [4, `4${NBSP}B`],
    [410 * 1024, `410${NBSP}KB`],
    [Math.round(2.1 * 1024 * 1024), `2,1${NBSP}MB`],
    [580 * 1024 * 1024, `580${NBSP}MB`],
    [Math.round(1.2 * 1024 * 1024 * 1024), `1,2${NBSP}GB`],
  ])("rozmiar %i bajtów", (bajty, zdanie) => {
    expect(formatRozmiaru(bajty)).toBe(zdanie);
  });

  it("procent wysłania: pełne procenty, od 0 do 100, pusty plik to 0", () => {
    expect(procentWyslania(0, 100)).toBe(0);
    expect(procentWyslania(629, 1000)).toBe(62);
    expect(procentWyslania(1000, 1000)).toBe(100);
    expect(procentWyslania(2000, 1000)).toBe(100);
    expect(procentWyslania(5, 0)).toBe(0);
  });

  it("szacunek czasu: z dotychczasowego tempa; bez danych — brak szacunku", () => {
    expect(szacujPozostalyCzas(0, 1000, 5000)).toBeNull();
    expect(szacujPozostalyCzas(500, 1000, 0)).toBeNull();
    expect(szacujPozostalyCzas(1000, 1000, 5000)).toBeNull();
    expect(szacujPozostalyCzas(250, 1000, 60_000)).toBe(180);
  });

  it("zdanie postępu i zdanie przerwania", () => {
    expect(zdaniePostepu(62, 240)).toBe(`62${NBSP}% · zostało ok. 4${NBSP}min`);
    expect(zdaniePostepu(62, 10)).toBe(`62${NBSP}% · zostało ok. 1${NBSP}min`);
    expect(zdaniePostepu(62, null)).toBe(`62${NBSP}%`);
    expect(zdaniePrzerwania(580 * 1024 * 1024, Math.round(1.2 * 1024 * 1024 * 1024))).toBe(
      `Wysyłanie stanęło przy 47${NBSP}% (580${NBSP}MB z${NBSP}1,2${NBSP}GB).`,
    );
  });

  it("rodzaj pliku z rozszerzenia; nazwa bez rozszerzenia nie zgaduje", () => {
    expect(rodzajPliku("karta.pdf")).toBe("PDF");
    expect(rodzajPliku("Karta.Pracy.DOCX")).toBe("DOCX");
    expect(rodzajPliku("bez-rozszerzenia")).toBeNull();
    expect(rodzajPliku(".ukryty")).toBeNull();
    expect(rodzajPliku("kropka.")).toBeNull();
    expect(opisPliku("karta.pdf", 410 * 1024)).toBe(`PDF · 410${NBSP}KB`);
    expect(opisPliku("karta", null)).toBe("");
  });
});

describe("karta „Stan lekcji”", () => {
  const PELNA = { title: "Tytuł", description: "Opis", content: "Treść", duration_seconds: 1800 };

  it("gotowe: tytuł, opis, treść, pliki w poprawnej formie liczby, nagranie", () => {
    expect(stanLekcji(PELNA, 2, { rodzaj: "gotowe", czasSekundy: 60 })).toEqual({
      gotowe: ["tytuł", "opis", "treść", "2 pliki", "nagranie"],
      czekamy: [],
      uwaga: [],
    });
    expect(stanLekcji(PELNA, 1, { rodzaj: "brak" }).gotowe).toContain("1 plik");
    expect(stanLekcji(PELNA, 5, { rodzaj: "brak" }).gotowe).toContain("5 plików");
    expect(stanLekcji(PELNA, 12, { rodzaj: "brak" }).gotowe).toContain("12 plików");
    expect(stanLekcji(PELNA, 22, { rodzaj: "brak" }).gotowe).toContain("22 pliki");
  });

  it("czekamy: wysyłanie z procentem i przetwarzanie", () => {
    const wysylanie: StanKartyNagrania = { rodzaj: "wysylanie", nazwa: "n.mp4", rozmiar: 100, wyslano: 62, zostaloSekund: null };
    expect(stanLekcji(PELNA, 0, wysylanie).czekamy).toEqual([`nagranie się wysyła (62${NBSP}%)`]);
    expect(stanLekcji(PELNA, 0, { rodzaj: "przetwarzanie" }).czekamy).toEqual(["nagranie się przetwarza"]);
  });

  it("wymaga uwagi: przerwane, błąd, pusta lekcja, czas 0", () => {
    const przerwane: StanKartyNagrania = { rodzaj: "przerwane", nazwa: "n.mp4", rozmiar: 100, wyslano: 48, innyPlik: false };
    expect(stanLekcji(PELNA, 0, przerwane).uwaga).toEqual(["wysyłanie nagrania przerwane"]);
    expect(stanLekcji(PELNA, 0, { rodzaj: "blad", zdanie: "x" }).uwaga).toEqual(["nagranie trzeba wysłać ponownie"]);
    expect(stanLekcji({ ...PELNA, content: "  ", duration_seconds: 0 }, 0, { rodzaj: "brak" }).uwaga).toEqual([
      "lekcja nie ma treści ani nagrania",
      "czas trwania 0 – uczestnik nie ukończy lekcji",
    ]);
    expect(stanLekcji(PELNA, 0, { rodzaj: "brak" }).uwaga).toEqual([]);
  });
});

describe("miejsce lekcji w kursie", () => {
  const LEKCJE = [
    { id: 30, sequence_order: 3 },
    { id: 10, sequence_order: 1 },
    { id: 20, sequence_order: 2 },
  ];

  it("pierwsza lekcja nie ma poprzedniej, ostatnia nie ma następnej", () => {
    expect(miejsceWKursie(LEKCJE, 10)).toEqual({ numer: 1, razem: 3, poprzednia: null, nastepna: LEKCJE[2] });
    expect(miejsceWKursie(LEKCJE, 30)).toEqual({ numer: 3, razem: 3, poprzednia: LEKCJE[2], nastepna: null });
  });

  it("środkowa lekcja ma obie sąsiednie w kolejności kursu, nie w kolejności listy", () => {
    expect(miejsceWKursie(LEKCJE, 20)).toEqual({ numer: 2, razem: 3, poprzednia: LEKCJE[1], nastepna: LEKCJE[0] });
  });

  it("lekcji spoza listy nie ma w kursie", () => {
    expect(miejsceWKursie(LEKCJE, 99)).toBeNull();
  });
});
