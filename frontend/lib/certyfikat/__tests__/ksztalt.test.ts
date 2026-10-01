import { describe, expect, it } from "vitest";
import {
  czyNumerCertyfikatu,
  czyTokenCertyfikatu,
  sciezkaWeryfikacjiNumeru,
  sciezkaWeryfikacjiTokenu,
} from "@/lib/certyfikat/ksztalt";

// Jawnie sztuczna wartość o długości tokenu z kodu QR (40 liter i cyfr), zbudowana
// z powtórzenia krótkiego wzoru — nie jest odczytem żadnego prawdziwego tokenu.
const TOKEN_40 = "Test0".repeat(8);

describe("czyNumerCertyfikatu", () => {
  it.each(["NP/2026/001", "NP/2026/017", "NP/2026/999", "NP/2026/1000", "NP/1999/00001"])(
    "przyjmuje numer %s",
    (numer) => {
      expect(czyNumerCertyfikatu(numer)).toBe(true);
    },
  );

  it.each([
    ["pusty", ""],
    ["bez prefiksu", "2026/001"],
    ["małe litery", "np/2026/001"],
    ["rok z trzech cyfr", "NP/202/001"],
    ["rok z pięciu cyfr", "NP/20266/001"],
    ["numer kolejny z dwóch cyfr", "NP/2026/01"],
    ["numer kolejny z literą", "NP/2026/00a"],
    ["ukośnik na końcu", "NP/2026/001/"],
    ["segment wsteczny na końcu", "NP/2026/017/.."],
    ["segment wsteczny w środku", "NP/2026/017/../../me"],
    ["rodzic zamiast numeru", "../me"],
    ["zakodowany ukośnik", "NP%2F2026%2F001"],
    ["ukośnik wsteczny", "NP\\2026\\001"],
    ["znak nowego wiersza na końcu", "NP/2026/001\n"],
    ["spacja na początku", " NP/2026/001"],
    ["spacja na końcu", "NP/2026/001 "],
    ["cyfry spoza ASCII", "NP/２０２６/００１"],
    ["zapytanie doklejone do numeru", "NP/2026/001?x=1"],
  ])("odrzuca: %s", (_nazwa, wartosc) => {
    expect(czyNumerCertyfikatu(wartosc)).toBe(false);
  });
});

describe("czyTokenCertyfikatu", () => {
  it("przyjmuje dokładnie 40 liter i cyfr", () => {
    expect(TOKEN_40).toHaveLength(40);
    expect(czyTokenCertyfikatu(TOKEN_40)).toBe(true);
    expect(czyTokenCertyfikatu("0".repeat(40))).toBe(true);
  });

  it.each([
    ["pusty", ""],
    ["kropki", ".."],
    ["39 znaków", TOKEN_40.slice(0, 39)],
    ["41 znaków", `${TOKEN_40}a`],
    ["40 znaków z ukośnikiem", `${"a".repeat(20)}/${"a".repeat(19)}`],
    ["40 znaków z ukośnikiem wstecznym", `${"a".repeat(20)}\\${"a".repeat(19)}`],
    ["40 znaków z kropką", `${"a".repeat(20)}.${"a".repeat(19)}`],
    ["40 znaków ze spacją", `${"a".repeat(20)} ${"a".repeat(19)}`],
    ["40 znaków z %", `${"a".repeat(20)}%${"a".repeat(19)}`],
    ["token ze znakiem nowego wiersza na końcu", `${TOKEN_40}\n`],
    ["litery spoza ASCII", `${"a".repeat(39)}ż`],
  ])("odrzuca: %s", (_nazwa, wartosc) => {
    expect(czyTokenCertyfikatu(wartosc)).toBe(false);
  });

  it("numer certyfikatu nie jest tokenem, a token nie jest numerem", () => {
    expect(czyTokenCertyfikatu("NP/2026/001")).toBe(false);
    expect(czyNumerCertyfikatu(TOKEN_40)).toBe(false);
  });
});

describe("sciezkaWeryfikacjiNumeru", () => {
  it.each([
    ["NP/2026/017", "/verify/NP/2026/017"],
    ["NP/2026/001", "/verify/NP/2026/001"],
    ["NP/2026/1000", "/verify/NP/2026/1000"],
  ])("numer %s → %s (segment po segmencie, bez zakodowanego ukośnika)", (numer, sciezka) => {
    expect(sciezkaWeryfikacjiNumeru(numer)).toBe(sciezka);
    expect(sciezkaWeryfikacjiNumeru(numer)).not.toContain("%2F");
  });

  it.each(["", "../me", "NP/2026/017/..", "NP/2026/017?x=1", "NP/2026/017#x", " NP/2026/017", "NP%2F2026%2F017"])(
    "wartość spoza kształtu %j nie dostaje ścieżki",
    (wartosc) => {
      expect(() => sciezkaWeryfikacjiNumeru(wartosc)).toThrow();
    },
  );

  it("komunikat błędu nie niesie wartości", () => {
    let blad: unknown = null;
    try {
      sciezkaWeryfikacjiNumeru("../tajne");
    } catch (wyjatek) {
      blad = wyjatek;
    }

    expect(blad).toBeInstanceOf(Error);
    expect((blad as Error).message).not.toContain("tajne");
  });
});

describe("sciezkaWeryfikacjiTokenu", () => {
  it("token z 40 znaków → /verify/qr/<token>", () => {
    expect(sciezkaWeryfikacjiTokenu(TOKEN_40)).toBe(`/verify/qr/${TOKEN_40}`);
  });

  it.each(["", "..", TOKEN_40.slice(0, 39), `${TOKEN_40}a`, `${"a".repeat(20)}/${"a".repeat(19)}`])(
    "wartość spoza kształtu %j nie dostaje ścieżki",
    (wartosc) => {
      expect(() => sciezkaWeryfikacjiTokenu(wartosc)).toThrow();
    },
  );
});
