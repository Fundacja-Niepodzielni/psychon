import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ApiError } from "@/lib/api/klient";
import {
  LICZBA_NA_STRONE,
  OPCJE_STATUSU,
  PLAKIETKA_STATUSU,
  PUSTY_FILTR,
  dataPl,
  etykietaRoli,
  filtrAktywny,
  rodzajBledu,
  sciezkaZapytania,
  wierszeZgloszen,
} from "../dane";
import type { ApplicationItem } from "@/lib/h03/types";

/**
 * Logika danych listy zgłoszeń oraz zgodność atrapy z zapleczem: klucze
 * zasobu czytane z `ApplicationResource.php`, parametry i enumy zapytania
 * z `openapi.json` (plik jest czytany, nie przepisany).
 */

const KATALOG_FRONTU = process.cwd();
const ZASOB_PHP = join(KATALOG_FRONTU, "..", "backend", "app", "Http", "Resources", "H03", "ApplicationResource.php");
const OPENAPI = join(KATALOG_FRONTU, "..", "backend", "openapi.json");

/** Klucze tablicy zwracanej przez `toArray` zasobu — wiersze `'klucz' =>` z wcięciem 12 spacji. */
function kluczeZasobu(zrodlo: string): string[] {
  const poczatek = zrodlo.indexOf("function toArray");
  const koniec = zrodlo.indexOf("];", poczatek);
  const wycinek = zrodlo.slice(poczatek, koniec);
  return [...wycinek.matchAll(/^ {12}'([a-z_]+)' =>/gm)].map((m) => m[1]);
}

/** Zwraca różnicę symetryczną dwóch zbiorów kluczy (pusta = zgodne). */
function roznicaKluczy(a: string[], b: string[]): string[] {
  const zbiorA = new Set(a);
  const zbiorB = new Set(b);
  return [...a.filter((k) => !zbiorB.has(k)), ...b.filter((k) => !zbiorA.has(k))].sort();
}

const ATRAPA: ApplicationItem & Record<string, unknown> = {
  id: 11,
  edition_id: 1,
  first_name: "Anna",
  last_name: "Kandydat",
  email: "kandydat@demo.pl",
  phone: null,
  source: null,
  role: "volunteer",
  payload: null,
  university: null,
  graduation_year: null,
  consent_regulamin_at: null,
  consent_polityka_at: null,
  status: "new",
  rejection_reason: null,
  decided_by: null,
  decided_at: null,
  user_id: null,
  has_diploma_scan: false,
  diploma_scan_url: null,
  created_at: "2026-09-20T10:00:00Z",
  updated_at: "2026-09-20T10:00:00Z",
};

interface ParametrOpenapi {
  name: string;
  schema: { enum?: string[]; maximum?: number };
}

function parametryListy(): ParametrOpenapi[] {
  const opis = JSON.parse(readFileSync(OPENAPI, "utf-8"));
  return opis.paths["/v1/admin/applications"].get.parameters as ParametrOpenapi[];
}

describe("Zgłoszenia rekrutacyjne — zapytanie", () => {
  it("bez filtra: tylko page i per_page", () => {
    expect(sciezkaZapytania(PUSTY_FILTR, 1)).toBe("/admin/applications?page=1&per_page=25");
  });

  it("status i przycięta fraza; pusta fraza z samych spacji nie trafia do zapytania", () => {
    expect(sciezkaZapytania({ status: "rejected", search: " ala " }, 3)).toBe(
      "/admin/applications?page=3&per_page=25&status=rejected&search=ala",
    );
    expect(sciezkaZapytania({ status: "", search: "   " }, 1)).toBe("/admin/applications?page=1&per_page=25");
  });

  it("fraza jest ucinana do 255 znaków (limit kontrolera)", () => {
    const adres = new URL(sciezkaZapytania({ status: "", search: "x".repeat(400) }, 1), "http://t");
    expect(adres.searchParams.get("search")).toHaveLength(255);
  });

  it("wszystkie parametry zapytania istnieją w opisie zaplecza, a stany filtra są jego enumem", () => {
    const parametry = parametryListy();
    const nazwy = parametry.map((p) => p.name);
    const wysylane = [
      ...new URL(sciezkaZapytania({ status: "new", search: "a" }, 2), "http://t").searchParams.keys(),
    ];
    expect(wysylane.filter((n) => !nazwy.includes(n))).toEqual([]);

    const statusy = parametry.find((p) => p.name === "status")!.schema.enum!;
    expect(OPCJE_STATUSU.map((o) => o.wartosc).filter((w) => w !== "")).toEqual(statusy);
    expect(parametry.find((p) => p.name === "per_page")!.schema.maximum).toBeGreaterThanOrEqual(LICZBA_NA_STRONE);
  });

  it("filtrAktywny odróżnia pusty filtr od ustawionego", () => {
    expect(filtrAktywny(PUSTY_FILTR)).toBe(false);
    expect(filtrAktywny({ status: "new", search: "" })).toBe(true);
    expect(filtrAktywny({ status: "", search: "a" })).toBe(true);
  });
});

