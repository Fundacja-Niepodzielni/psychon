import { describe, expect, it } from "vitest";
import { GRUPA_DOTYCHCZASOWA, menuRamkiAdministracji } from "../administracja";
import { menuRamkiProwadzacego, W_PRZYGOTOWANIU_KONTO_PROWADZACEGO } from "../prowadzacy";
import { menuRamkiUczestnika, W_PRZYGOTOWANIU_KONTO_UCZESTNIKA } from "../uczestnik";
import { liniaBezPozycjiMenu, ukladMenuRamki } from "../uklad";

/**
 * Układ menu nowej ramki: „Dotychczasowy panel” osobno (szablon go zwija),
 * a linie „W przygotowaniu” nie wymieniają funkcji obecnych w menu — zbiór
 * nazw z linii i zbiór nazw pozycji menu są rozłączne dla trzech ról.
 */

function nazwyZLinii(linia: string | undefined): string[] {
  return linia ? linia.split(" · ").map((n) => n.toLocaleLowerCase("pl")) : [];
}

const PRZYPADKI = [
  ["administracja", () => ukladMenuRamki(menuRamkiAdministracji(), "/admin")],
  ["wolontariusz", () => ukladMenuRamki(menuRamkiUczestnika("volunteer"), "/panel/pulpit", W_PRZYGOTOWANIU_KONTO_UCZESTNIKA)],
  ["student", () => ukladMenuRamki(menuRamkiUczestnika("student"), "/panel/pulpit", W_PRZYGOTOWANIU_KONTO_UCZESTNIKA)],
  ["prowadzący", () => ukladMenuRamki(menuRamkiProwadzacego(), "/prowadzacy", W_PRZYGOTOWANIU_KONTO_PROWADZACEGO)],
] as const;

describe("ukladMenuRamki — linie „W przygotowaniu” rozłączne z menu", () => {
  it.each(PRZYPADKI)("%s: przecięcie nazw z linii i nazw pozycji menu jest puste", (_rola, uklad) => {
    const { grupy, grupaZwinieta, liniaKonta } = uklad();
    const wszystkie = [...grupy, ...(grupaZwinieta ? [grupaZwinieta] : [])];
    const pozycje = new Set(wszystkie.flatMap((g) => g.pozycje.map((p) => p.etykieta.toLocaleLowerCase("pl"))));
    const linie = [...wszystkie.map((g) => g.liniaWPrzygotowaniu), liniaKonta].flatMap(nazwyZLinii);
    expect(linie.filter((n) => pozycje.has(n))).toEqual([]);
  });

  it.each(PRZYPADKI)("%s: „Dotychczasowy panel” tylko jako grupa zwinięta", (_rola, uklad) => {
    const { grupy, grupaZwinieta } = uklad();
    expect(grupy.map((g) => g.naglowek)).not.toContain(GRUPA_DOTYCHCZASOWA);
    expect(grupaZwinieta?.naglowek).toBe(GRUPA_DOTYCHCZASOWA);
    expect(grupaZwinieta?.pozycje.length).toBeGreaterThan(0);
  });

  it("wolontariusz: linia programu bez dziennika stażu, superwizji i dokumentów; konto bez profilu", () => {
    const { grupy, liniaKonta } = ukladMenuRamki(menuRamkiUczestnika("volunteer"), "/panel/pulpit", W_PRZYGOTOWANIU_KONTO_UCZESTNIKA);
    expect(grupy.find((g) => g.naglowek === "Program")?.liniaWPrzygotowaniu).toBe(
      "pytania i odpowiedzi · ścieżka programu · zaświadczenie o ukończeniu kursu",
    );
    expect(liniaKonta).toBe("pomoc");
  });

  it("administracja: „certyfikaty” zdjęte z linii Rozliczenia (pozycja „Certyfikaty” jest w menu)", () => {
    const { grupy } = ukladMenuRamki(menuRamkiAdministracji(), "/admin");
    expect(grupy.find((g) => g.naglowek === "Rozliczenie")?.liniaWPrzygotowaniu).toBe("ustawienia roku programu");
  });

  it("prowadzący: „moja grupa” zdjęta z linii programu (pozycja „Moja grupa” jest w menu)", () => {
    const { grupy, liniaKonta } = ukladMenuRamki(menuRamkiProwadzacego(), "/prowadzacy", W_PRZYGOTOWANIU_KONTO_PROWADZACEGO);
    expect(grupy.find((g) => g.naglowek === "Program")?.liniaWPrzygotowaniu).toBe("superwizja");
    expect(liniaKonta).toBe(W_PRZYGOTOWANIU_KONTO_PROWADZACEGO);
  });
});

describe("liniaBezPozycjiMenu", () => {
  const menu = [{ naglowek: "A", pozycje: [{ ikona: "file" as const, etykieta: "Dokumenty", href: "/d" }] }];

  it("odejmuje bez względu na wielkość liter, kolejność reszty zostaje", () => {
    expect(liniaBezPozycjiMenu("pomoc · dokumenty · profil", menu)).toBe("pomoc · profil");
  });

  it("linia pusta po odjęciu i brak linii — undefined", () => {
    expect(liniaBezPozycjiMenu("dokumenty", menu)).toBeUndefined();
    expect(liniaBezPozycjiMenu(undefined, menu)).toBeUndefined();
  });
});
