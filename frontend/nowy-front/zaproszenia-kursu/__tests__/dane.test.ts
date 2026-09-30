import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/klient";
import {
  etykietaTypuKursu,
  identyfikatorKursu,
  klasyfikujBlad,
  komunikatyWyboru,
  kursPozaKolejnoscia,
  nazwaOsoby,
  zdanieOZaproszonych,
} from "../dane";

function blad(status: number, code: string, reszta: Record<string, unknown> = {}) {
  return new ApiError({ status, code, message: "Komunikat serwera.", ...reszta });
}

describe("identyfikatorKursu i reguła kursu", () => {
  it("przyjmuje wyłącznie liczby", () => {
    expect(identyfikatorKursu("7")).toBe(7);
    expect(identyfikatorKursu("abc")).toBeNull();
    expect(identyfikatorKursu("7a")).toBeNull();
    expect(identyfikatorKursu("")).toBeNull();
  });

  it("zaprosić można na kurs bez miejsca w kolejności, niezależnie od typu", () => {
    expect(kursPozaKolejnoscia({ sequence_order: null })).toBe(true);
    expect(kursPozaKolejnoscia({ sequence_order: 3 })).toBe(false);
    expect(kursPozaKolejnoscia({ sequence_order: 0 })).toBe(false);
  });

  it("etykiety typu ze słownika", () => {
    expect(etykietaTypuKursu("webinar")).toBe("Spotkanie na żywo w internecie");
    expect(etykietaTypuKursu("course")).toBe("Kurs");
  });
});

describe("zdanieOZaproszonych", () => {
  it.each([
    [1, "Zaproszono 1 osobę."],
    [2, "Zaproszono 2 osoby."],
    [4, "Zaproszono 4 osoby."],
    [5, "Zaproszono 5 osób."],
    [12, "Zaproszono 12 osób."],
    [22, "Zaproszono 22 osoby."],
    [0, "Zaproszono 0 osób."],
  ])("%i → %s", (liczba, zdanie) => {
    expect(zdanieOZaproszonych(liczba)).toBe(zdanie);
  });
});

describe("klasyfikujBlad", () => {
  it("401 i 403 to odmowa, 404 brak kursu, 422 pola albo warunki, reszta błąd", () => {
    expect(klasyfikujBlad(blad(401, "unauthenticated")).rodzaj).toBe("brak-uprawnien");
    expect(klasyfikujBlad(blad(403, "forbidden")).rodzaj).toBe("brak-uprawnien");
    expect(klasyfikujBlad(blad(404, "not_found")).rodzaj).toBe("nie-znaleziono");
    expect(klasyfikujBlad(blad(422, "conditions_not_met"))).toEqual({
      rodzaj: "warunki",
      komunikat: "Komunikat serwera.",
    });
    expect(klasyfikujBlad(blad(422, "validation_failed", { errors: { user_ids: ["x"] } }))).toEqual({
      rodzaj: "walidacja",
      pola: { user_ids: ["x"] },
    });
    expect(klasyfikujBlad(blad(500, "unknown_error")).rodzaj).toBe("blad");
    expect(klasyfikujBlad(new Error("sieć")).rodzaj).toBe("blad");
  });

  it("komunikatyWyboru zbiera user_ids i user_ids.N bez powtórzeń", () => {
    const zapis = klasyfikujBlad(
      blad(422, "validation_failed", {
        errors: { user_ids: ["Wskaż co najmniej jedną osobę."], "user_ids.0": ["Nie znaleziono wskazanej osoby."], "user_ids.1": ["Nie znaleziono wskazanej osoby."], inne: ["x"] },
      }),
    );
    expect(komunikatyWyboru(zapis)).toEqual(["Wskaż co najmniej jedną osobę.", "Nie znaleziono wskazanej osoby."]);
    expect(komunikatyWyboru(null)).toEqual([]);
  });

  it("nazwaOsoby łączy imię i nazwisko", () => {
    expect(nazwaOsoby({ first_name: "Marta", last_name: "Kowalska" })).toBe("Marta Kowalska");
  });
});
