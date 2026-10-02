import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/klient";
import type { SupervisorAssignmentToManyResponse } from "@/lib/api/przypisanie-prowadzacego";
import type { WierszOsoby, WybranaOsoba } from "../dane";
import {
  PUSTY_WYBOR,
  SCIEZKA_DZIENNIKA,
  liczbaZmian,
  ponadLimit,
  powodNiepowodzenia,
  przelacz,
  rodzajBleduPrzypisania,
  wszystkieNaStronie,
  wyborPoPrzypisaniu,
  wynikPrzypisania,
  zaznaczStrone,
  zdanieBezZmian,
  zdanieLimitu,
  zdanieWyniku,
  zdanieZmiany,
  type Wybor,
} from "../wybor";

/**
 * Zaznaczenie osób do przypisania prowadzącego i zdania ekranu: odmiana
 * liczebników wspólnym `odmien`, wynik przypisania z odpowiedzi serwera,
 * zaznaczenie po przypisaniu.
 */

const JOANNA = { id: 5, name: "Joanna Demo" };
const EWA = { id: 6, name: "Ewa Demo" };

function osoba(id: number, prowadzacy: WybranaOsoba["prowadzacy"] = null): WybranaOsoba {
  return { id, nazwa: `Marta Demo${id}`, prowadzacy };
}

function wiersz(id: number, doWyboru = true): WierszOsoby {
  return {
    id,
    nazwa: `Marta Demo${id}`,
    email: `osoba${id}@demo.pl`,
    rola: doWyboru ? "Wolontariusz" : "Student",
    prowadzacy: "brak",
    plakietka: { wariant: "ok", tekst: "konto aktywne" },
    akcja: { etykieta: "Otwórz", etykietaDostepna: `Otwórz kartę: Marta Demo${id}`, href: `/admin/uczestniczki/${id}` },
    doWyboru,
    wybor: osoba(id),
  };
}

function wyborZ(...osoby: WybranaOsoba[]): Wybor {
  return osoby.reduce((wynik, o) => przelacz(wynik, o, true), PUSTY_WYBOR);
}

function odpowiedz(wyniki: SupervisorAssignmentToManyResponse["results"]): SupervisorAssignmentToManyResponse {
  return {
    supervisor_id: 5,
    results: wyniki,
    summary: { requested: wyniki.length, assigned: 0, unchanged: 0, refused: 0, not_found: 0 },
  };
}

describe("Osoby — zaznaczenie", () => {
  it("przełączenie dokłada i zdejmuje osobę, nie zmieniając poprzedniego zaznaczenia", () => {
    const jeden = przelacz(PUSTY_WYBOR, osoba(17), true);
    const dwa = przelacz(jeden, osoba(18), true);
    expect([...dwa.keys()]).toEqual([17, 18]);
    expect([...przelacz(dwa, osoba(17), false).keys()]).toEqual([18]);
    expect(jeden.size).toBe(1);
    expect(PUSTY_WYBOR.size).toBe(0);
  });

  it("„Zaznacz wszystkie na tej stronie” bierze tylko osoby do wyboru z tej strony i zostawia osoby z innych stron", () => {
    const zInnejStrony = wyborZ(osoba(42));
    const strona = [wiersz(17), wiersz(18, false), wiersz(19)];
    const zaznaczone = zaznaczStrone(zInnejStrony, strona, true);
    expect([...zaznaczone.keys()].sort()).toEqual([17, 19, 42]);
    expect(wszystkieNaStronie(zaznaczone, strona)).toBe(true);
    expect([...zaznaczStrone(zaznaczone, strona, false).keys()]).toEqual([42]);
  });

  it("strona bez osób do wyboru nigdy nie jest „cała zaznaczona”", () => {
    expect(wszystkieNaStronie(PUSTY_WYBOR, [wiersz(18, false)])).toBe(false);
    expect(wszystkieNaStronie(wyborZ(osoba(17)), [wiersz(17), wiersz(19)])).toBe(false);
  });

  it("limit jednego przypisania: 100 osób przechodzi, ponad limit zdanie mówi, ile odznaczyć", () => {
    const sto = wyborZ(...Array.from({ length: 100 }, (_, i) => osoba(i + 1)));
    expect(ponadLimit(sto)).toBe(0);
    expect(zdanieLimitu(sto)).toBeNull();
    expect(zdanieLimitu(przelacz(sto, osoba(101), true))).toBe(
      "Jednym przypisaniem obejmiesz najwyżej 100 osób. Odznacz 1 osobę.",
    );
    const sto3 = wyborZ(...Array.from({ length: 103 }, (_, i) => osoba(i + 1)));
    expect(zdanieLimitu(sto3)).toBe("Jednym przypisaniem obejmiesz najwyżej 100 osób. Odznacz 3 osoby.");
    const sto5 = wyborZ(...Array.from({ length: 105 }, (_, i) => osoba(i + 1)));
    expect(zdanieLimitu(sto5)).toBe("Jednym przypisaniem obejmiesz najwyżej 100 osób. Odznacz 5 osób.");
  });
});

