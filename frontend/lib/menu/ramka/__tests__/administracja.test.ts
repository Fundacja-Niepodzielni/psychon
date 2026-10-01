import { describe, expect, it } from "vitest";
import { adminMenu } from "@/lib/menu/admin";
import {
  GRUPA_DOTYCHCZASOWA,
  PODSTRONY_ADMINISTRACJI,
  czyPodstronaPozycji,
  czyPozycjaBiezaca,
  menuRamkiAdministracji,
  type GrupaMenuRamki,
} from "@/lib/menu/ramka/administracja";
import { GRUPY, type DefinicjaGrupy, type KluczGrupy } from "@/lib/przelaczenie/grupy";

/**
 * Menu administracji nowej ramki wobec makiety 2.0.4 (menu roli
 * administracji, skrypt `#nav`, w. 1105):
 * Codziennie: Pulpit · Sprawy · Uczestnicy; Program: Kursy + „W
 * przygotowaniu: prowadzący” (makieta: „prowadzący · staż i superwizja”;
 * staż jest podstroną „Spraw” („Dyżury do decyzji”), superwizja — „Superwizje”);
 * Rozliczenie: Raport roku
 * programu · Dziennik działań + „W przygotowaniu: certyfikaty · ustawienia
 * roku programu” (bez „treści i dokumenty” — wzory dokumentów i ekran
 * startowy są już pozycjami tej grupy); Konto: Wyloguj (w powłoce).
 */

function zFlagami(flagi: Partial<Record<KluczGrupy, boolean>>): Record<string, DefinicjaGrupy> {
  return Object.fromEntries(
    Object.entries(GRUPY).map(([klucz, grupa]) => [klucz, { ...grupa, wlaczona: flagi[klucz as KluczGrupy] ?? false }]),
  );
}

function uklad(grupy: GrupaMenuRamki[]) {
  return grupy.map((g) => ({ naglowek: g.naglowek, pozycje: g.pozycje.map((p) => [p.etykieta, p.href]), linia: g.wPrzygotowaniu }));
}

/** Adresy wejść: pozycje menu i podstrony pozycji-rodziców (ekrany bez własnej pozycji w menu). */
function adresyWejsc(grupy: GrupaMenuRamki[]): string[] {
  return grupy.flatMap((g) => g.pozycje.flatMap((p) => [p.href, ...(p.podstrony ?? []).map((ekran) => ekran.href)]));
}

const WLACZONE_DZIS: Partial<Record<KluczGrupy, boolean>> = {
  wspolpraca: true,
  formyStazu: true,
  pulpitAdministracji: true,
  decyzjaProfilu: true,
  wzoryDokumentow: true,
  ekranStartowy: true,
  kolejkaStazu: true,
  kursyAdministracji: true,
  // Włączony nabór dokłada podstronę „Zgłoszenia rekrutacyjne” pod „Sprawy” (adres inny niż „Uczestnicy”), więc
  // rzeczywiste menu różni się od menu bez tej flagi — bez niej porównanie z rejestrem na dziś byłoby fałszywe.
  nabor: true,
  pulpitUczestnika: true,
  pulpitProwadzacego: true,
};

