import { describe, expect, it } from "vitest";
import { instructorMenu } from "@/lib/menu/instructor";
import { participantMenu } from "@/lib/menu/participant";
import { GRUPA_DOTYCHCZASOWA, type GrupaMenuRamki } from "@/lib/menu/ramka/administracja";
import {
  menuRamkiProwadzacego,
  W_PRZYGOTOWANIU_KONTO_PROWADZACEGO,
  W_PRZYGOTOWANIU_PROGRAM_PROWADZACEGO,
} from "@/lib/menu/ramka/prowadzacy";
import {
  menuRamkiUczestnika,
  W_PRZYGOTOWANIU_KONTO_UCZESTNIKA,
  W_PRZYGOTOWANIU_PROGRAM_UCZESTNIKA,
} from "@/lib/menu/ramka/uczestnik";
import { GRUPY, type DefinicjaGrupy, type KluczGrupy } from "@/lib/przelaczenie/grupy";

/**
 * Menu uczestnika i prowadzącego nowej ramki wobec makiety 2.0.4 (skrypt
 * `#nav`, role `u` w. 1102 i `p` w. 1108):
 * - uczestnik: Program — Pulpit, Kursy + „W przygotowaniu: pytania
 *   i odpowiedzi · ścieżka programu · dziennik stażu · superwizja · dokumenty
 *   · zaświadczenie o ukończeniu kursu”; Konto — Wyloguj + „profil · pomoc”;
 * - prowadzący: Codziennie — Pulpit; Program — Moje kursy + „moja grupa ·
 *   superwizja”; Konto — Wyloguj + „profil prowadzącego · pomoc”.
 * Ekran włączany rano spoza makiety (U-19 „Po programie”) w grupie Program;
 * stare funkcje bez miejsca w makiecie w „Dotychczasowym panelu”.
 */

function zFlagami(flagi: Partial<Record<KluczGrupy, boolean>>): Record<string, DefinicjaGrupy> {
  return Object.fromEntries(
    Object.entries(GRUPY).map(([klucz, grupa]) => [klucz, { ...grupa, wlaczona: flagi[klucz as KluczGrupy] ?? false }]),
  );
}

function uklad(grupy: GrupaMenuRamki[]) {
  return grupy.map((g) => ({ naglowek: g.naglowek, pozycje: g.pozycje.map((p) => [p.etykieta, p.href]), linia: g.wPrzygotowaniu }));
}

const WLACZONE_DZIS = { wspolpraca: true, pulpitUczestnika: true, pulpitProwadzacego: true };

