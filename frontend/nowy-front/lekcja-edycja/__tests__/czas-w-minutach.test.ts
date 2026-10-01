import { describe, expect, it } from "vitest";
import type { LekcjaAdmin } from "../dane";
import { cialoZapisu, formularzZLekcji, walidujLokalnie } from "../formularz";
import { minutyZSekund } from "@/nowy-front/wspolne/minuty";
import { tematyDrzewa, type Uklad } from "@/nowy-front/kurs-tematy/uklad";

/**
 * Czas trwania lekcji: osoba widzi i wpisuje MINUTY, serwer dostaje sekundy
 * (`duration_seconds`). Odczyt zaokrągla w górę, wysyłka mnoży przez 60, a
 * wartość, której osoba nie zmieniła, wraca do serwera w pierwotnych sekundach
 * — zapis samego tytułu nie zmienia czasu lekcji.
 */

function lekcja(sekundy: number): LekcjaAdmin {
  return {
    id: 21,
    course_id: 4,
    title: "Wprowadzenie",
    description: null,
    content: null,
    sequence_order: 1,
    topic_id: 7,
    topic_position: 1,
    video_provider_id: null,
    duration_seconds: sekundy,
    materials_count: 0,
    created_at: null,
    updated_at: null,
  };
}

const pola = (duration: string) => ({ title: "T", description: "", content: "", duration });

describe("minuty z sekund — jedna funkcja dla formularza i nagłówka tematu", () => {
  it.each([
    [1500, 25],
    [1530, 26],
    [0, 0],
    [59, 1],
    [60, 1],
    [61, 2],
  ])("%i s → %i min (w górę)", (sekundy, minuty) => {
    expect(minutyZSekund(sekundy)).toBe(minuty);
  });

  it("formularz lekcji pokazuje minuty tą funkcją", () => {
    expect(formularzZLekcji(lekcja(1500)).duration).toBe("25");
    expect(formularzZLekcji(lekcja(1530)).duration).toBe("26");
    expect(formularzZLekcji(lekcja(0)).duration).toBe("0");
    expect(formularzZLekcji(lekcja(59)).duration).toBe("1");
  });

  it("wiersz drzewa kursu pokazuje minuty tą samą funkcją", () => {
    const uklad: Uklad = { tematy: [{ id: 7, tytul: "Wprowadzenie", lekcje: [21] }], tytulyLekcji: { 21: "Wprowadzenie" } };
    const drzewo = tematyDrzewa(uklad, uklad, [{ ...lekcja(1530), course_id: 4 }]);
    expect(drzewo[0].lekcje[0].czasMin).toBe(26);
  });
});

describe("wysyłka czasu lekcji", () => {
  it("minuty × 60", () => {
    expect(cialoZapisu(pola("25")).duration_seconds).toBe(1500);
    expect(cialoZapisu(pola("0")).duration_seconds).toBe(0);
  });

  it("wartość niezmieniona przez osobę wraca w pierwotnych sekundach", () => {
    const pierwotna = lekcja(1530);
    const formularz = { ...formularzZLekcji(pierwotna), title: "Nowy tytuł" };

    expect(cialoZapisu(formularz, pierwotna).duration_seconds).toBe(1530);
  });

  it("wartość zmieniona idzie jako minuty × 60", () => {
    const pierwotna = lekcja(1530);

    expect(cialoZapisu({ ...formularzZLekcji(pierwotna), duration: "27" }, pierwotna).duration_seconds).toBe(1620);
  });
});

describe("błędy pola czasu wykrywane przed wysyłką", () => {
  it.each([["2.5"], ["2,5"], ["-3"], [""], ["   "], ["abc"]])("„%s” → komunikat pola", (wartosc) => {
    expect(walidujLokalnie(pola(wartosc)).duration).toBe("Podaj czas trwania w pełnych minutach, 0 albo więcej.");
  });

  it.each([["0"], ["25"], [" 7 "]])("„%s” jest poprawne", (wartosc) => {
    expect(walidujLokalnie(pola(wartosc))).toEqual({});
  });
});
