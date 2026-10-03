import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ApiError } from "@/lib/api/klient";
import type { AdminUserListItem } from "@/lib/api/h18";
import type { AdminUserListItemWithSupervisor } from "@/lib/api/przypisanie-prowadzacego";
import {
  BRAK_PROWADZACEGO,
  LICZBA_NA_STRONE,
  OPCJE_ROLI,
  PUSTY_FILTR,
  ROLA_DO_PRZYPISANIA,
  etykietaRoli,
  filtrAktywny,
  filtryZapytania,
  rodzajBledu,
  wierszeOsob,
  KOLUMNY_OSOB,
} from "../dane";

/**
 * Logika danych listy osób oraz zgodność atrapy z zapleczem: klucze wiersza
 * czytane ze stałej `FIELDS` zasobu `AdminUserListResource.php`, parametry
 * zapytania z `AdminUserQuery.php`, klucze `meta` z `openapi.json` (pliki są
 * czytane, nie przepisane).
 */

const KATALOG_FRONTU = process.cwd();
const ZASOB_PHP = join(KATALOG_FRONTU, "..", "backend", "app", "Http", "Resources", "AdminUserListResource.php");
const ZAPYTANIE_PHP = join(KATALOG_FRONTU, "..", "backend", "app", "Queries", "AdminUserQuery.php");
const OPENAPI = join(KATALOG_FRONTU, "..", "backend", "openapi.json");
const USLUGA_PHP = join(KATALOG_FRONTU, "..", "backend", "app", "Services", "H12", "SupervisorAssignmentService.php");

