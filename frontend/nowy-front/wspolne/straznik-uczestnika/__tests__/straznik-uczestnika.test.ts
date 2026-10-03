import { describe, expect, it } from "vitest";
import {
  ROLE_UCZESTNIKA,
  czyAdresZTrybemPodgladu,
  czyPodgladPersonelu,
  maRoleUczestnika,
  roleKonta,
} from "../straznik-uczestnika";

describe("role uczestnika", () => {
  it("to student i volunteer", () => {
    expect([...ROLE_UCZESTNIKA]).toEqual(["student", "volunteer"]);
  });

  it.each([
    [["student"], true],
    [["volunteer"], true],
    [["instructor", "volunteer"], true],
    [["instructor"], false],
    [["project_manager"], false],
    [["super_admin", "project_manager"], false],
    [[], false],
  ])("role %j → %s", (role, wynik) => {
    expect(maRoleUczestnika(role)).toBe(wynik);
  });
});

describe("roleKonta", () => {
  it("rola główna i lista roles, bez powtórzeń", () => {
    expect(roleKonta({ role: "instructor", roles: ["instructor", "volunteer"] })).toEqual(["instructor", "volunteer"]);
  });

  it("bez listy roles sama rola główna", () => {
    expect(roleKonta({ role: "student" })).toEqual(["student"]);
  });

  it("bez roli głównej sama lista roles", () => {
    expect(roleKonta({ role: null, roles: ["volunteer"] })).toEqual(["volunteer"]);
  });

  it("pomija wartości inne niż tekst i odpowiedź bez ról", () => {
    expect(roleKonta({ roles: ["volunteer", 3, null] })).toEqual(["volunteer"]);
    expect(roleKonta({ role: 7 })).toEqual([]);
    expect(roleKonta({})).toEqual([]);
    expect(roleKonta(null)).toEqual([]);
  });
});

describe("adresy ekranów z trybem podglądu", () => {
  it.each([
    "/panel/kursy/wywiad",
    "/panel/kursy/wywiad/",
    "/panel/kursy/wywiad/test",
    "/panel/lekcje/21",
    "/nowy-front/kurs-uczestnika/wywiad",
    "/nowy-front/kurs-uczestnika/wywiad/test",
    "/nowy-front/lekcja/21",
  ])("%s ma tryb podglądu", (adres) => {
    expect(czyAdresZTrybemPodgladu(adres)).toBe(true);
  });

  it.each([
    "/panel",
    "/panel/pulpit",
    "/panel/kursy",
    "/panel/kursy/wywiad/inne",
    "/panel/kursy/wywiad/test/dalej",
    "/panel/lekcje",
    "/panel/dokumenty",
    "/panel/dalsza-wspolpraca",
    "/panel/start",
    "/nowy-front/pulpit",
    "/nowy-front/publiczne/panel/start",
    "/x/panel/kursy/wywiad",
  ])("%s nie ma trybu podglądu", (adres) => {
    expect(czyAdresZTrybemPodgladu(adres)).toBe(false);
  });
});

describe("czyPodgladPersonelu", () => {
  it.each(["project_manager", "super_admin", "instructor"])("rola %s z podglad=1 na ekranie kursu: tak", (rola) => {
    expect(czyPodgladPersonelu([rola], "/panel/kursy/wywiad", "1")).toBe(true);
  });

  it("bez parametru, z inną wartością albo na ekranie bez trybu podglądu: nie", () => {
    expect(czyPodgladPersonelu(["project_manager"], "/panel/kursy/wywiad", null)).toBe(false);
    expect(czyPodgladPersonelu(["project_manager"], "/panel/kursy/wywiad", "0")).toBe(false);
    expect(czyPodgladPersonelu(["project_manager"], "/panel/pulpit", "1")).toBe(false);
  });

  it("rola uczestnika albo brak roli z podglad=1: nie (uczestnik widzi ekran jako uczestnik)", () => {
    expect(czyPodgladPersonelu(["student"], "/panel/kursy/wywiad", "1")).toBe(false);
    expect(czyPodgladPersonelu([], "/panel/kursy/wywiad", "1")).toBe(false);
  });
});
