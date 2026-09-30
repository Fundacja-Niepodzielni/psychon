import { describe, expect, it } from "vitest";
import { adminMenu } from "@/lib/menu/admin";
import {
  GRUPA_DOTYCHCZASOWA,
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
 * staż i superwizja są w menu jako „Akceptacja stażu” i „Superwizje”);
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

const WLACZONE_DZIS: Partial<Record<KluczGrupy, boolean>> = {
  wspolpraca: true,
  formyStazu: true,
  pulpitAdministracji: true,
  decyzjaProfilu: true,
  wzoryDokumentow: true,
  ekranStartowy: true,
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
          ["Akceptacja stażu", "/admin/staz"],
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

  it("żadna funkcja starego menu nie ginie: każdy adres starego rejestru jest w nowym menu", () => {
    const nowe = menuRamkiAdministracji().flatMap((g) => g.pozycje.map((p) => p.href));
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
