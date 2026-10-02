import { describe, expect, it } from "vitest";
import { czasKursu, czasLekcji, lekcjeWKolejnosci, licznikLekcji, opisKursu, TYTUL_TEMATU_DOMYSLNEGO, zbudujWidok, zdaniePostepu } from "../logika";
import { kursSzkicu, lekcjeSzkicu, odpowiedzBezTestu, odpowiedzSerwera } from "./atrapy";

describe("opis kursu pod tytułem", () => {
  it("siedem lekcji, około dwóch godzin i test na końcu — jak w szkicu", () => {
    expect(opisKursu(lekcjeSzkicu(0))).toBe("7 lekcji · około 2 godziny · na końcu test");
  });

  it("bez czasu nagrań opis pomija czas", () => {
    const bezCzasu = lekcjeSzkicu(0).map((lekcja) => ({ ...lekcja, duration_seconds: null }));
    expect(opisKursu(bezCzasu)).toBe("7 lekcji · na końcu test");
  });

  it("odmienia liczbę lekcji", () => {
    expect(opisKursu(lekcjeSzkicu(0).slice(0, 1))).toMatch(/^1 lekcja · /);
    expect(opisKursu(lekcjeSzkicu(0).slice(0, 2))).toMatch(/^2 lekcje · /);
    expect(opisKursu(lekcjeSzkicu(0).slice(0, 5))).toMatch(/^5 lekcji · /);
  });

  it("czas poniżej godziny podaje w minutach, od godziny w godzinach", () => {
    expect(czasKursu([{ ...lekcjeSzkicu(0)[0], duration_seconds: 2400 }])).toBe("około 40 min");
    expect(czasKursu([{ ...lekcjeSzkicu(0)[0], duration_seconds: 3600 }])).toBe("około 1 godziny");
    expect(czasKursu([{ ...lekcjeSzkicu(0)[0], duration_seconds: 18000 }])).toBe("około 5 godzin");
    expect(czasKursu([])).toBeNull();
  });

  it("czas lekcji: minuty nagrania, a bez czasu nic", () => {
    expect(czasLekcji(lekcjeSzkicu(0)[0])).toBe("14 min nagrania");
    expect(czasLekcji(lekcjeSzkicu(0)[5])).toBeNull();
    expect(czasLekcji({ ...lekcjeSzkicu(0)[0], duration_seconds: 0 })).toBeNull();
  });

  it("zdania liczników", () => {
    expect(licznikLekcji(2, 4)).toBe("2 z 4 lekcji");
    expect(zdaniePostepu(2, 7)).toBe("2 z 7 lekcji ukończone");
  });
});

