import { describe, expect, it } from "vitest";
import { adresPowrotuZPodgladu, czyTrybPodgladu, ROLE_PODGLADU, zParametremPodgladu } from "../tryb-podgladu";

describe("czyTrybPodgladu — parametr i rola", () => {
  it.each([
    { nazwa: "personel (opiekun projektu) z parametrem", parametr: "1", rola: "project_manager", oczekiwane: true },
    { nazwa: "personel (super-admin) z parametrem", parametr: "1", rola: "super_admin", oczekiwane: true },
    { nazwa: "prowadzący z parametrem", parametr: "1", rola: "instructor", oczekiwane: true },
    { nazwa: "personel bez parametru", parametr: null, rola: "project_manager", oczekiwane: false },
    { nazwa: "uczestnik z parametrem", parametr: "1", rola: "volunteer", oczekiwane: false },
    { nazwa: "student z parametrem", parametr: "1", rola: "student", oczekiwane: false },
    { nazwa: "rola jeszcze nieznana", parametr: "1", rola: null, oczekiwane: false },
    { nazwa: "rola nieodczytana", parametr: "1", rola: undefined, oczekiwane: false },
    { nazwa: "parametr o innej wartości", parametr: "0", rola: "instructor", oczekiwane: false },
    { nazwa: "parametr pusty", parametr: "", rola: "instructor", oczekiwane: false },
    { nazwa: "parametr „true” nie włącza", parametr: "true", rola: "super_admin", oczekiwane: false },
    { nazwa: "parametr powtórzony: liczy się pierwszy", parametr: ["1", "0"], rola: "instructor", oczekiwane: true },
    { nazwa: "parametr powtórzony: pierwszy zły", parametr: ["0", "1"], rola: "instructor", oczekiwane: false },
    { nazwa: "pusta lista parametrów", parametr: [], rola: "instructor", oczekiwane: false },
  ])("$nazwa → $oczekiwane", ({ parametr, rola, oczekiwane }) => {
    expect(czyTrybPodgladu(parametr, rola)).toBe(oczekiwane);
  });

  it("kontrola dodatnia: te same dane z samą zmianą roli albo parametru przełączają wynik", () => {
    expect(czyTrybPodgladu("1", "instructor")).toBe(true);
    expect(czyTrybPodgladu("1", "volunteer")).toBe(false);
    expect(czyTrybPodgladu(null, "instructor")).toBe(false);
  });

  it("role podglądu to dokładnie personel i prowadzący", () => {
    expect([...ROLE_PODGLADU].sort()).toEqual(["instructor", "project_manager", "super_admin"]);
  });
});

describe("zParametremPodgladu", () => {
  it("dopisuje parametr do adresu bez zapytania", () => {
    expect(zParametremPodgladu("/panel/lekcje/21", true)).toBe("/panel/lekcje/21?podglad=1");
  });

  it("zachowuje pozostałe parametry i fragment", () => {
    expect(zParametremPodgladu("/panel/lekcje/21?kurs=pierwsza-pomoc#tresc", true)).toBe("/panel/lekcje/21?kurs=pierwsza-pomoc&podglad=1#tresc");
  });

  it("zastępuje parametr już obecny, zamiast go dublować", () => {
    expect(zParametremPodgladu("/panel/kursy/a/test?podglad=0&x=1", true)).toBe("/panel/kursy/a/test?podglad=1&x=1");
    expect(zParametremPodgladu("/a?podglad=1", true).match(/podglad/g)).toHaveLength(1);
  });

  it("bez podglądu zwraca adres bez zmian", () => {
    expect(zParametremPodgladu("/panel/lekcje/21?kurs=a", false)).toBe("/panel/lekcje/21?kurs=a");
  });

  it("nie dotyka adresów, które nie są wewnętrzne", () => {
    for (const obcy of ["https://example.org/a", "//example.org/a", "javascript:alert(1)", "mailto:a@example.org", "lekcje/21", ""]) {
      expect(zParametremPodgladu(obcy, true)).toBe(obcy);
    }
  });

  it("koduje wartości pozostałych parametrów tak, że adres zostaje poprawny", () => {
    expect(zParametremPodgladu("/a?q=ż ó", true)).toBe("/a?q=%C5%BC+%C3%B3&podglad=1");
  });
});

describe("adresPowrotuZPodgladu — według roli", () => {
  it("personel wraca do ekranu kursu administracji", () => {
    expect(adresPowrotuZPodgladu("project_manager", 12)).toBe("/admin/kursy/12");
    expect(adresPowrotuZPodgladu("super_admin", "12")).toBe("/admin/kursy/12");
  });

  it("prowadzący wraca do swojego ekranu kursu", () => {
    expect(adresPowrotuZPodgladu("instructor", 12)).toBe("/prowadzacy/kursy/12");
  });

  it("uczestnik i brak roli nie dostają adresu powrotu", () => {
    expect(adresPowrotuZPodgladu("volunteer", 12)).toBeNull();
    expect(adresPowrotuZPodgladu("student", 12)).toBeNull();
    expect(adresPowrotuZPodgladu(null, 12)).toBeNull();
    expect(adresPowrotuZPodgladu(undefined, 12)).toBeNull();
  });

  it("kontrola dodatnia: dwie role dają dwa różne adresy", () => {
    expect(adresPowrotuZPodgladu("instructor", 5)).not.toBe(adresPowrotuZPodgladu("super_admin", 5));
  });
});
