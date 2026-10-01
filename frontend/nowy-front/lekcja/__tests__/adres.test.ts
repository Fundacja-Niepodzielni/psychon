import { describe, expect, it } from "vitest";
import { adresLekcji, kursZAdresu } from "../adres";

describe("kursZAdresu — kurs z parametru ?kurs=", () => {
  it("przyjmuje slug złożony z małych liter, cyfr i myślników", () => {
    expect(kursZAdresu("wywiad-psychologiczny")).toBe("wywiad-psychologiczny");
    expect(kursZAdresu("etap-2")).toBe("etap-2");
  });

  it.each([
    ["brak parametru", null],
    ["puste", ""],
    ["wielkie litery", "Wywiad"],
    ["ukośnik", "kurs/../me"],
    ["znak zapytania", "kurs?x=1"],
    ["spacja", "kurs jeden"],
    ["polski znak", "wywiąd"],
    ["nowa linia na końcu", "kurs\n"],
    ["podkreślenie", "kurs_1"],
  ])("odrzuca zły kształt: %s", (_opis, wartosc) => {
    expect(kursZAdresu(wartosc)).toBeNull();
  });
});

describe("adresLekcji — link do lekcji w panelu uczestnika", () => {
  it("z poprawnym slugiem dopisuje ?kurs=", () => {
    expect(adresLekcji(21, "wywiad-psychologiczny")).toBe("/panel/lekcje/21?kurs=wywiad-psychologiczny");
  });

  it("bez sluga albo ze złym slugiem zostaje sam adres lekcji", () => {
    expect(adresLekcji(21)).toBe("/panel/lekcje/21");
    expect(adresLekcji(21, null)).toBe("/panel/lekcje/21");
    expect(adresLekcji(21, "Zły Slug")).toBe("/panel/lekcje/21");
  });
});
