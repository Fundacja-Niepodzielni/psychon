// @vitest-environment node

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AUDIT_ACTIONS } from "@/lib/api/h20";
import { BEZ_WYKONAWCY, NIKT } from "../dane";
import { CZYNNOSCI, GRUPY, nazwaGrupy, zdanie, ZDANIA, ZDANIE_NIEZNANE } from "../slownik";
import { KOLUMNY } from "../TabelaWpisow";

/**
 * Słownik ekranu „Dziennik działań”: jedno zdanie na każdy kod zdarzenia, te
 * same zdania, grupy i czynności co w zapleczu (`AuditLogMap.php`, z którego
 * mówi eksport). Pomiar czyta pliki zaplecza, nie zgaduje ich treści.
 */

const KORZEN = process.cwd();
const tekst = (sciezka: string) => readFileSync(join(KORZEN, "..", sciezka), "utf-8");
const MAPA = tekst("backend/app/Services/H20/AuditLogMap.php");
const ZADANIE = tekst("backend/app/Http/Requests/H20/AuditIndexRequest.php");
const ZASOB = tekst("backend/app/Http/Resources/AuditLogEntryResource.php");

/** Blok stałej PHP `const array NAZWA = [ ... ];`. */
function blok(kod: string, nazwa: string): string {
  const poczatek = kod.indexOf(`const array ${nazwa} = [`);
  expect(poczatek, `stała ${nazwa}`).toBeGreaterThanOrEqual(0);
  return kod.slice(poczatek, kod.indexOf("];", poczatek));
}

/** Rejestr kodów zaplecza (`AuditIndexRequest::ACTIONS`). */
const REJESTR = [...blok(ZADANIE, "ACTIONS").matchAll(/'([a-z_.]+)'/g)].map(([, kod]) => kod).sort();

/** `kod => [grupa, zdanie]` z `AuditLogMap::EVENTS`. */
const ZDARZENIA_ZAPLECZA = Object.fromEntries(
  [...blok(MAPA, "EVENTS").matchAll(/'([a-z_.]+)' => \['([a-z]+)', '([^']+)'\]/g)].map(([, kod, grupa, tresc]) => [
    kod,
    { grupa, tresc },
  ]),
);

/** Kody rejestru bez zdania w słowniku. */
function bezZdania(kody: string[], zdania: Record<string, string>): string[] {
  return kody.filter((kod) => !(kod in zdania));
}

describe("dziennik działań — słownik zdań", () => {
  it("każdy kod z rejestru zaplecza i z listy frontu ma zdanie, a słownik nie zna innych kodów", () => {
    expect(REJESTR).toHaveLength(34);
    expect(bezZdania(REJESTR, ZDANIA)).toEqual([]);
    expect(bezZdania([...AUDIT_ACTIONS], ZDANIA)).toEqual([]);
    expect(Object.keys(ZDANIA).sort()).toEqual(REJESTR);
  });

  it("kontrola: kod bez zdania jest wykryty", () => {
    const bezJednego = { ...ZDANIA };
    delete bezJednego["internship.accepted"];
    expect(bezZdania(REJESTR, bezJednego)).toEqual(["internship.accepted"]);
  });

  it("zdanie to czynność z zamkniętej listy i nazwa rzeczy — bez wartości i znaków zastępczych", () => {
    for (const [kod, tresc] of Object.entries(ZDANIA)) {
      expect(CZYNNOSCI as readonly string[], `czynność w zdaniu kodu ${kod}`).toContain(tresc.split(" ")[0]);
      expect(tresc, kod).not.toMatch(/[0-9{}%:;"]/);
    }
    expect(zdanie("internship.accepted")).toBe("Zatwierdzono dyżur");
    expect(zdanie("certificate.issued")).toBe("Wydano certyfikat");
    expect(zdanie("nowy.kod")).toBe(ZDANIE_NIEZNANE);
    expect(zdanie("nowy.kod")).not.toContain("nowy.kod");
  });

  it("zdania, grupy i czynności są te same co w zapleczu (eksport mówi tymi samymi słowami)", () => {
    expect(Object.keys(ZDARZENIA_ZAPLECZA).sort()).toEqual(REJESTR);
    for (const [kod, { tresc }] of Object.entries(ZDARZENIA_ZAPLECZA)) {
      expect(ZDANIA[kod], kod).toBe(tresc);
    }
    const grupyZaplecza = [...blok(MAPA, "GROUPS").matchAll(/'([a-z]+)' => '([^']+)'/g)].map(([, klucz, nazwa]) => ({
      klucz,
      nazwa,
    }));
    expect(GRUPY).toEqual(grupyZaplecza);
    const czynnosciZaplecza = [...blok(MAPA, "CZYNNOSCI").matchAll(/'([^']+)'/g)].map(([, slowo]) => slowo);
    expect([...CZYNNOSCI]).toEqual(czynnosciZaplecza);
  });

  it("siedem grup; nazwa grupy po kluczu, nieznany klucz to „Inne”", () => {
    expect(GRUPY.map((grupa) => grupa.nazwa)).toEqual([
      "Konta i role",
      "Nabór",
      "Kursy i testy",
      "Staż i dyżury",
      "Superwizja",
      "Dokumenty i certyfikaty",
      "Inne",
    ]);
    expect(nazwaGrupy("staz")).toBe("Staż i dyżury");
    expect(nazwaGrupy("nieznana")).toBe("Inne");
  });
});

describe("dziennik działań — ekran i plik mówią to samo", () => {
  it("kolumny ekranu są w nagłówku pliku, w tej samej kolejności; plik ma dodatkowo „Rodzaj” jako osobną kolumnę", () => {
    const naglowekPliku = [...blok(ZASOB, "FIELDS").matchAll(/'([^']+)'/g)].map(([, nazwa]) => nazwa);
    expect(naglowekPliku).toEqual(["Kiedy", "Rodzaj", "Co", "Kogo dotyczy", "Kto"]);
    expect(naglowekPliku.filter((nazwa) => nazwa !== "Rodzaj")).toEqual([...KOLUMNY]);
  });

  it("wykonawca bez konta i wpis bez osoby mają te same słowa na ekranie i w pliku", () => {
    expect(ZASOB).toContain(`NO_ACTOR = '${BEZ_WYKONAWCY}'`);
    expect(ZASOB).toContain(`NOBODY = '${NIKT}'`);
  });
});