describe("kolejność i grupowanie lekcji", () => {
  it("sortuje po sequence_order, a przy remisie po id", () => {
    const [a, b, c] = lekcjeSzkicu(0);
    const wymieszane = [{ ...c, sequence_order: 1, id: 30 }, { ...a, sequence_order: 1, id: 10 }, b];
    expect(lekcjeWKolejnosci(wymieszane).map((lekcja) => lekcja.id)).toEqual([10, 30, b.id]);
  });

  it("dzieli lekcje na tematy z odczytu, z licznikami", () => {
    const widok = zbudujWidok(kursSzkicu({ ukonczone: 5 }));
    expect(widok.tematy.map((temat) => [temat.tytul, temat.ukonczone, temat.razem])).toEqual([
      ["Kryzys i jego przebieg", 4, 4],
      ["Rozmowa wspierająca", 1, 3],
    ]);
  });

  it("lekcje bez tematu (albo z tematem spoza odczytu) trafiają do tematu domyślnego", () => {
    const kurs = kursSzkicu({ ukonczone: 0 });
    kurs.topics = undefined;
    const widok = zbudujWidok(kurs);
    expect(widok.tematy).toHaveLength(1);
    expect(widok.tematy[0].tytul).toBe(TYTUL_TEMATU_DOMYSLNEGO);
    expect(widok.tematy[0].razem).toBe(7);

    const obcy = kursSzkicu({ ukonczone: 0 });
    obcy.lessons = obcy.lessons.map((lekcja, indeks) => (indeks === 6 ? { ...lekcja, topic_id: 999 } : lekcja));
    expect(zbudujWidok(obcy).tematy.map((temat) => [temat.tytul, temat.razem])).toEqual([
      ["Kryzys i jego przebieg", 4],
      ["Rozmowa wspierająca", 2],
      [TYTUL_TEMATU_DOMYSLNEGO, 1],
    ]);
  });

  it("numery lekcji idą przez wszystkie tematy", () => {
    const numery = zbudujWidok(kursSzkicu({ ukonczone: 0 })).tematy.flatMap((temat) => temat.wiersze.map((wiersz) => wiersz.numer));
    expect(numery).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("przycisk główny", () => {
  it("bez ukończonych lekcji: Rozpocznij lekcję 1", () => {
    const { akcja } = zbudujWidok(kursSzkicu({ ukonczone: 0 }));
    expect(akcja).toMatchObject({ rodzaj: "lekcja", etykieta: "Rozpocznij lekcję 1", powod: "„Czym jest kryzys psychiczny”" });
    expect(akcja.rodzaj === "lekcja" && akcja.href).toBe("/panel/lekcje/21?kurs=pierwsza-pomoc-psychologiczna");
  });

  it("po ukończonych lekcjach: Kontynuuj lekcję N z pierwszą nieukończoną", () => {
    expect(zbudujWidok(kursSzkicu({ ukonczone: 2 })).akcja).toMatchObject({ etykieta: "Kontynuuj lekcję 3", powod: "„Rozpoznawanie kryzysu psychicznego”" });
  });

  it("pomija lekcję zamkniętą: prowadzi do pierwszej nieukończonej i otwartej", () => {
    const kurs = kursSzkicu({ ukonczone: 1 });
    kurs.lessons[1].locked = true;
    kurs.lessons[2].locked = false;
    expect(zbudujWidok(kurs).akcja).toMatchObject({ etykieta: "Kontynuuj lekcję 3" });
  });

  it("wszystkie lekcje ukończone: Przejdź do testu i zdanie „Został test”", () => {
    const { akcja } = zbudujWidok(kursSzkicu({ ukonczone: 7 }));
    expect(akcja).toMatchObject({ rodzaj: "test", etykieta: "Przejdź do testu", powod: "Wszystkie lekcje ukończone. Został test." });
    expect(akcja.rodzaj === "test" && akcja.href).toBe("/panel/kursy/pierwsza-pomoc-psychologiczna/test");
  });

  it("wszystkie lekcje ukończone, ale zaplecze trzyma test zamknięty: brak przycisku głównego", () => {
    expect(zbudujWidok(kursSzkicu({ ukonczone: 7, testZamkniety: true })).akcja).toEqual({ rodzaj: "brak" });
  });

  it("kurs ukończony w całości: brak przycisku głównego", () => {
    const widok = zbudujWidok(kursSzkicu({ ukonczone: 7, status: "completed" }));
    expect(widok.akcja).toEqual({ rodzaj: "brak" });
    expect(widok.kursUkonczony).toBe(true);
    expect(widok.test.zdanie).toBe("Test zaliczony.");
  });

  it("kurs bez lekcji: brak przycisku głównego", () => {
    const kurs = kursSzkicu({ ukonczone: 0 });
    kurs.lessons = [];
    const widok = zbudujWidok(kurs);
    expect(widok.akcja).toEqual({ rodzaj: "brak" });
    expect(widok.razem).toBe(0);
    expect(widok.wszystkieUkonczone).toBe(false);
    expect(widok.test.czynny).toBe(false);
  });
});

describe("wiersze lekcji", () => {
  const wiersze = (opcje: Parameters<typeof kursSzkicu>[0]) => zbudujWidok(kursSzkicu(opcje)).tematy.flatMap((temat) => temat.wiersze);

  it("etykiety: Otwórz ponownie · Kontynuuj · Rozpocznij lekcję", () => {
    expect(wiersze({ ukonczone: 2 }).map((wiersz) => wiersz.etykieta)).toEqual([
      "Otwórz ponownie",
      "Otwórz ponownie",
      "Kontynuuj",
      "Rozpocznij lekcję",
      "Rozpocznij lekcję",
      "Rozpocznij lekcję",
      "Rozpocznij lekcję",
    ]);
  });

  it("bez ukończonych lekcji pierwsza lekcja to „Rozpocznij lekcję”, nie „Kontynuuj”", () => {
    expect(wiersze({ ukonczone: 0 })[0].etykieta).toBe("Rozpocznij lekcję");
  });

  it("pole locked rozstrzyga o zamknięciu; brak pola = otwarta", () => {
    const zPolem = wiersze({ ukonczone: 2, zamknieteOd: 4 });
    expect(zPolem.map((wiersz) => wiersz.zamknieta)).toEqual([false, false, false, true, true, true, true]);
    expect(zPolem[3].poLekcji).toBe(3);
    expect(zPolem[0].poLekcji).toBeNull();
    expect(wiersze({ ukonczone: 2 }).some((wiersz) => wiersz.zamknieta)).toBe(false);
  });

  it("ukończona lekcja nie jest zamknięta, nawet gdy odczyt oznaczył ją jako locked", () => {
    const kurs = kursSzkicu({ ukonczone: 2 });
    kurs.lessons[0].locked = true;
    expect(zbudujWidok(kurs).tematy[0].wiersze[0].zamknieta).toBe(false);
  });
});

describe("karta testu", () => {
  it("bez pola test_locked: nieczynna, dopóki nie wszystkie lekcje są ukończone", () => {
    expect(zbudujWidok(kursSzkicu({ ukonczone: 6 })).test).toEqual({ czynny: false, zdanie: "Test odblokuje się, gdy ukończysz wszystkie lekcje. Zostało: 1." });
    expect(zbudujWidok(kursSzkicu({ ukonczone: 7 })).test).toEqual({ czynny: true, zdanie: "Możesz już podejść do testu. Po zaliczeniu dostaniesz zaświadczenie." });
  });

  it("pole test_locked, gdy jest, ma pierwszeństwo przed liczeniem z lekcji", () => {
    expect(zbudujWidok(kursSzkicu({ ukonczone: 7, testZamkniety: false })).test.czynny).toBe(true);
    expect(zbudujWidok(kursSzkicu({ ukonczone: 7, testZamkniety: true })).test.czynny).toBe(false);
    expect(zbudujWidok(kursSzkicu({ ukonczone: 2, testZamkniety: false })).test.czynny).toBe(true);
    expect(zbudujWidok(kursSzkicu({ ukonczone: 2, testZamkniety: true })).test.czynny).toBe(false);
  });
});

describe("kurs bez testu w logice", () => {
  it("wiersz pod tytułem bez „na końcu test”; z jawnym false tak samo, bez argumentu jak dotąd", () => {
    expect(opisKursu(lekcjeSzkicu(0), true)).toBe("7 lekcji · około 2 godziny");
    expect(opisKursu(lekcjeSzkicu(0), false)).toBe("7 lekcji · około 2 godziny · na końcu test");
    expect(opisKursu(lekcjeSzkicu(0))).toBe("7 lekcji · około 2 godziny · na końcu test");
  });

  it("rozstrzyga wyłącznie jawne false: true i brak pola to kurs z testem", () => {
    expect(zbudujWidok(odpowiedzBezTestu(7)).bezTestu).toBe(true);
    expect(zbudujWidok(odpowiedzSerwera({ ukonczone: 7 })).bezTestu).toBe(false);
    expect(zbudujWidok(kursSzkicu({ ukonczone: 7 })).bezTestu).toBe(false);
  });

  it("po ukończeniu wszystkich lekcji kurs jest ukończony i nie ma przycisku głównego; w trakcie — lekcja", () => {
    const koniec = zbudujWidok(odpowiedzBezTestu(7));
    expect(koniec.kursUkonczony).toBe(true);
    expect(koniec.akcja).toEqual({ rodzaj: "brak" });
    const wTrakcie = zbudujWidok(odpowiedzBezTestu(6));
    expect(wTrakcie.kursUkonczony).toBe(false);
    expect(wTrakcie.akcja).toMatchObject({ rodzaj: "lekcja", etykieta: "Kontynuuj lekcję 7" });
    expect(zbudujWidok(odpowiedzSerwera({ ukonczone: 7 })).akcja).toMatchObject({ rodzaj: "test", etykieta: "Przejdź do testu" });
  });
});
