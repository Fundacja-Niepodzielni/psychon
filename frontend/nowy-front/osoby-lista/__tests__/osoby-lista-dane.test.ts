import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ApiError } from "@/lib/api/klient";
import type { AdminUserListItem } from "@/lib/api/h18";
import {
  LICZBA_NA_STRONE,
  OPCJE_ROLI,
  PUSTY_FILTR,
  etykietaRoli,
  filtrAktywny,
  filtryZapytania,
  rodzajBledu,
  wierszeOsob,
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

/** Klucze ze stałej `FIELDS` zasobu. */
function kluczeZasobu(zrodlo: string): string[] {
  const poczatek = zrodlo.indexOf("FIELDS = [");
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

describe("Uczestnicy programu — zapytanie", () => {
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

describe("Uczestnicy programu — klasyfikacja błędu", () => {
  it("401 i 403 to odmowa roli, reszta to błąd do ponowienia", () => {
    const blad = (status: number) => new ApiError({ status, code: "x", message: "m" });
    expect(rodzajBledu(blad(401))).toBe("brak-uprawnien");
    expect(rodzajBledu(blad(403))).toBe("brak-uprawnien");
    expect(rodzajBledu(blad(500))).toBe("siec");
    expect(rodzajBledu(new TypeError("Failed to fetch"))).toBe("siec");
  });
});

describe("Uczestnicy programu — wiersze", () => {
  it("wiersz niesie nazwisko, rolę po polsku, stan konta i odnośnik do karty", () => {
    const [wiersz] = wierszeOsob([{ ...ATRAPA, role: "project_manager" }]);
    expect(wiersz.id).toBe("17");
    expect(wiersz.tytul).toBe("Marta Demo");
    expect(wiersz.podpowiedz).toBe("marta@demo.pl · Opiekun Projektu");
    expect(wiersz.plakietka).toEqual({ wariant: "ok", tekst: "Konto aktywne" });
    expect(wiersz.akcja).toEqual({ etykieta: "Otwórz kartę", href: "/admin/uczestniczki/17" });
  });

  it("konto zablokowane ma osobną plakietkę", () => {
    const [wiersz] = wierszeOsob([{ ...ATRAPA, status: "blocked" }]);
    expect(wiersz.plakietka).toEqual({ wariant: "error", tekst: "Konto zablokowane" });
  });

  it("nieznana rola nie wychodzi na ekran jako surowy kod", () => {
    expect(etykietaRoli("obca_rola")).toBe("Nieznana rola");
    expect(etykietaRoli("super_admin")).toBe("Super Admin");
  });
});

describe("Uczestnicy programu — atrapa zgodna z zapleczem", () => {
  it("pliki zaplecza istnieją (pomiar nie jest pusty)", () => {
    expect(existsSync(ZASOB_PHP)).toBe(true);
    expect(existsSync(ZAPYTANIE_PHP)).toBe(true);
    expect(kluczeZasobu(readFileSync(ZASOB_PHP, "utf-8")).length).toBeGreaterThanOrEqual(10);
  });

  it("atrapa ma dokładnie klucze zasobu", () => {
    expect(roznicaKluczy(Object.keys(ATRAPA), kluczeZasobu(readFileSync(ZASOB_PHP, "utf-8")))).toEqual([]);
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