describe("Zgłoszenia rekrutacyjne — klasyfikacja błędu", () => {
  it("401 i 403 to odmowa roli, reszta to błąd do ponowienia", () => {
    const blad = (status: number) => new ApiError({ status, code: "x", message: "m" });
    expect(rodzajBledu(blad(401))).toBe("brak-uprawnien");
    expect(rodzajBledu(blad(403))).toBe("brak-uprawnien");
    expect(rodzajBledu(blad(500))).toBe("siec");
    expect(rodzajBledu(blad(422))).toBe("siec");
    expect(rodzajBledu(new TypeError("Failed to fetch"))).toBe("siec");
  });
});

describe("Zgłoszenia rekrutacyjne — wiersze", () => {
  // Wiersz jak wiersz Spraw: pogrubione imię i nazwisko, meta po „·”, plakietka małą literą, akcja „Otwórz”.
  it("wiersz niesie pogrubione nazwisko, rolę po polsku w meta, stan małą literą i „Otwórz” z pełną nazwą dla czytnika", () => {
    const [wiersz] = wierszeZgloszen([{ ...ATRAPA, role: "instructor", status: "rejected" }]);
    expect(wiersz.id).toBe("11");
    expect(wiersz.tytul).toBe("Anna Kandydat");
    expect(wiersz.tytulPogrubiony).toBe(true);
    expect(wiersz.tytulDodatek).toBe(
      "kandydat@demo.pl · proponowana rola: Psycholog prowadzący · zgłoszono 20.09.2026",
    );
    expect(wiersz.podpowiedz).toBeUndefined();
    expect(wiersz.plakietka).toEqual({ wariant: "error", tekst: "odrzucone" });
    expect(wiersz.akcja).toEqual({
      etykieta: "Otwórz",
      etykietaDostepna: "Otwórz zgłoszenie: Anna Kandydat",
      href: "/admin/nabor/11",
    });
  });

  it("plakietki trzech stanów zaczynają się małą literą, a opcje filtra stanu wielką", () => {
    expect(Object.values(PLAKIETKA_STATUSU).map((p) => p.tekst)).toEqual([
      "czeka na decyzję",
      "zatwierdzone",
      "odrzucone",
    ]);
    expect(OPCJE_STATUSU.map((o) => o.etykieta)).toEqual([
      "Wszystkie",
      "Czeka na decyzję",
      "Zatwierdzone",
      "Odrzucone",
    ]);
  });

  it("nieznana rola nie wychodzi na ekran jako surowy kod", () => {
    expect(etykietaRoli("obca_rola")).toBe("Nieznana rola");
    expect(etykietaRoli("student")).toBe("Student");
  });

  it("data z ISO bez przesunięcia strefy; brak daty nazwany wprost", () => {
    expect(dataPl("2026-09-30T23:30:00Z")).toBe("30.09.2026");
    expect(dataPl(null)).toBe("brak daty");
  });
});

describe("Zgłoszenia rekrutacyjne — atrapa zgodna z zapleczem", () => {
  it("plik zasobu istnieje (pomiar nie jest pusty)", () => {
    expect(existsSync(ZASOB_PHP)).toBe(true);
    expect(kluczeZasobu(readFileSync(ZASOB_PHP, "utf-8")).length).toBeGreaterThan(15);
  });

  it("atrapa ma dokładnie klucze zasobu", () => {
    const klucze = kluczeZasobu(readFileSync(ZASOB_PHP, "utf-8"));
    expect(roznicaKluczy(Object.keys(ATRAPA), klucze)).toEqual([]);
  });

  it("kontrola dodatnia: usunięty albo dodany klucz daje różnicę", () => {
    const klucze = kluczeZasobu(readFileSync(ZASOB_PHP, "utf-8"));
    const bezJednego = Object.keys(ATRAPA).filter((k) => k !== "email");
    expect(roznicaKluczy(bezJednego, klucze)).toEqual(["email"]);
    expect(roznicaKluczy([...Object.keys(ATRAPA), "nowy_klucz"], klucze)).toEqual(["nowy_klucz"]);
  });

  it("meta odpowiedzi ma wszystkie klucze wymagane w opisie zaplecza", () => {
    const opis = JSON.parse(readFileSync(OPENAPI, "utf-8"));
    const wymagane: string[] =
      opis.paths["/v1/admin/applications"].get.responses["200"].content["application/json"].schema.properties.meta
        .required;
    expect(wymagane).toEqual(
      expect.arrayContaining(["current_page", "per_page", "total", "last_page"]),
    );
  });
});