describe("menu nowej ramki administracji — makieta 2.0.4 i słownik 2.1", () => {
  it("przy grupach włączonych na dziś: pozycje makiety, ekrany włączonych grup i grupa dotychczasowa", () => {
    expect(uklad(menuRamkiAdministracji(zFlagami(WLACZONE_DZIS)))).toEqual([
      {
        naglowek: "Codziennie",
        pozycje: [
          ["Pulpit", "/admin"],
          ["Sprawy", "/admin/sprawy"],
          ["Uczestnicy", "/admin/uczestniczki"],
          ["Zgłoszenia współpracy", "/admin/zgloszenia-wspolpracy"],
        ],
        linia: undefined,
      },
      {
        naglowek: "Program",
        pozycje: [
          ["Kursy", "/admin/kursy"],
          ["Słownik form stażu", "/admin/formy-stazu"],
        ],
        linia: "prowadzący",
      },
      {
        naglowek: "Rozliczenie",
        pozycje: [
          ["Raport roku programu", "/admin/raport"],
          ["Dziennik działań", "/admin/dziennik"],
          ["Wzory dokumentów", "/admin/wzory-dokumentow"],
          ["Treść ekranu „Zacznij tutaj”", "/admin/ekran-startowy"],
        ],
        linia: "certyfikaty · ustawienia roku programu",
      },
      {
        naglowek: GRUPA_DOTYCHCZASOWA,
        pozycje: [
          ["Czas nauki", "/admin/czas-nauki"],
          ["Certyfikaty", "/admin/certyfikaty"],
          ["Profile psychologa", "/admin/profile"],
          ["Superwizje", "/admin/superwizje"],
          ["Skrzynka e-maili", "/admin/emails"],
          ["Ustawienia", "/admin/ustawienia"],
        ],
        linia: undefined,
      },
    ]);
  });

  it("menu rzeczywiste (rejestr na dziś) jest tym samym menu co przy grupach włączonych na dziś", () => {
    expect(menuRamkiAdministracji()).toEqual(menuRamkiAdministracji(zFlagami(WLACZONE_DZIS)));
  });

  it("żadna funkcja starego menu nie ginie: każdy adres starego rejestru jest w nowym menu albo jest podstroną pozycji menu (Dyżury pod „Sprawami”)", () => {
    const nowe = adresyWejsc(menuRamkiAdministracji());
    for (const wpis of adminMenu) {
      expect(nowe, wpis.label).toContain(wpis.href);
    }
  });

  it("przy wszystkich grupach wyłączonych każda pozycja prowadzi na starą trasę, a ekranów bez starej trasy nie ma", () => {
    const pozycje = menuRamkiAdministracji(zFlagami({})).flatMap((g) => g.pozycje);
    const adresy = pozycje.map((p) => p.href);
    expect(adresy).not.toContain("/admin/zgloszenia-wspolpracy");
    expect(adresy).not.toContain("/admin/formy-stazu");
    const stareAdresy = new Set(adminMenu.map((w) => w.href));
    for (const adres of adresy) expect(stareAdresy.has(adres), adres).toBe(true);
  });

  it("kontrola dodatnia: włączenie grupy form stażu dokłada pozycję w grupie Program", () => {
    const program = menuRamkiAdministracji(zFlagami({ formyStazu: true })).find((g) => g.naglowek === "Program");
    expect(program?.pozycje.map((p) => p.href)).toEqual(["/admin/kursy", "/admin/formy-stazu"]);
  });

  it("rejestr podstron: „Dyżury do decyzji” i „Zgłoszenia rekrutacyjne” mają rodzica „Sprawy”, a własnej pozycji w menu nie mają", () => {
    expect(PODSTRONY_ADMINISTRACJI.map((wpis) => [wpis.etykieta, wpis.rodzic])).toEqual([
      ["Dyżury do decyzji", "Sprawy"],
      ["Zgłoszenia rekrutacyjne", "Sprawy"],
    ]);
    const menu = menuRamkiAdministracji();
    const pozycje = menu.flatMap((g) => g.pozycje);
    const sprawy = pozycje.find((p) => p.etykieta === "Sprawy");
    expect(sprawy?.href).toBe("/admin/sprawy");
    expect(sprawy?.podstrony).toEqual([
      { etykieta: "Dyżury do decyzji", href: "/admin/staz" },
      { etykieta: "Zgłoszenia rekrutacyjne", href: "/admin/nabor" },
    ]);
    // Nazwy ekranów zostają (to ich `h1`), ale w menu nie ma ani pozycji, ani adresów tych ekranów.
    const etykiety = pozycje.map((p) => p.etykieta);
    expect(etykiety).not.toContain("Dyżury do decyzji");
    expect(etykiety).not.toContain("Zgłoszenia rekrutacyjne");
    expect(etykiety).not.toContain("Akceptacja stażu");
    expect(pozycje.map((p) => p.href)).not.toContain("/admin/staz");
    expect(pozycje.map((p) => p.href)).not.toContain("/admin/nabor");
    expect(menu.find((g) => g.naglowek === "Codziennie")?.pozycje.map((p) => p.etykieta)).toEqual([
      "Pulpit",
      "Sprawy",
      "Uczestnicy",
      "Zgłoszenia współpracy",
    ]);
  });

  it("kolejka stażu przy obu stanach flagi: jedno wejście na /admin/staz — podstrona „Spraw”, nigdy pozycja ani wpis „Dotychczasowego panelu”", () => {
    for (const wlaczona of [true, false]) {
      const menu = menuRamkiAdministracji(zFlagami({ kolejkaStazu: wlaczona, sprawy: true }));
      const wejscia = menu.flatMap((g) =>
        g.pozycje.flatMap((p) => (p.podstrony ?? []).filter((e) => e.href === "/admin/staz").map(() => [g.naglowek, p.etykieta])),
      );
      expect(wejscia, `flaga ${wlaczona}`).toEqual([["Codziennie", "Sprawy"]]);
      expect(menu.flatMap((g) => g.pozycje.filter((p) => p.href === "/admin/staz")), `flaga ${wlaczona}`).toEqual([]);
      const wszystkie = menu.flatMap((g) => g.pozycje.map((p) => p.etykieta));
      expect(wszystkie, `flaga ${wlaczona}`).not.toContain("Akceptacja stażu");
    }
  });

  it("zgłoszenia rekrutacyjne przy włączonej grupie: podstrona „Spraw” z adresem /admin/nabor, a „Uczestnicy” zostają pozycją", () => {
    const menu = menuRamkiAdministracji(zFlagami({ nabor: true, listaOsob: true, sprawy: true }));
    const codziennie = menu.find((g) => g.naglowek === "Codziennie");
    expect(codziennie?.pozycje.map((p) => p.etykieta)).toEqual(["Pulpit", "Sprawy", "Uczestnicy"]);
    expect(codziennie?.pozycje.find((p) => p.etykieta === "Sprawy")?.podstrony).toContainEqual({
      etykieta: "Zgłoszenia rekrutacyjne",
      href: "/admin/nabor",
    });
  });

  it("zgłoszenia rekrutacyjne przy obu stanach flagi: adresy wejść nie powtarzają się, a /admin/uczestniczki ma dokładnie jedno wejście", () => {
    for (const wlaczona of [true, false]) {
      const menu = menuRamkiAdministracji(zFlagami({ nabor: wlaczona, sprawy: true }));
      const adresy = adresyWejsc(menu);
      expect(new Set(adresy).size, `flaga ${wlaczona}`).toBe(adresy.length);
      expect(adresy.filter((a) => a === "/admin/uczestniczki"), `flaga ${wlaczona}`).toHaveLength(1);
      expect(adresy.includes("/admin/nabor"), `flaga ${wlaczona}`).toBe(wlaczona);
    }
  });

  it("zgłoszenia rekrutacyjne przy wyłączonej grupie nie ginią: wejście na listę zgłoszeń zostaje przez „Uczestnicy” (zakładka starej strony)", () => {
    const menu = menuRamkiAdministracji(zFlagami({ nabor: false }));
    const wszystkie = menu.flatMap((g) => g.pozycje.map((p) => [p.etykieta, p.href]));
    expect(wszystkie).toContainEqual(["Uczestnicy", "/admin/uczestniczki"]);
    expect(wszystkie.map(([etykieta]) => etykieta)).not.toContain("Zgłoszenia rekrutacyjne");
  });

  it("bez pozycji „Sprawy” w menu oba ekrany wracają na własne pozycje w „Codziennie”, żeby wejście nie zginęło", () => {
    // Rejestr bez wpisu „sprawy”: pozycji „Sprawy” w menu nie ma (cel `null`).
    const bezSpraw = Object.fromEntries(
      Object.entries(zFlagami({ kolejkaStazu: true, nabor: true, listaOsob: true })).filter(([klucz]) => klucz !== "sprawy"),
    );
    const menu = menuRamkiAdministracji(bezSpraw);
    const codziennie = menu.find((g) => g.naglowek === "Codziennie");
    expect(codziennie?.pozycje.map((p) => [p.etykieta, p.href])).toEqual([
      ["Pulpit", "/admin"],
      ["Dyżury do decyzji", "/admin/staz"],
      ["Uczestnicy", "/admin/uczestniczki"],
      ["Zgłoszenia rekrutacyjne", "/admin/nabor"],
    ]);
    expect(menu.flatMap((g) => g.pozycje).some((p) => p.podstrony !== undefined)).toBe(false);
  });

  it("żaden adres nie wskazuje segmentu nowego frontu i nie powtarza się", () => {
    const adresy = menuRamkiAdministracji().flatMap((g) => g.pozycje.map((p) => p.href));
    const segment = new RegExp(["nowy", "front"].join("-"));
    for (const adres of adresy) expect(adres).not.toMatch(segment);
    expect(new Set(adresy).size).toBe(adresy.length);
  });
});