/** Klucze ze stałej `FIELDS` zasobu (albo innej stałej tablicy o podanej nazwie). */
function kluczeZasobu(zrodlo: string, stala = "FIELDS"): string[] {
  const poczatek = zrodlo.indexOf(`const array ${stala} = [`);
  const koniec = zrodlo.indexOf("];", poczatek);
  return [...zrodlo.slice(poczatek, koniec).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

/** Nazwy parametrów query czytane przez zapytanie (`query('x'`, `integer('x'`). */
function parametryZapytania(zrodlo: string): string[] {
  return [...zrodlo.matchAll(/(?:query|integer)\('([a-z_]+)'/g)].map((m) => m[1]);
}

function roznicaKluczy(a: string[], b: string[]): string[] {
  const zbiorA = new Set(a);
  const zbiorB = new Set(b);
  return [...a.filter((k) => !zbiorB.has(k)), ...b.filter((k) => !zbiorA.has(k))].sort();
}

const ATRAPA: AdminUserListItem & Record<string, unknown> = {
  id: 17,
  first_name: "Marta",
  last_name: "Demo",
  email: "marta@demo.pl",
  role: "volunteer",
  status: "active",
  product_group: "psychon",
  access_expires_at: "2027-02-01T00:00:00Z",
  program_completed_at: null,
  created_at: "2026-09-20T10:00:00Z",
};

/** Wiersz listy z polem tylko do odczytu `supervisor` (spoza pliku CSV). */
const ATRAPA_Z_PROWADZACYM: AdminUserListItemWithSupervisor & Record<string, unknown> = {
  ...ATRAPA,
  supervisor: { id: 5, name: "Joanna Demo" },
};

describe("Osoby — zapytanie", () => {
  it("bez filtra: nic poza stroną i rozmiarem strony", () => {
    expect(filtryZapytania(PUSTY_FILTR, 1)).toEqual({
      role: undefined,
      search: undefined,
      page: 1,
      per_page: LICZBA_NA_STRONE,
    });
  });

  it("rola i przycięta fraza; fraza z samych spacji nie trafia do zapytania", () => {
    expect(filtryZapytania({ role: "student", search: " ala " }, 3)).toEqual({
      role: "student",
      search: "ala",
      page: 3,
      per_page: 25,
    });
    expect(filtryZapytania({ role: "", search: "   " }, 1).search).toBeUndefined();
  });

  it("eksport: ten sam filtr bez stronicowania", () => {
    expect(filtryZapytania({ role: "volunteer", search: "k" })).toEqual({
      role: "volunteer",
      search: "k",
      page: undefined,
      per_page: undefined,
    });
  });

  it("fraza jest ucinana do 255 znaków", () => {
    expect(filtryZapytania({ role: "", search: "x".repeat(400) }, 1).search).toHaveLength(255);
  });

  it("wysyłane parametry są czytane przez zapytanie zaplecza, a rozmiar strony mieści się w limicie", () => {
    const zrodlo = readFileSync(ZAPYTANIE_PHP, "utf-8");
    const czytane = parametryZapytania(zrodlo);
    expect(czytane).toEqual(expect.arrayContaining(["role", "search", "per_page"]));
    const wysylane = Object.entries(filtryZapytania({ role: "student", search: "a" }, 2))
      .filter(([, wartosc]) => wartosc !== undefined)
      .map(([klucz]) => klucz)
      .filter((klucz) => klucz !== "page");
    expect(wysylane.filter((k) => !czytane.includes(k))).toEqual([]);
    expect(zrodlo).toMatch(/integer\('per_page', 25\), 1\), 100\)/);
    expect(LICZBA_NA_STRONE).toBeLessThanOrEqual(100);
  });

  it("filtrAktywny odróżnia pusty filtr od ustawionego", () => {
    expect(filtrAktywny(PUSTY_FILTR)).toBe(false);
    expect(filtrAktywny({ role: "student", search: "" })).toBe(true);
    expect(filtrAktywny({ role: "", search: "a" })).toBe(true);
  });

  it("opcje roli: pusta „Wszystkie role” i pięć ról w etykietach polskich", () => {
    expect(OPCJE_ROLI.map((o) => o.wartosc)).toEqual([
      "",
      "super_admin",
      "project_manager",
      "instructor",
      "volunteer",
      "student",
    ]);
    expect(OPCJE_ROLI.every((o) => !/_/.test(o.etykieta))).toBe(true);
  });
});

describe("Osoby — klasyfikacja błędu", () => {
  it("401 i 403 to odmowa roli, reszta to błąd do ponowienia", () => {
    const blad = (status: number) => new ApiError({ status, code: "x", message: "m" });
    expect(rodzajBledu(blad(401))).toBe("brak-uprawnien");
    expect(rodzajBledu(blad(403))).toBe("brak-uprawnien");
    expect(rodzajBledu(blad(500))).toBe("siec");
    expect(rodzajBledu(new TypeError("Failed to fetch"))).toBe("siec");
  });
});

describe("Osoby — wiersze", () => {
  it("kolumny w kolejności: Osoba, Rola, Prowadzący, Stan, akcja", () => {
    expect(KOLUMNY_OSOB.map((kolumna) => [kolumna.nazwa, kolumna.rodzaj])).toEqual([
      ["Osoba", "osoba"],
      ["Rola", "tekst"],
      ["Prowadzący", "tekst"],
      ["Stan", "stan"],
      ["Akcja", "akcja"],
    ]);
  });

  // Nazwa pierwsza, pod nią e-mail; rola po polsku we własnej kolumnie, prowadzący, plakietka małą literą, akcja „Otwórz”.
  it("wiersz niesie nazwisko z e-mailem, rolę po polsku, prowadzącego, stan konta małą literą i „Otwórz” z pełną nazwą dla czytnika", () => {
    const [wiersz] = wierszeOsob([{ ...ATRAPA_Z_PROWADZACYM, role: "project_manager", supervisor: null }]);
    expect(wiersz).toEqual({
      id: 17,
      nazwa: "Marta Demo",
      email: "marta@demo.pl",
      rola: "Opiekun Projektu",
      prowadzacy: "brak",
      plakietka: { wariant: "ok", tekst: "konto aktywne" },
      akcja: {
        etykieta: "Otwórz",
        etykietaDostepna: "Otwórz kartę: Marta Demo",
        href: "/admin/uczestniczki/17",
      },
      doWyboru: false,
      wybor: { id: 17, nazwa: "Marta Demo", prowadzacy: null },
    });
  });

  it("konto zablokowane ma osobną plakietkę, małą literą", () => {
    const [wiersz] = wierszeOsob([{ ...ATRAPA_Z_PROWADZACYM, status: "blocked" }]);
    expect(wiersz.plakietka).toEqual({ wariant: "error", tekst: "konto zablokowane" });
  });

  it("prowadzący z odpowiedzi trafia do kolumny i do zaznaczenia; bez prowadzącego kolumna mówi „brak”", () => {
    const [z, bez] = wierszeOsob([ATRAPA_Z_PROWADZACYM, { ...ATRAPA_Z_PROWADZACYM, id: 18, supervisor: null }]);
    expect(z.prowadzacy).toBe("Joanna Demo");
    expect(z.wybor.prowadzacy).toEqual({ id: 5, name: "Joanna Demo" });
    expect(bez.prowadzacy).toBe(BRAK_PROWADZACEGO);
    expect(BRAK_PROWADZACEGO).toBe("brak");
  });

  it("wolontariusz z kontem zablokowanym albo zanonimizowanym nie ma pola wyboru; zaproszony ma", () => {
    const stany = ["active", "blocked", "deleted", "invited"];
    const wiersze = wierszeOsob(
      stany.map((stan, indeks) => ({ ...ATRAPA_Z_PROWADZACYM, id: indeks + 1, status: stan }) as typeof ATRAPA_Z_PROWADZACYM),
    );
    expect(wiersze.map((wiersz) => wiersz.doWyboru)).toEqual([true, false, false, true]);
  });

  it("pole wyboru ma wyłącznie wiersz wolontariusza — tylko taką osobę serwer przypisze", () => {
    expect(ROLA_DO_PRZYPISANIA).toBe("volunteer");
    const role = ["volunteer", "student", "instructor", "project_manager", "super_admin"] as const;
    const wiersze = wierszeOsob(role.map((rola, indeks) => ({ ...ATRAPA_Z_PROWADZACYM, id: indeks + 1, role: rola })));
    expect(wiersze.map((wiersz) => wiersz.doWyboru)).toEqual([true, false, false, false, false]);
  });

  it("rola do przypisania jest tą samą, którą sprawdza usługa zaplecza", () => {
    const usluga = readFileSync(USLUGA_PHP, "utf-8");
    expect(usluga).toContain(`$person->role === '${ROLA_DO_PRZYPISANIA}'`);
  });

  it("nieznana rola nie wychodzi na ekran jako surowy kod", () => {
    expect(etykietaRoli("obca_rola")).toBe("Nieznana rola");
    expect(etykietaRoli("super_admin")).toBe("Super Admin");
  });
});

describe("Osoby — atrapa zgodna z zapleczem", () => {
  it("pliki zaplecza istnieją (pomiar nie jest pusty)", () => {
    expect(existsSync(ZASOB_PHP)).toBe(true);
    expect(existsSync(ZAPYTANIE_PHP)).toBe(true);
    expect(kluczeZasobu(readFileSync(ZASOB_PHP, "utf-8")).length).toBeGreaterThanOrEqual(10);
  });

  it("atrapa ma dokładnie klucze zasobu", () => {
    expect(roznicaKluczy(Object.keys(ATRAPA), kluczeZasobu(readFileSync(ZASOB_PHP, "utf-8")))).toEqual([]);
  });

  it("wiersz z prowadzącym ma dokładnie klucze zasobu i pola tylko do odczytu", () => {
    const zrodlo = readFileSync(ZASOB_PHP, "utf-8");
    const tylkoDoOdczytu = kluczeZasobu(zrodlo, "READ_ONLY_FIELDS");
    expect(tylkoDoOdczytu).toEqual(["supervisor"]);
    expect(roznicaKluczy(Object.keys(ATRAPA_Z_PROWADZACYM), [...kluczeZasobu(zrodlo), ...tylkoDoOdczytu])).toEqual([]);
  });

  it("kontrola dodatnia: usunięty albo dodany klucz daje różnicę", () => {
    const klucze = kluczeZasobu(readFileSync(ZASOB_PHP, "utf-8"));
    expect(roznicaKluczy(Object.keys(ATRAPA).filter((k) => k !== "role"), klucze)).toEqual(["role"]);
    expect(roznicaKluczy([...Object.keys(ATRAPA), "nowy_klucz"], klucze)).toEqual(["nowy_klucz"]);
  });

  it("meta odpowiedzi ma wszystkie klucze wymagane w opisie zaplecza", () => {
    const opis = JSON.parse(readFileSync(OPENAPI, "utf-8"));
    const wymagane: string[] =
      opis.paths["/v1/admin/users"].get.responses["200"].content["application/json"].schema.properties.meta.required;
    expect(wymagane).toEqual(expect.arrayContaining(["current_page", "per_page", "total", "last_page"]));
  });

  it("opis zaplecza zna trasę eksportu w typie text/csv", () => {
    const opis = JSON.parse(readFileSync(OPENAPI, "utf-8"));
    expect(Object.keys(opis.paths["/v1/admin/users/export.csv"].get.responses["200"].content)).toEqual([
      "text/csv; charset=utf-8",
    ]);
  });
});
