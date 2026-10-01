import { describe, expect, it } from "vitest";
import { okruszekRamki, type GrupaMenuOkruszka } from "../OkruszekRamki";

/**
 * Reguła okruszka dla ekranu bez własnej pozycji w menu, który ma w rejestrze
 * menu rodzica (`podstrony` pozycji-rodzica): zwykła podstrona z rodzicem,
 * nie „ukryta pozycja”. Rodzic stoi w grupie „Codziennie”, a podstrona i tak
 * ma okruszek.
 */

const PODSTRONY = [
  { etykieta: "Dyżury do decyzji", href: "/admin/staz" },
  { etykieta: "Zgłoszenia rekrutacyjne", href: "/admin/nabor" },
];

function menu(sciezka: string, podstrony = PODSTRONY): GrupaMenuOkruszka[] {
  const pod = podstrony.some((p) => sciezka === p.href || sciezka.startsWith(`${p.href}/`));
  return [
    {
      naglowek: "Codziennie",
      pozycje: [
        { etykieta: "Pulpit", href: "/admin", biezaca: sciezka === "/admin" },
        {
          etykieta: "Sprawy",
          href: "/admin/sprawy",
          biezaca: sciezka === "/admin/sprawy" || sciezka.startsWith("/admin/sprawy/") ? true : pod ? "sekcja" : false,
          podstrony,
        },
        { etykieta: "Uczestnicy", href: "/admin/uczestniczki", biezaca: sciezka.startsWith("/admin/uczestniczki") },
      ],
    },
  ];
}

function lancuch(sciezka: string, okruszki: { etykieta: string; href?: string }[] = [], tytul = "Tytuł ekranu") {
  return okruszekRamki({ menu: menu(sciezka), sciezka, okruszki, tytul }).map((p) => [p.etykieta, p.href ?? null]);
}

describe("okruszek podstrony z rodzicem w rejestrze", () => {
  it("Dyżury do decyzji: Administracja › Sprawy › Dyżury do decyzji (rodzic i korzeń jako łącza, bieżąca bez łącza)", () => {
    expect(lancuch("/admin/staz", [{ etykieta: "Administracja" }, { etykieta: "Dyżury" }])).toEqual([
      ["Administracja", "/admin"],
      ["Sprawy", "/admin/sprawy"],
      ["Dyżury do decyzji", null],
    ]);
  });

  it("Zgłoszenia rekrutacyjne: Administracja › Sprawy › Zgłoszenia rekrutacyjne, nazwa pozycji z rejestru, nie z ekranu", () => {
    expect(lancuch("/admin/nabor", [{ etykieta: "Administracja" }, { etykieta: "Zgłoszenia" }])).toEqual([
      ["Administracja", "/admin"],
      ["Sprawy", "/admin/sprawy"],
      ["Zgłoszenia rekrutacyjne", null],
    ]);
  });

  it("szczegół: pełny łańcuch Administracja › Sprawy › Zgłoszenia rekrutacyjne › osoba, bez powtórzeń z okruszków ekranu", () => {
    expect(
      lancuch("/admin/nabor/17", [
        { etykieta: "Administracja" },
        { etykieta: "Sprawy" },
        { etykieta: "Zgłoszenia rekrutacyjne", href: "/admin/nabor" },
        { etykieta: "Anna Kandydat" },
      ]),
    ).toEqual([
      ["Administracja", "/admin"],
      ["Sprawy", "/admin/sprawy"],
      ["Zgłoszenia rekrutacyjne", "/admin/nabor"],
      ["Anna Kandydat", null],
    ]);
  });

  it("szczegół bez okruszków ekranu: bieżąca to tytuł", () => {
    expect(lancuch("/admin/staz/4", [], "Dyżur z 27 sierpnia")).toEqual([
      ["Administracja", "/admin"],
      ["Sprawy", "/admin/sprawy"],
      ["Dyżury do decyzji", "/admin/staz"],
      ["Dyżur z 27 sierpnia", null],
    ]);
  });

  it("rodzic „Sprawy” na własnej liście (pozycja z „Codziennie”) nadal nie ma okruszka", () => {
    expect(lancuch("/admin/sprawy")).toEqual([]);
  });

  it("kontrola dodatnia: bez wpisu w rejestrze ekran nie jest podstroną (ścieżka spoza menu składa się z okruszków ekranu)", () => {
    const sciezka = "/admin/staz";
    const wynik = okruszekRamki({
      menu: menu(sciezka, []),
      sciezka,
      okruszki: [{ etykieta: "Administracja" }, { etykieta: "Dyżury" }],
      tytul: "Dyżury",
    });
    expect(wynik.map((p) => p.etykieta)).toEqual(["Administracja", "Dyżury"]);
    expect(wynik.map((p) => p.etykieta)).not.toContain("Sprawy");
  });

  it("adres o tym samym początku nie jest podstroną", () => {
    const sciezka = "/admin/naborx";
    const wynik = okruszekRamki({ menu: menu(sciezka), sciezka, okruszki: [], tytul: "Inny" });
    expect(wynik.map((p) => p.etykieta)).not.toContain("Sprawy");
  });
});