describe("czyPozycjaBiezaca", () => {
  it("korzeń /admin tylko dokładnie, pozostałe pozycje także na podstronach", () => {
    const [codziennie] = menuRamkiAdministracji();
    const pulpit = codziennie.pozycje[0];
    expect(czyPozycjaBiezaca(pulpit, "/admin")).toBe(true);
    expect(czyPozycjaBiezaca(pulpit, "/admin/kursy")).toBe(false);
    const profile = { ikona: "user" as const, etykieta: "Profile psychologa", href: "/admin/profile" };
    expect(czyPozycjaBiezaca(profile, "/admin/profile/12")).toBe(true);
    expect(czyPozycjaBiezaca(profile, "/admin/profilex")).toBe(false);
  });
});

describe("czyPodstronaPozycji", () => {
  it("rodzic jest sekcją dla adresu podstrony i jej szczegółu, nie dla adresu o tym samym początku", () => {
    const sprawy = menuRamkiAdministracji()
      .flatMap((g) => g.pozycje)
      .find((p) => p.etykieta === "Sprawy")!;
    expect(czyPodstronaPozycji(sprawy, "/admin/staz")).toBe(true);
    expect(czyPodstronaPozycji(sprawy, "/admin/nabor")).toBe(true);
    expect(czyPodstronaPozycji(sprawy, "/admin/nabor/17")).toBe(true);
    expect(czyPodstronaPozycji(sprawy, "/admin/nabor/")).toBe(true);
    expect(czyPodstronaPozycji(sprawy, "/admin/naborx")).toBe(false);
    expect(czyPodstronaPozycji(sprawy, "/admin/sprawy")).toBe(false);
    expect(czyPodstronaPozycji({ ikona: "home", etykieta: "Pulpit", href: "/admin" }, "/admin/staz")).toBe(false);
  });
});
