import { describe, expect, it } from "vitest";
import {
  GRUPY,
  celTrasy,
  celTrasyEkranu,
  czyNowaTrasaDostepna,
  czyStaraTrasaPrzekierowuje,
  type DefinicjaGrupy,
} from "@/lib/przelaczenie/grupy";

/**
 * Stan flag rejestru: wyłączona grupa nie zmienia zachowania produktu, więc
 * każda grupa, której włączenie nie zostało jeszcze wdrożone, ma
 * `wlaczona: false`.
 */
describe("rejestr GRUPY — stan flag", () => {
  it("każda grupa jest dziś wyłączona", () => {
    for (const [klucz, grupa] of Object.entries(GRUPY)) {
      expect(grupa.wlaczona, `grupa "${klucz}" powinna być wyłączona dziś`).toBe(false);
    }
  });

  it("grupa wspolpraca niesie dokładnie dwa ekrany: uczestnika i administrację", () => {
    const panele = GRUPY.wspolpraca.ekrany.map((e) => e.panel).sort();
    expect(panele).toEqual(["administracja", "uczestnik"]);
  });
});

describe("celTrasyEkranu — czysta funkcja, obie gałęzie flagi", () => {
  const bazowaGrupa: DefinicjaGrupy = {
    klucz: "przyklad",
    wlaczona: false,
    ekrany: [
      { panel: "uczestnik", staraTrasa: "/panel/stara", nowaTrasa: "/panel/nowa", trasaPoligonu: "/poligon/a" },
      { panel: "administracja", staraTrasa: null, nowaTrasa: "/admin/nowa", trasaPoligonu: "/poligon/b" },
    ],
  };

  it("wyłączona: ekran ze starą trasą zwraca starą trasę", () => {
    expect(celTrasyEkranu(bazowaGrupa, "uczestnik")).toBe("/panel/stara");
  });

  it("wyłączona: ekran bez starej trasy zwraca null (wpisu menu jeszcze nie ma)", () => {
    expect(celTrasyEkranu(bazowaGrupa, "administracja")).toBeNull();
  });

  it("włączona: obydwa ekrany zwracają nową trasę", () => {
    const wlaczona: DefinicjaGrupy = { ...bazowaGrupa, wlaczona: true };
    expect(celTrasyEkranu(wlaczona, "uczestnik")).toBe("/panel/nowa");
    expect(celTrasyEkranu(wlaczona, "administracja")).toBe("/admin/nowa");
  });

  it("panel spoza listy ekranów grupy zwraca null", () => {
    expect(celTrasyEkranu(bazowaGrupa, "administracja" as const)).toBeNull();
  });
});

describe("celTrasy — wygoda po kluczu rejestru", () => {
  it("odpowiada dziś (wyłączone) staraTrasa uczestnika grupy wspolpraca", () => {
    expect(celTrasy("wspolpraca", "uczestnik")).toBe("/panel/po-programie");
  });

  it("odpowiada dziś (wyłączone) null dla administracji grupy wspolpraca", () => {
    expect(celTrasy("wspolpraca", "administracja")).toBeNull();
  });
});

describe("czyStaraTrasaPrzekierowuje", () => {
  const grupa: DefinicjaGrupy = {
    klucz: "przyklad",
    wlaczona: false,
    ekrany: [
      { panel: "uczestnik", staraTrasa: "/panel/stara", nowaTrasa: "/panel/nowa", trasaPoligonu: "/poligon/a" },
      { panel: "administracja", staraTrasa: null, nowaTrasa: "/admin/nowa", trasaPoligonu: "/poligon/b" },
    ],
  };

  it("wyłączona grupa: żadna stara trasa nie przekierowuje", () => {
    expect(czyStaraTrasaPrzekierowuje(grupa, "uczestnik")).toBe(false);
  });

  it("włączona grupa, ekran ze starą trasą: przekierowuje", () => {
    expect(czyStaraTrasaPrzekierowuje({ ...grupa, wlaczona: true }, "uczestnik")).toBe(true);
  });

  it("włączona grupa, ekran BEZ starej trasy: nie przekierowuje (nie ma skąd)", () => {
    expect(czyStaraTrasaPrzekierowuje({ ...grupa, wlaczona: true }, "administracja")).toBe(false);
  });

  it("włączona grupa, ekran o tym samym adresie starej i nowej trasy: nie przekierowuje (zamiana treści, nie pętla)", () => {
    const tenSamAdres: DefinicjaGrupy = {
      klucz: "przyklad",
      wlaczona: true,
      ekrany: [{ panel: "administracja", staraTrasa: "/admin/x", nowaTrasa: "/admin/x", trasaPoligonu: "/poligon/c" }],
    };
    expect(czyStaraTrasaPrzekierowuje(tenSamAdres, "administracja")).toBe(false);
    expect(celTrasyEkranu(tenSamAdres, "administracja")).toBe("/admin/x");
  });

  it("przypadek odwrotny: gdyby wyłączona grupa fałszywie zgłaszała przekierowanie, ten test by to złapał", () => {
    // Kopia z odwróconą flagą — dowód, że asercja wyżej faktycznie rozróżnia obie gałęzie,
    // a nie zawsze zwraca to samo niezależnie od `wlaczona`.
    expect(czyStaraTrasaPrzekierowuje({ ...grupa, wlaczona: true }, "uczestnik")).not.toBe(
      czyStaraTrasaPrzekierowuje(grupa, "uczestnik"),
    );
  });
});

describe("czyNowaTrasaDostepna", () => {
  it("nowa trasa jest dostępna dokładnie wtedy, gdy grupa jest włączona", () => {
    const grupa: DefinicjaGrupy = { klucz: "przyklad", wlaczona: false, ekrany: [] };
    expect(czyNowaTrasaDostepna(grupa)).toBe(false);
    expect(czyNowaTrasaDostepna({ ...grupa, wlaczona: true })).toBe(true);
  });
});

describe("rejestr GRUPY — zawartość", () => {
  it("zna pięć grup dzisiejszego kanonu", () => {
    expect(Object.keys(GRUPY).sort()).toEqual(["formyStazu", "kurs", "powiadomienia", "superwizje", "wspolpraca"]);
  });

  it("klucz każdej grupy zgadza się z jej kluczem w rejestrze", () => {
    for (const [klucz, grupa] of Object.entries(GRUPY)) {
      expect(grupa.klucz).toBe(klucz);
    }
  });

  it("kurs należy do panelu prowadzącego, a jego adres zostaje ten sam", () => {
    const [ekran] = GRUPY.kurs.ekrany;
    expect(ekran.panel).toBe("prowadzacy");
    expect(ekran.staraTrasa).toBe(ekran.nowaTrasa);
  });
});