describe("menu nowej ramki uczestnika", () => {
  it("wolontariusz przy grupach włączonych na dziś: makieta, „Po programie” i grupa dotychczasowa", () => {
    expect(uklad(menuRamkiUczestnika("volunteer", zFlagami(WLACZONE_DZIS)))).toEqual([
      {
        naglowek: "Program",
        pozycje: [
          ["Pulpit", "/panel/pulpit"],
          ["Kursy", "/panel/kursy"],
          ["Po programie", "/panel/dalsza-wspolpraca"],
        ],
        linia: W_PRZYGOTOWANIU_PROGRAM_UCZESTNIKA,
      },
      {
        naglowek: GRUPA_DOTYCHCZASOWA,
        pozycje: [
          ["Start", "/panel/start"],
          ["Dziennik stażu", "/panel/staz"],
          ["Superwizja", "/panel/superwizja"],
          ["Certyfikat", "/panel/certyfikat"],
          ["Profil", "/panel/profil"],
          ["Dokumenty", "/panel/dokumenty"],
          ["Profil psychologa", "/panel/profil-psychologa"],
        ],
        linia: undefined,
      },
    ]);
  });

  it("linie „W przygotowaniu” mają brzmienie makiety", () => {
    expect(W_PRZYGOTOWANIU_PROGRAM_UCZESTNIKA).toBe(
      "pytania i odpowiedzi · ścieżka programu · dziennik stażu · superwizja · dokumenty · zaświadczenie o ukończeniu kursu",
    );
    expect(W_PRZYGOTOWANIU_KONTO_UCZESTNIKA).toBe("profil · pomoc");
  });

  it("student: grupa dotychczasowa bez wpisów tylko dla wolontariusza (ten sam filtr co stare menu)", () => {
    const dotychczasowa = menuRamkiUczestnika("student", zFlagami(WLACZONE_DZIS)).find(
      (g) => g.naglowek === GRUPA_DOTYCHCZASOWA,
    );
    expect(dotychczasowa?.pozycje.map((p) => p.href)).toEqual(["/panel/start", "/panel/profil", "/panel/dokumenty"]);
  });

  it("linia „W przygotowaniu” programu nie wymienia funkcji, których rola nie ma (student, przed /me)", () => {
    const linia = (rola: "volunteer" | "student" | undefined) =>
      menuRamkiUczestnika(rola, zFlagami(WLACZONE_DZIS)).find((g) => g.naglowek === "Program")?.wPrzygotowaniu;
    expect(linia("volunteer")).toBe(W_PRZYGOTOWANIU_PROGRAM_UCZESTNIKA);
    for (const rola of ["student", undefined] as const) {
      expect(linia(rola)).not.toMatch(/dziennik stażu|superwizja/);
      expect(linia(rola)).toContain("pytania i odpowiedzi");
    }
  });

  it("przed odpowiedzią /me grupa dotychczasowa jest ukryta (fail closed)", () => {
    expect(menuRamkiUczestnika(undefined, zFlagami(WLACZONE_DZIS)).map((g) => g.naglowek)).toEqual(["Program"]);
  });

  it("grupy wyłączone: pozycje prowadzą na stare trasy", () => {
    const program = menuRamkiUczestnika("volunteer", zFlagami({}))[0];
    expect(program.pozycje.map((p) => [p.etykieta, p.href])).toEqual([
      ["Pulpit", "/panel/pulpit"],
      ["Kursy", "/panel/kursy"],
      ["Po programie", "/panel/po-programie"],
    ]);
  });

  it("każda stara pozycja uczestnika (poza pulpitem, kursami i po programie) jest w grupie dotychczasowej", () => {
    const menu = menuRamkiUczestnika("volunteer", zFlagami(WLACZONE_DZIS));
    const hrefy = new Set(menu.flatMap((g) => g.pozycje.map((p) => p.href)));
    const brakujace = participantMenu
      .filter((wpis) => !["/panel/pulpit", "/panel/kursy", "/panel/po-programie"].includes(wpis.href))
      .filter((wpis) => !hrefy.has(wpis.href));
    expect(brakujace).toEqual([]);
  });
});

describe("menu nowej ramki prowadzącego", () => {
  it("przy grupach włączonych na dziś: makieta i grupa dotychczasowa", () => {
    expect(uklad(menuRamkiProwadzacego(zFlagami(WLACZONE_DZIS)))).toEqual([
      { naglowek: "Codziennie", pozycje: [["Pulpit", "/prowadzacy"]], linia: undefined },
      {
        naglowek: "Program",
        pozycje: [["Moje kursy", "/prowadzacy/kursy"]],
        linia: W_PRZYGOTOWANIU_PROGRAM_PROWADZACEGO,
      },
      {
        naglowek: GRUPA_DOTYCHCZASOWA,
        pozycje: [
          ["Moja grupa", "/prowadzacy/grupa"],
          ["Wątek grupowy", "/prowadzacy/watek-grupowy"],
          ["Pytania", "/prowadzacy/pytania"],
        ],
        linia: undefined,
      },
    ]);
  });

  it("linie „W przygotowaniu” mają brzmienie makiety", () => {
    expect(W_PRZYGOTOWANIU_PROGRAM_PROWADZACEGO).toBe("moja grupa · superwizja");
    expect(W_PRZYGOTOWANIU_KONTO_PROWADZACEGO).toBe("profil prowadzącego · pomoc");
  });

  it("każda stara pozycja prowadzącego ma swój adres w nowym menu", () => {
    const hrefy = new Set(menuRamkiProwadzacego(zFlagami(WLACZONE_DZIS)).flatMap((g) => g.pozycje.map((p) => p.href)));
    expect(instructorMenu.filter((wpis) => !hrefy.has(wpis.href))).toEqual([]);
  });
});
