import { describe, expect, it } from "vitest";
import {
  brakZdarzenWOkresie,
  godziny,
  liczbaStron,
  liczbyGlowne,
  opisOkresu,
  opisZestawienia,
  pozostaleLiczby,
  stronaZestawienia,
  walidujOkres,
  wierszZestawienia,
  ZDANIE_O_DATACH,
} from "../logika";
import { osoba, pustyRok, raport } from "./atrapy";

describe("okres", () => {
  it("koniec przed początkiem to błąd; ten sam dzień, brak jednej daty albo obu — w porządku", () => {
    expect(walidujOkres("2026-03-31", "2026-03-01")).toBe("Data końca nie może być wcześniejsza niż data początku.");
    expect(walidujOkres("2026-03-01", "2026-03-01")).toBeNull();
    expect(walidujOkres("", "2026-03-01")).toBeNull();
    expect(walidujOkres("2026-03-01", "")).toBeNull();
    expect(walidujOkres("", "")).toBeNull();
  });

  it("zdanie o zastosowanym okresie ze wspólnego formatera dat", () => {
    expect(opisOkresu({ from: "2026-03-01", to: "2026-03-31" })).toBe("Liczby za okres od 1 marca 2026 do 31 marca 2026.");
    expect(opisOkresu({ from: "2026-03-01", to: null })).toBe("Liczby za okres od 1 marca 2026.");
    expect(opisOkresu({ from: null, to: "2026-03-31" })).toBe("Liczby za okres do 31 marca 2026.");
    expect(opisOkresu({ from: null, to: null })).toBe("Liczby bez zawężenia dat.");
  });

  it("zdanie o datach nazywa liczby zawężane datami i stan dziś", () => {
    expect(ZDANIE_O_DATACH).toMatch(/godziny dyżurów/);
    expect(ZDANIE_O_DATACH).toMatch(/konsultacje/);
    expect(ZDANIE_O_DATACH).toMatch(/stan na dziś/);
  });

  it("okres bez zdarzeń: zawężony datami i zero godzin oraz konsultacji", () => {
    const bezZdarzen = raport({ period: { from: "2025-01-01", to: "2025-01-31" }, program: { ...raport().program, hours_accepted_total: "0", consultations_total: 0 } });
    expect(brakZdarzenWOkresie(bezZdarzen)).toBe(true);
    expect(brakZdarzenWOkresie(raport())).toBe(false);
    expect(brakZdarzenWOkresie(pustyRok())).toBe(false);
  });
});

describe("listy liczb", () => {
  it("najważniejsze liczby w kolejności z ekranu, godziny jako „godz.”, nigdy „h”", () => {
    expect(liczbyGlowne(raport())).toEqual([
      { nazwa: "W programie (konto aktywne)", wartosc: "3" },
      { nazwa: "Ukończyli program", wartosc: "1" },
      { nazwa: "Osoby z zaliczonym testem", wartosc: "1 z 3" },
      { nazwa: "Certyfikaty wydane (bez unieważnionych)", wartosc: "1" },
      { nazwa: "Godziny dyżurów", wartosc: "21,5 godz." },
      { nazwa: "Średnio na wolontariusza", wartosc: "7,2 godz." },
    ]);
    expect(godziny("72")).toBe("72 godz.");
  });

  it("pozostałe liczby z jednym wierszem studentów i odmianą", () => {
    expect(pozostaleLiczby(raport())).toEqual([
      { nazwa: "Przyjęci do programu (zgłoszenia przyjęte)", wartosc: "4" },
      { nazwa: "Konsultacje na dyżurach", wartosc: "15" },
      { nazwa: "Studenci", wartosc: "2 osoby z kontem aktywnym, ukończyli program: 1" },
    ]);
    expect(pozostaleLiczby(raport({ students: { active: 1, completed: 0 } }))[2].wartosc).toBe("1 osoba z kontem aktywnym, ukończyli program: 0");
    expect(pozostaleLiczby(raport({ students: { active: 5, completed: 2 } }))[2].wartosc).toBe("5 osób z kontem aktywnym, ukończyli program: 2");
  });
});

describe("zestawienie", () => {
  it("wiersz wolontariusza: rola, kursy, staż i superwizje „ile z ilu”, warsztat z datą, karta osoby", () => {
    expect(wierszZestawienia(osoba({ workshop_completed_at: "2026-09-18T10:00:00Z" }))).toEqual({
      id: 101,
      nazwa: "Marta Demo",
      rola: "Wolontariusz",
      kursy: "8 z 10",
      staz: "41,5 z 72 godz.",
      superwizje: "5 z 6",
      warsztat: "zaliczony 18 września 2026",
      href: "/admin/uczestniczki/101",
    });
  });

  it("wiersz studenta: staż i superwizje „nie dotyczy”; warsztat bez daty „nie zaliczony”", () => {
    const wiersz = wierszZestawienia(osoba({ role: "student", internship: null, supervision: null }));
    expect(wiersz.rola).toBe("Student");
    expect(wiersz.staz).toBe("nie dotyczy");
    expect(wiersz.superwizje).toBe("nie dotyczy");
    expect(wiersz.warsztat).toBe("nie zaliczony");
  });

  it("stronicowanie po 25 osób, strona spoza zakresu przycięta", () => {
    const lista = Array.from({ length: 30 }, (_, i) => i);
    expect(liczbaStron(0)).toBe(1);
    expect(liczbaStron(25)).toBe(1);
    expect(liczbaStron(26)).toBe(2);
    expect(stronaZestawienia(lista, 1)).toHaveLength(25);
    expect(stronaZestawienia(lista, 2)).toEqual([25, 26, 27, 28, 29]);
    expect(stronaZestawienia(lista, 9)).toEqual([25, 26, 27, 28, 29]);
  });

  it("podpis zestawienia z odmianą", () => {
    expect(opisZestawienia(1)).toBe("Wolontariusze i studenci roku programu: 1 osoba.");
    expect(opisZestawienia(4)).toBe("Wolontariusze i studenci roku programu: 4 osoby.");
    expect(opisZestawienia(12)).toBe("Wolontariusze i studenci roku programu: 12 osób.");
  });
});
