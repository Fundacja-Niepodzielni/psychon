import { describe, expect, it } from "vitest";
import { GRUPA_DOTYCHCZASOWA, GRUPA_USTAWIENIA, menuRamkiAdministracji } from "../administracja";
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

  it("student: linia programu bez dziennika stażu i superwizji (student ich nie ma) i bez dokumentów (są w menu)", () => {
    const { grupy, liniaKonta } = ukladMenuRamki(menuRamkiUczestnika("student"), "/panel/pulpit", W_PRZYGOTOWANIU_KONTO_UCZESTNIKA);
    expect(grupy.find((g) => g.naglowek === "Program")?.liniaWPrzygotowaniu).toBe(
      "pytania i odpowiedzi · ścieżka programu · zaświadczenie o ukończeniu kursu",
    );
    expect(liniaKonta).toBe("pomoc");
  });

  it("administracja: „certyfikaty” zdjęte z linii Rozliczenia (pozycja „Certyfikaty” jest w menu), „ustawienia roku programu” w Ustawieniach", () => {
    const { grupy } = ukladMenuRamki(menuRamkiAdministracji(), "/admin");
    expect(grupy.find((g) => g.naglowek === "Rozliczenie")?.liniaWPrzygotowaniu).toBeUndefined();
    expect(grupy.find((g) => g.naglowek === GRUPA_USTAWIENIA)?.liniaWPrzygotowaniu).toBe("ustawienia roku programu");
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

describe("administracja — grupa zwijana „Ustawienia” w układzie", () => {
  it("flaga zwijania tylko na „Ustawieniach”; „Dotychczasowy panel” osobno jako grupaZwinieta, bez flagi", () => {
    const { grupy, grupaZwinieta } = ukladMenuRamki(menuRamkiAdministracji(), "/admin");
    expect(grupy.map((g) => g.naglowek)).toEqual(["Codziennie", "Program", "Rozliczenie", GRUPA_USTAWIENIA]);
    expect(grupy.filter((g) => g.zwijana).map((g) => g.naglowek)).toEqual([GRUPA_USTAWIENIA]);
    expect(grupaZwinieta?.naglowek).toBe(GRUPA_DOTYCHCZASOWA);
    expect(grupaZwinieta?.zwijana).toBeUndefined();
  });

  it("trzy linie „W przygotowaniu”: Program „prowadzący”, Rozliczenie bez linii (certyfikaty są pozycją menu), Ustawienia „ustawienia roku programu”", () => {
    const { grupy } = ukladMenuRamki(menuRamkiAdministracji(), "/admin");
    const linia = (naglowek: string) => grupy.find((g) => g.naglowek === naglowek)?.liniaWPrzygotowaniu;
    expect(linia("Program")).toBe("prowadzący");
    expect(linia("Rozliczenie")).toBeUndefined();
    expect(linia(GRUPA_USTAWIENIA)).toBe("ustawienia roku programu");
  });

  it.each([
    ["/admin/ustawienia", "Ustawienia edycji"],
    ["/admin/formy-stazu", "Słownik form stażu"],
    ["/admin/wzory-dokumentow", "Wzory dokumentów"],
    ["/admin/wzory-dokumentow/5", "Wzory dokumentów"],
    ["/admin/ekran-startowy", "Treść ekranu „Zacznij tutaj”"],
  ])("%s: pozycja „%s” w „Ustawieniach” jest bieżąca, poza grupą nic nie jest bieżące", (sciezka, etykieta) => {
    const { grupy, grupaZwinieta } = ukladMenuRamki(menuRamkiAdministracji(), sciezka);
    const wszystkie = [...grupy, ...(grupaZwinieta ? [grupaZwinieta] : [])];
    expect(wszystkie.flatMap((g) => g.pozycje).filter((p) => p.biezaca === true).map((p) => p.etykieta)).toEqual([etykieta]);
    expect(grupy.find((g) => g.naglowek === GRUPA_USTAWIENIA)?.pozycje.some((p) => p.biezaca === true)).toBe(true);
  });

  it("ekran spoza grupy: żadna pozycja „Ustawień” nie jest bieżąca", () => {
    const { grupy } = ukladMenuRamki(menuRamkiAdministracji(), "/admin/kursy");
    expect(grupy.find((g) => g.naglowek === GRUPA_USTAWIENIA)?.pozycje.some((p) => p.biezaca)).toBe(false);
  });

  it.each([
    ["wolontariusz", () => menuRamkiUczestnika("volunteer")],
    ["student", () => menuRamkiUczestnika("student")],
    ["prowadzący", () => menuRamkiProwadzacego()],
  ] as const)("%s: żadna grupa menu ani układu nie ma flagi zwijania", (_rola, menu) => {
    const m = menu();
    expect(m.filter((g) => "zwijana" in g)).toEqual([]);
    const { grupy, grupaZwinieta } = ukladMenuRamki(m, "/panel/pulpit");
    expect([...grupy, ...(grupaZwinieta ? [grupaZwinieta] : [])].filter((g) => "zwijana" in g)).toEqual([]);
  });
});

describe("administracja — linia programu bez stażu i superwizji", () => {
  it("żadna linia „W przygotowaniu” administracji nie wymienia stażu ani superwizji (obie funkcje są w menu)", () => {
    const { grupy, grupaZwinieta } = ukladMenuRamki(menuRamkiAdministracji(), "/admin");
    const linie = [...grupy, ...(grupaZwinieta ? [grupaZwinieta] : [])].map((g) => g.liniaWPrzygotowaniu ?? "");
    expect(linie.join(" | ")).not.toMatch(/staż|superwizj/i);
    expect(grupy.find((g) => g.naglowek === "Program")?.liniaWPrzygotowaniu).toBe("prowadzący");
  });
});

describe("administracja — rodzic podstrony („Sprawy”) w układzie menu", () => {
  const pozycjaSpraw = (sciezka: string) =>
    ukladMenuRamki(menuRamkiAdministracji(), sciezka)
      .grupy.flatMap((g) => g.pozycje)
      .find((p) => p.etykieta === "Sprawy");

  it.each(["/admin/staz", "/admin/staz/4", "/admin/nabor", "/admin/nabor/17"])(
    "%s: „Sprawy” oznaczone jako sekcja (aria-current=\"true\"), nie jako strona bieżąca",
    (sciezka) => {
      expect(pozycjaSpraw(sciezka)?.biezaca).toBe("sekcja");
    },
  );

  it("na liście Spraw „Sprawy” to strona bieżąca (true), a na obcej ścieżce — false", () => {
    expect(pozycjaSpraw("/admin/sprawy")?.biezaca).toBe(true);
    expect(pozycjaSpraw("/admin/sprawy/5")?.biezaca).toBe(true);
    expect(pozycjaSpraw("/admin/uczestniczki")?.biezaca).toBe(false);
  });

  it("na podstronie nic innego w menu nie jest bieżące, a pozycji Dyżurów ani zgłoszeń w menu nie ma", () => {
    for (const sciezka of ["/admin/staz", "/admin/nabor/17"]) {
      const { grupy, grupaZwinieta } = ukladMenuRamki(menuRamkiAdministracji(), sciezka);
      const wszystkie = [...grupy, ...(grupaZwinieta ? [grupaZwinieta] : [])].flatMap((g) => g.pozycje);
      expect(wszystkie.filter((p) => p.biezaca === true).map((p) => p.etykieta), sciezka).toEqual([]);
      expect(wszystkie.filter((p) => p.biezaca === "sekcja").map((p) => p.etykieta), sciezka).toEqual(["Sprawy"]);
      expect(wszystkie.map((p) => p.etykieta), sciezka).not.toContain("Dyżury do decyzji");
      expect(wszystkie.map((p) => p.etykieta), sciezka).not.toContain("Zgłoszenia rekrutacyjne");
    }
  });
});
