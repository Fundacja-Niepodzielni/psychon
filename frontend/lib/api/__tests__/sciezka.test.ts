import { describe, expect, it, vi } from "vitest";
import { sciezka, zapytanie } from "@/lib/api/sciezka";

vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

const { adresApi, NieprawidlowaSciezkaApi } = await import("@/lib/api/klient");

const BAZA = "https://api.example.pl/api/v1";

function zlap(wywolanie: () => unknown): unknown {
  try {
    wywolanie();
  } catch (wyjatek) {
    return wyjatek;
  }
  return null;
}

describe("sciezka — każda wstawiana wartość jest kodowana, stałe części zostają", () => {
  it("zwykłe wartości przechodzą bez zmian", () => {
    expect(sciezka`/lessons/${7}/progress`).toBe("/lessons/7/progress");
    expect(sciezka`/courses/${"wywiad-psychologiczny"}`).toBe("/courses/wywiad-psychologiczny");
  });

  it("ścieżka bez wartości jest tą samą stałą", () => {
    expect(sciezka`/me`).toBe("/me");
  });

  it("znak zapytania w wartości nie zamienia reszty ścieżki w zapytanie", () => {
    expect(sciezka`/lessons/${"7?"}/complete`).toBe("/lessons/7%3F/complete");
    expect(sciezka`/lessons/${"7?role=admin"}/complete`).toBe("/lessons/7%3Frole%3Dadmin/complete");
  });

  it("krzyżyk w wartości nie obcina ścieżki fragmentem", () => {
    expect(sciezka`/lessons/${"7#"}/progress`).toBe("/lessons/7%23/progress");
  });

  it("ukośnik w wartości nie dokłada segmentów", () => {
    expect(sciezka`/verify/${"NP/2026/017"}`).toBe("/verify/NP%2F2026%2F017");
  });

  it("ukośnik wsteczny, procent, ampersand, spacja i polskie litery są kodowane", () => {
    expect(sciezka`/a/${"x\\y"}`).toBe("/a/x%5Cy");
    expect(sciezka`/a/${"50%"}`).toBe("/a/50%25");
    expect(sciezka`/a/${"a&b=c"}`).toBe("/a/a%26b%3Dc");
    expect(sciezka`/a/${"raport Q3"}`).toBe("/a/raport%20Q3");
    expect(sciezka`/a/${"zażółć"}`).toBe("/a/za%C5%BC%C3%B3%C5%82%C4%87");
  });

  it("znak nowego wiersza i tabulacja w wartości są kodowane", () => {
    expect(sciezka`/a/${"x\ny\tz"}`).toBe("/a/x%0Ay%09z");
  });

  it("stałe `?` w szablonie zostaje, a wartość za nim jest kodowana", () => {
    expect(sciezka`/search?q=${"a&b#c"}`).toBe("/search?q=a%26b%23c");
  });

  it("wiele wartości, każda kodowana osobno, kolejność zachowana", () => {
    expect(sciezka`/verify/${"NP"}/${"2026"}/${"017"}`).toBe("/verify/NP/2026/017");
    expect(sciezka`/a/${"x/y"}/b/${"?"}`).toBe("/a/x%2Fy/b/%3F");
  });

  it("kodowanie samo nie czyni `..` bezpieczną wartością — odrzuca ją kontrola w kliencie", () => {
    const sciezkaZKropkami = sciezka`/lessons/${".."}/progress`;

    expect(sciezkaZKropkami).toBe("/lessons/../progress");
    expect(zlap(() => adresApi(sciezkaZKropkami, BAZA))).toBeInstanceOf(NieprawidlowaSciezkaApi);
  });

  it("wynik dla wartości poprawnych przechodzi kontrolę klienta bez zmiany napisu", () => {
    const wynik = sciezka`/verify/${"NP"}/${"2026"}/${"017"}`;

    expect(adresApi(wynik, BAZA)).toBe(`${BAZA}/verify/NP/2026/017`);
  });

  it("wartość z ukośnikiem wstawiona jednym `${…}` jest odrzucona przez kontrolę klienta", () => {
    const wynik = sciezka`/verify/${"NP/2026/017"}`;

    expect(zlap(() => adresApi(wynik, BAZA))).toBeInstanceOf(NieprawidlowaSciezkaApi);
  });
});

describe("zapytanie — przez URLSearchParams", () => {
  it("zwraca pusty napis dla pustego zbioru i dla samych pominiętych wartości", () => {
    expect(zapytanie({})).toBe("");
    expect(zapytanie({ a: undefined, b: null })).toBe("");
  });

  it("buduje parametry w kolejności i pomija undefined i null", () => {
    expect(zapytanie({ page: 2, per_page: 25, search: undefined, sort: null })).toBe("?page=2&per_page=25");
  });

  it("koduje znaki, które zmieniłyby zapytanie", () => {
    expect(zapytanie({ q: "a&b=c#d?e" })).toBe("?q=a%26b%3Dc%23d%3Fe");
    expect(zapytanie({ q: "x y" })).toBe("?q=x+y");
    expect(zapytanie({ q: "100%" })).toBe("?q=100%25");
  });

  it("liczby i wartości logiczne są zapisane jako tekst", () => {
    expect(zapytanie({ n: 0, ok: false })).toBe("?n=0&ok=false");
  });

  it("zapytanie dołączone do ścieżki przechodzi kontrolę klienta", () => {
    const adres = `${sciezka`/courses/${"a b"}/lessons`}${zapytanie({ page: 2 })}`;

    expect(adresApi(adres, BAZA)).toBe(`${BAZA}/courses/a%20b/lessons?page=2`);
  });
});
