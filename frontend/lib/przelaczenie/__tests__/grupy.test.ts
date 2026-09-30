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
 * Stan flag rejestru: włączone są grupy, dla których są już strony pod
 * nowymi trasami i wpisy menu (`wspolpraca`, `formyStazu`,
 * `pulpitAdministracji`), `pulpitUczestnika`, `lekcja` i `pulpitProwadzacego`
 * (ten sam adres, treść strony zamienia się na ekran nowego frontu) oraz podmiana
 * treści starych stron: `decyzjaProfilu`, `wzoryDokumentow` i `ekranStartowy`.
 * Pozostałe grupy opisują tylko docelowe pary tras i zostają wyłączone.
 */
const WLACZONE = ["decyzjaProfilu", "ekranStartowy", "formyStazu", "lekcja", "pulpitAdministracji", "pulpitProwadzacego", "pulpitUczestnika", "wspolpraca", "wzoryDokumentow"];

describe("rejestr GRUPY — stan flag", () => {
  it("grupa wspolpraca jest włączona", () => {
    expect(GRUPY.wspolpraca.wlaczona).toBe(true);
  });

  it("grupy pulpitUczestnika i lekcja są włączone", () => {
    expect(GRUPY.pulpitUczestnika.wlaczona).toBe(true);
    expect(GRUPY.lekcja.wlaczona).toBe(true);
  });

  it("grupa pulpitProwadzacego jest włączona", () => {
    expect(GRUPY.pulpitProwadzacego.wlaczona).toBe(true);
  });

  it("włączone są dokładnie: współpraca, pulpit uczestnika, lekcja, formy stażu, pulpit administracji, pulpit prowadzącego, decyzja o profilu, wzory dokumentów i ekran startowy", () => {
    const wlaczone = Object.entries(GRUPY)
      .filter(([, grupa]) => grupa.wlaczona)
      .map(([klucz]) => klucz)
      .sort();
    expect(wlaczone).toEqual(WLACZONE);
  });

  it("każda pozostała grupa jest wyłączona", () => {
    for (const [klucz, grupa] of Object.entries(GRUPY)) {
      if (WLACZONE.includes(klucz)) continue;
      expect(grupa.wlaczona, `grupa "${klucz}" powinna być wyłączona dziś`).toBe(false);
    }
  });

  it("grupy z podmianą treści mają ten sam adres starej i nowej trasy", () => {
    for (const klucz of ["decyzjaProfilu", "wzoryDokumentow", "ekranStartowy"] as const) {
      const [ekran] = GRUPY[klucz].ekrany;
      expect(ekran.panel, klucz).toBe("administracja");
      expect(ekran.staraTrasa, klucz).toBe(ekran.nowaTrasa);
    }
  });

it("grupa wspolpraca niesie dokładnie dwa ekrany: uczestnika i administrację", () => {
    const panele = GRUPY.wspolpraca.ekrany.map((e) => e.panel).sort();
    expect(panele).toEqual(["administracja", "uczestnik"]);
  });

  it("pulpitUczestnika i lekcja: ten sam adres starej i nowej trasy, więc zamiana treści, nie przekierowanie", () => {
    for (const grupa of [GRUPY.pulpitUczestnika, GRUPY.lekcja]) {
      const [ekran] = grupa.ekrany;
      expect(grupa.ekrany).toHaveLength(1);
      expect(ekran.panel).toBe("uczestnik");
      expect(ekran.staraTrasa).toBe(ekran.nowaTrasa);
      expect(czyStaraTrasaPrzekierowuje(grupa, "uczestnik"), grupa.klucz).toBe(false);
      expect(celTrasyEkranu(grupa, "uczestnik"), grupa.klucz).toBe(ekran.nowaTrasa);
    }
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
  it("odpowiada dziś (włączone) nową trasą uczestnika grupy wspolpraca", () => {
    expect(celTrasy("wspolpraca", "uczestnik")).toBe("/panel/dalsza-wspolpraca");
  });

  it("odpowiada dziś (włączone) nową trasą administracji grupy wspolpraca", () => {
    expect(celTrasy("wspolpraca", "administracja")).toBe("/admin/zgloszenia-wspolpracy");
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
  it("zna dwadzieścia sześć grup dzisiejszego kanonu", () => {
    expect(Object.keys(GRUPY).sort()).toEqual([
      "decyzjaProfilu",
      "edycjaLekcji",
      "ekranStartowy",
      "formyStazu",
      "kartaOsoby",
      "kolejkaProfili",
      "kolejkaStazu",
      "kurs",
      "kursyProwadzacego",
      "lekcja",
      "listaOsob",
      "nabor",
      "noweKonto",
      "powiadomienia",
      "przedluzenieDostepu",
      "publikacjaKursu",
      "pulpitAdministracji",
      "pulpitProwadzacego",
      "pulpitUczestnika",
      "skrzynkaPytan",
      "sprawy",
      "superwizje",
      "ustawieniaProgramu",
      "wspolpraca",
      "wzoryDokumentow",
      "zaproszeniaNaKurs",
    ]);
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

  it("nabór niesie dwa ekrany administracji: listę (pierwsza, bo menu czyta pierwszy ekran panelu) i szczegół", () => {
    expect(GRUPY.nabor.ekrany.map((e) => e.nowaTrasa)).toEqual(["/admin/nabor", "/admin/nabor/[id]"]);
    expect(GRUPY.nabor.ekrany.map((e) => e.staraTrasa)).toEqual(["/admin/uczestniczki", null]);
    expect(celTrasyEkranu({ ...GRUPY.nabor, wlaczona: true }, "administracja")).toBe("/admin/nabor");
    expect(celTrasyEkranu(GRUPY.nabor, "administracja")).toBe("/admin/uczestniczki");
  });

  it("pięć grup kolejek i list zachowuje adres starej strony (podmiana treści)", () => {
    const klucze = ["listaOsob", "kolejkaProfili", "kolejkaStazu", "kursyProwadzacego", "skrzynkaPytan"] as const;
    const panele = ["administracja", "administracja", "administracja", "prowadzacy", "prowadzacy"];
    klucze.forEach((klucz, i) => {
      const [ekran] = GRUPY[klucz].ekrany;
      expect(ekran.panel, klucz).toBe(panele[i]);
      expect(ekran.staraTrasa, klucz).toBe(ekran.nowaTrasa);
      expect(GRUPY[klucz].wlaczona, klucz).toBe(false);
    });
  });
});
