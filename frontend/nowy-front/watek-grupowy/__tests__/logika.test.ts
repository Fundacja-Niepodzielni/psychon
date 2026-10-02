import { describe, expect, it } from "vitest";
import {
  licznikZnakow,
  metaPoDopisaniu,
  nazwaAutora,
  numerOsoby,
  opisOstatniejWiadomosci,
  planPoWyslaniu,
  podpisWiadomosci,
  wierszeWatkow,
  zdanieOStronie,
} from "../logika";
import { WATEK, WATEK_BEZ_WIADOMOSCI, WIADOMOSC_1, WIADOMOSC_BEZ_AUTORA, meta } from "./atrapy";

/**
 * Teksty i reguły ekranu: podpis wiadomości z czytelną datą, „Nieznany nadawca”, numer osoby tylko jako liczba całkowita
 * większa od zera, odmiana liczebników i decyzja, gdzie po wysłaniu ma trafić nowa wiadomość.
 */

describe("wiadomości", () => {
  it("podpis: autor i data po polsku (czas warszawski); bez daty sam autor; bez autora „Nieznany nadawca”", () => {
    expect(podpisWiadomosci(WIADOMOSC_1)).toBe("Kasia Wolna · 1 października 2026, 12:00");
    expect(podpisWiadomosci({ ...WIADOMOSC_1, created_at: null })).toBe("Kasia Wolna");
    expect(nazwaAutora(WIADOMOSC_BEZ_AUTORA)).toBe("Nieznany nadawca");
    expect(podpisWiadomosci(WIADOMOSC_BEZ_AUTORA)).toBe("Nieznany nadawca");
  });

  it("zdanie o stronie i licznik znaków", () => {
    expect(zdanieOStronie(meta({ total: 61, last_page: 3 }), 25)).toBe("Na tej stronie: 25 z 61 wiadomości.");
    expect(licznikZnakow("Cześć", 5000)).toBe("5/5000 znaków");
  });
});

describe("wątki", () => {
  it("opis ostatniej wiadomości: data albo „Brak wiadomości”", () => {
    expect(opisOstatniejWiadomosci(WATEK)).toBe("Ostatnia wiadomość: 1 października 2026, 12:30");
    expect(opisOstatniejWiadomosci(WATEK_BEZ_WIADOMOSCI)).toBe("Brak wiadomości");
  });

  it("wiersz wątku: plakietka „Grupa”, akcja z pełną nazwą i wywołaniem z identyfikatorem wątku", () => {
    let otwarty: number | null = null;
    const [wiersz] = wierszeWatkow([WATEK], (id) => (otwarty = id));
    expect(wiersz).toMatchObject({ tytul: "Wątek grupowy", plakietka: { tekst: "Grupa" }, akcja: { etykieta: "Otwórz wątek", etykietaDostepna: "Otwórz wątek grupowy" } });
    wiersz.akcja.onKliknij?.();
    expect(otwarty).toBe(5);
  });
});

describe("numerOsoby", () => {
  it.each([
    ["12", 12],
    [" 7 ", 7],
    ["", null],
    ["  ", null],
    ["0", null],
    ["-3", null],
    ["2.5", null],
    ["abc", null],
  ])("%j → %j", (tekst, oczekiwany) => {
    expect(numerOsoby(tekst)).toBe(oczekiwany);
  });
});

describe("planPoWyslaniu", () => {
  it("bez informacji o stronicowaniu albo na ostatniej niepełnej stronie wiadomość dopisuje się na koniec", () => {
    expect(planPoWyslaniu(undefined, 3)).toEqual({ rodzaj: "dopisz" });
    expect(planPoWyslaniu(meta({ total: 2 }), 2)).toEqual({ rodzaj: "dopisz" });
    expect(planPoWyslaniu(meta({ total: 30, last_page: 2, current_page: 2 }), 5)).toEqual({ rodzaj: "dopisz" });
  });

  it("na pełnej ostatniej stronie albo nie na ostatniej wczytuje stronę, na której ląduje nowa wiadomość", () => {
    expect(planPoWyslaniu(meta({ total: 25 }), 25)).toEqual({ rodzaj: "wczytaj", strona: 2 });
    expect(planPoWyslaniu(meta({ total: 60, last_page: 3, current_page: 1 }), 25)).toEqual({ rodzaj: "wczytaj", strona: 3 });
  });

  it("metaPoDopisaniu zwiększa liczbę wiadomości o jeden", () => {
    expect(metaPoDopisaniu(meta({ total: 2 }))?.total).toBe(3);
    expect(metaPoDopisaniu(undefined)).toBeUndefined();
  });
});