describe("Osoby — zdanie o zmianie prowadzącego", () => {
  const wybor = wyborZ(osoba(17), osoba(18, EWA), osoba(20, JOANNA));

  it("bez wybranego prowadzącego nie ma zdania", () => {
    expect(liczbaZmian(wybor, null)).toBe(0);
    expect(zdanieZmiany(wybor, null)).toBeNull();
  });

  it("liczy tylko osoby z innym, dotychczasowym prowadzącym — nie osoby bez prowadzącego ani z tym samym", () => {
    expect(liczbaZmian(wybor, JOANNA.id)).toBe(1);
    expect(liczbaZmian(wybor, EWA.id)).toBe(1);
    expect(liczbaZmian(wybor, 7)).toBe(2);
    expect(zdanieZmiany(wyborZ(osoba(17)), 7)).toBeNull();
  });

  it("jedna osoba: zdanie w liczbie pojedynczej", () => {
    expect(zdanieZmiany(wybor, JOANNA.id)).toBe(
      "U 1 osoby zmieni się prowadzący. Poprzedni prowadzący straci dostęp do rozmowy z tą osobą; zobaczy ona starą rozmowę tylko do odczytu.",
    );
  });

  it.each([
    [2, "U 2 osób"],
    [5, "U 5 osób"],
    [12, "U 12 osób"],
    [22, "U 22 osób"],
  ])("%i osób: dopełniacz liczby mnogiej", (liczba, poczatek) => {
    const zProwadzacym = wyborZ(...Array.from({ length: liczba }, (_, i) => osoba(i + 1, EWA)));
    expect(zdanieZmiany(zProwadzacym, JOANNA.id)).toBe(
      `${poczatek} zmieni się prowadzący. Poprzedni prowadzący straci dostęp do rozmowy z tymi osobami; każda z nich zobaczy starą rozmowę tylko do odczytu.`,
    );
  });
});

describe("Osoby — wynik przypisania", () => {
  const wybor = wyborZ(osoba(17), osoba(18), osoba(20, JOANNA), osoba(21));
  const czesciowy = wynikPrzypisania(
    odpowiedz([
      { user_id: 17, result: "assigned", reason: null },
      { user_id: 18, result: "refused", reason: "role_not_assignable" },
      { user_id: 20, result: "unchanged", reason: null },
      { user_id: 21, result: "not_found", reason: null },
    ]),
    wybor,
  );

  it("udane to przypisane i bez zmian; nieudane mają nazwę z zaznaczenia i prosty powód", () => {
    expect(czesciowy).toEqual({
      udane: 2,
      bezZmian: 1,
      wszystkie: 4,
      nieudane: [
        { id: 18, nazwa: "Marta Demo18", powod: "prowadzącego można przypisać tylko osobie z rolą „Wolontariusz”" },
        { id: 21, nazwa: "Marta Demo21", powod: "nie znaleziono tej osoby — konto mogło zostać usunięte" },
      ],
    });
    expect(zdanieWyniku(czesciowy)).toBe("Przypisano 2 z 4 osób.");
    expect(zdanieBezZmian(czesciowy)).toBe("1 z nich miała już tego prowadzącego.");
  });

  it("w zaznaczeniu zostają wyłącznie osoby, których nie udało się przypisać", () => {
    expect([...wyborPoPrzypisaniu(wybor, czesciowy).keys()]).toEqual([18, 21]);
  });

  it("odmiana: „z 1 osoby”, „z 2 osób”; „miała / miały / miało”", () => {
    const jeden = wynikPrzypisania(odpowiedz([{ user_id: 17, result: "assigned", reason: null }]), wybor);
    expect(zdanieWyniku(jeden)).toBe("Przypisano 1 z 1 osoby.");
    expect(zdanieBezZmian(jeden)).toBeNull();
    const bezZmian = (liczba: number) =>
      zdanieBezZmian({ udane: liczba, bezZmian: liczba, wszystkie: liczba, nieudane: [] });
    expect(bezZmian(3)).toBe("3 z nich miały już tego prowadzącego.");
    expect(bezZmian(5)).toBe("5 z nich miało już tego prowadzącego.");
  });

  it("osoba spoza zaznaczenia i nieznany powód odmowy nie pokazują kodów serwera", () => {
    const wynik = wynikPrzypisania(odpowiedz([{ user_id: 99, result: "refused", reason: "cos_innego" }]), PUSTY_WYBOR);
    expect(wynik.nieudane).toEqual([{ id: 99, nazwa: "Osoba nr 99", powod: "serwer odmówił przypisania" }]);
    expect(powodNiepowodzenia({ user_id: 1, result: "refused", reason: null })).not.toMatch(/_/);
  });

  it("401 i 403 to brak uprawnień, reszta to błąd serwera", () => {
    const blad = (status: number) => new ApiError({ status, code: "x", message: "m" });
    expect(rodzajBleduPrzypisania(blad(401))).toBe("brak-uprawnien");
    expect(rodzajBleduPrzypisania(blad(403))).toBe("brak-uprawnien");
    expect(rodzajBleduPrzypisania(blad(500))).toBe("serwer");
    expect(rodzajBleduPrzypisania(new TypeError("Failed to fetch"))).toBe("serwer");
  });

  it("dziennik działań to istniejący adres administracji", () => {
    expect(SCIEZKA_DZIENNIKA).toBe("/admin/dziennik");
  });
});
