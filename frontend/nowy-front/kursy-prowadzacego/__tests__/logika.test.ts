import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/klient";
import type { KursProwadzacego } from "../dane";
import { adresKursu, czyBrakUprawnien, opisPozycji, wierszeKursow } from "../logika";

function blad(status: number, code: string) {
  return new ApiError({ status, code, message: "komunikat" });
}

describe("czyBrakUprawnien", () => {
  it.each([
    [blad(401, "unauthenticated"), true],
    [blad(403, "forbidden"), true],
    [blad(403, "access_expired"), false],
    [blad(404, "not_found"), false],
    [blad(500, "unknown_error"), false],
    [new TypeError("Failed to fetch"), false],
  ])("%s → %s", (wejscie, oczekiwane) => {
    expect(czyBrakUprawnien(wejscie)).toBe(oczekiwane);
  });
});

describe("wiersze kursów", () => {
  const KURSY = [
    { id: 3, slug: "wywiad", title: "Wywiad psychologiczny", sequence_order: 2 },
    { id: 9, slug: "zywo", title: "Dyżur w praktyce", sequence_order: null },
  ] satisfies KursProwadzacego[];

  it("adres kursu to istniejąca strona kursu prowadzącego", () => {
    expect(adresKursu(3)).toBe("/prowadzacy/kursy/3");
  });

  it("opis pozycji: numer w programie albo informacja o braku kolejności", () => {
    expect(opisPozycji(2)).toBe("Kurs 2 w programie");
    expect(opisPozycji(null)).toBe("Poza kolejnością programu");
  });

  it("wiersz: tytuł kursu, opis pozycji i akcja „Otwórz kurs” jako odnośnik", () => {
    expect(wierszeKursow(KURSY).map((wiersz) => [wiersz.id, wiersz.tytul, wiersz.podpowiedz, wiersz.akcja])).toEqual([
      ["3", "Wywiad psychologiczny", "Kurs 2 w programie", { etykieta: "Otwórz kurs", href: "/prowadzacy/kursy/3" }],
      ["9", "Dyżur w praktyce", "Poza kolejnością programu", { etykieta: "Otwórz kurs", href: "/prowadzacy/kursy/9" }],
    ]);
  });

  it("zero kursów daje zero wierszy", () => {
    expect(wierszeKursow([])).toEqual([]);
  });
});
