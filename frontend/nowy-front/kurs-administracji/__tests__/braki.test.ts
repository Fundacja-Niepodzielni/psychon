import { describe, expect, it } from "vitest";
import {
  KOTWICA_DANYCH_KURSU,
  KOTWICA_DRZEWA,
  stanLekcji,
  stanPublikacji,
  wymagaUwagi,
  zdanieDoZrobienia,
} from "../braki";
import { KURS, lekcja } from "./atrapa-serwera";

const adresLekcji = (id: number) => `/admin/kursy/4/lekcje/${id}`;

describe("stanLekcji", () => {
  it("nagranie bez odpowiedzi serwera albo gotowe: lekcja gotowa", () => {
    expect(stanLekcji({ video_provider_id: "wideo-1", content: null }, undefined)).toBe("gotowa");
    expect(stanLekcji({ video_provider_id: "wideo-1", content: null }, "finished")).toBe("gotowa");
  });

  it("nagranie w przetwarzaniu i z błędem rozpoznaje odpowiedź serwera", () => {
    expect(stanLekcji({ video_provider_id: "wideo-1", content: null }, "processing")).toBe("przetwarzanie");
    expect(stanLekcji({ video_provider_id: "wideo-1", content: null }, "error")).toBe("blad-nagrania");
  });

  it("bez nagrania: treść wystarcza, sama biel nie", () => {
    expect(stanLekcji({ video_provider_id: null, content: "## Wstęp" }, undefined)).toBe("gotowa");
    expect(stanLekcji({ video_provider_id: null, content: "  \n " }, undefined)).toBe("pusta");
    expect(stanLekcji({ video_provider_id: null, content: null }, undefined)).toBe("pusta");
  });

  it("uwagi wymaga błąd nagrania i pusta lekcja, czekanie nie", () => {
    expect(wymagaUwagi("pusta")).toBe(true);
    expect(wymagaUwagi("blad-nagrania")).toBe(true);
    expect(wymagaUwagi("przetwarzanie")).toBe(false);
    expect(wymagaUwagi("gotowa")).toBe(false);
  });
});

describe("stanPublikacji", () => {
  it("kurs kompletny: nic do zrobienia, nic nie czeka, gotowe wymienia tytuł, opis i lekcje", () => {
    const stan = stanPublikacji({
      kurs: KURS,
      lekcje: [lekcja(21, "A"), lekcja(22, "B"), lekcja(23, "C")],
      nagrania: {},
      adresLekcji,
    });
    expect(stan).toEqual({ doZrobienia: [], czekamy: [], gotowe: ["tytuł", "opis", "3 lekcje"] });
  });

  it("brak opisu prowadzi do wiersza danych kursu, brak lekcji do karty lekcji", () => {
    const stan = stanPublikacji({ kurs: { ...KURS, description: "  " }, lekcje: [], nagrania: {}, adresLekcji });
    expect(stan.doZrobienia).toEqual([
      { id: "opis", tekst: "Kurs nie ma opisu.", href: `#${KOTWICA_DANYCH_KURSU}` },
      { id: "lekcje", tekst: "Kurs nie ma jeszcze lekcji.", href: `#${KOTWICA_DRZEWA}` },
    ]);
    expect(stan.gotowe).toEqual(["tytuł"]);
  });

  it("liczy lekcje z listy, nie z licznika kursu", () => {
    const stan = stanPublikacji({
      kurs: { ...KURS, lessons_count: 0 },
      lekcje: [lekcja(21, "A")],
      nagrania: {},
      adresLekcji,
    });
    expect(stan.doZrobienia).toEqual([]);
  });

  it("lekcje dzieli na do zrobienia i czekamy, z numerem z kolejności ekranu i adresem lekcji", () => {
    const stan = stanPublikacji({
      kurs: KURS,
      lekcje: [
        lekcja(21, "A"),
        { ...lekcja(22, "B"), video_provider_id: null },
        lekcja(23, "C"),
        lekcja(24, "D"),
      ],
      nagrania: { 23: "processing", 24: "error" },
      adresLekcji,
    });
    expect(stan.doZrobienia).toEqual([
      { id: "lekcja-22", tekst: "Lekcja 2: brak nagrania i treści.", href: "/admin/kursy/4/lekcje/22" },
      { id: "lekcja-24", tekst: "Lekcja 4: błąd nagrania.", href: "/admin/kursy/4/lekcje/24" },
    ]);
    expect(stan.czekamy).toEqual([
      { id: "lekcja-23", tekst: "Lekcja 3: nagranie się przetwarza, zwykle 10–30 minut." },
    ]);
    expect(stan.gotowe).toEqual(["tytuł", "opis", "1 lekcja"]);
  });

  it("bez strony lekcji brak prowadzi do karty lekcji", () => {
    const stan = stanPublikacji({
      kurs: KURS,
      lekcje: [{ ...lekcja(21, "A"), video_provider_id: null }],
      nagrania: {},
      adresLekcji: () => null,
    });
    expect(stan.doZrobienia[0].href).toBe(`#${KOTWICA_DRZEWA}`);
  });

  it("liczba materiałów kursu nie jest brakiem", () => {
    const stan = stanPublikacji({
      kurs: { ...KURS, materials_count: 0 },
      lekcje: [lekcja(21, "A")],
      nagrania: {},
      adresLekcji,
    });
    expect(stan.doZrobienia).toEqual([]);
  });
});

describe("zdanieDoZrobienia", () => {
  it("odmienia rzeczownik przy liczbie", () => {
    expect(zdanieDoZrobienia(1)).toBe("do zrobienia 1 rzecz");
    expect(zdanieDoZrobienia(2)).toBe("do zrobienia 2 rzeczy");
    expect(zdanieDoZrobienia(5)).toBe("do zrobienia 5 rzeczy");
  });
});
