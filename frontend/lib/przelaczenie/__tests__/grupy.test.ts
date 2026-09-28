import { describe, expect, it } from "vitest";
import {
  GRUPY,
  celTrasy,
  celTrasyEkranu,
  czyStaraTrasaPrzekierowuje,
  type DefinicjaGrupy,
} from "@/lib/przelaczenie/grupy";

/**
 * Świadek "wyłączone = baza" (Miara B1): na tej gałęzi (`przelaczenie-mechanizm`)
 * KAŻDA grupa rejestru ma `wlaczona: false` — to jest bit, który różni tę
 * gałąź od gałęzi świadka (`przelaczenie-grupa-wspolpraca`), i nic więcej.
 */
describe("rejestr GRUPY — stan tej gałęzi", () => {
  it("każda grupa jest dziś wyłączona", () => {
    for (const [klucz, grupa] of Object.entries(GRUPY)) {
      expect(grupa.wlaczona, `grupa "${klucz}" powinna być wyłączona na tej gałęzi`).toBe(false);
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
      { panel: "uczestnik", staraTrasa: "/panel/stara", nowaTrasa: "/panel/nowa" },
      { panel: "administracja", staraTrasa: null, nowaTrasa: "/admin/nowa" },
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
      { panel: "uczestnik", staraTrasa: "/panel/stara", nowaTrasa: "/panel/nowa" },
      { panel: "administracja", staraTrasa: null, nowaTrasa: "/admin/nowa" },
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

  it("KONTROLA NEGATYWNA: gdyby wyłączona grupa fałszywie zgłaszała przekierowanie, ten test by to złapał", () => {
    // Kopia z odwróconą flagą — dowód, że asercja wyżej faktycznie rozróżnia obie gałęzie,
    // a nie zawsze zwraca to samo niezależnie od `wlaczona`.
    expect(czyStaraTrasaPrzekierowuje({ ...grupa, wlaczona: true }, "uczestnik")).not.toBe(
      czyStaraTrasaPrzekierowuje(grupa, "uczestnik"),
    );
  });
});
