// @vitest-environment node

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { kluczeZasobu } from "../../staz-kolejka/__tests__/zrodla-ekranu";
import { OBECNOSC, PLAKIETKI, SCIEZKA_LISTY, type TerminSuperwizji } from "../dane";

/**
 * Pomiar źródeł: nowy ekran robi dokładnie te same żądania co stary
 * (`components/h12/SupervisionSlots.tsx`), czyta pola, które serwer naprawdę
 * zwraca, i nazywa stany terminu tymi samymi słowami co ekran terminów
 * superwizji w administracji. Każdy pomiar czyta pliki, nie render.
 */

const KORZEN = process.cwd();
const tekst = (sciezka: string) => readFileSync(join(KORZEN, sciezka), "utf-8");
const STARY = tekst("components/h12/SupervisionSlots.tsx");
const KATALOG = "nowy-front/superwizja-uczestnika";
const ZRODLA_NOWEGO = readdirSync(join(KORZEN, KATALOG))
  .filter((nazwa) => /\.tsx?$/.test(nazwa))
  .map((nazwa) => tekst(`${KATALOG}/${nazwa}`))
  .join("\n");
const POMIAR = tekst(`${KATALOG}/POMIAR-STAREGO-EKRANU.md`);

/** Ścieżki tras w literałach żądań, ze zmiennymi zastąpionymi `{}`. */
function trasy(kod: string): string[] {
  const wynik = new Set<string>();
  for (const [, sciezka] of kod.matchAll(/["`](\/supervision\/[^"`]+)["`]/g)) {
    wynik.add(sciezka.replace(/\$\{[^}]+\}/g, "{}").replace(/^(\/supervision\/slots\/)"\s*\+.*$/, "$1{}"));
  }
  return [...wynik].sort();
}

function metody(kod: string): string[] {
  return [...new Set([...kod.matchAll(/method:\s*"([A-Z]+)"/g)].map(([, metoda]) => metoda))].sort();
}

describe("superwizja — te same żądania co stary ekran", () => {
  it("lista: ta sama pierwsza strona po 25 terminów", () => {
    expect(STARY).toContain('"/supervision/slots?page=1&per_page=25"');
    expect(SCIEZKA_LISTY).toBe("/supervision/slots?page=1&per_page=25");
  });

  it("zapis i wypis: ta sama ścieżka `/supervision/slots/{id}/signup`, POST i DELETE, bez ciała", () => {
    expect(STARY).toContain('"/supervision/slots/" + slot.id + "/signup"');
    expect(trasy(ZRODLA_NOWEGO)).toEqual(["/supervision/slots/{}/signup", "/supervision/slots?page=1&per_page=25"]);
    expect(metody(STARY)).toEqual(["DELETE", "POST"]);
    expect(metody(ZRODLA_NOWEGO)).toEqual(["DELETE", "POST"]);
    expect(STARY).not.toMatch(/method:\s*"(POST|DELETE)",\s*body/);
    expect(ZRODLA_NOWEGO).not.toMatch(/method:\s*"(POST|DELETE)",\s*body/);
  });

  it("trasy istnieją po stronie serwera w grupie osoby wolontariackiej", () => {
    const trasySerwera = readFileSync(join(KORZEN, "..", "backend/routes/api/h12.php"), "utf-8");
    expect(trasySerwera).toContain("Route::get('/supervision/slots'");
    expect(trasySerwera).toContain("Route::post('/supervision/slots/{id}/signup'");
    expect(trasySerwera).toContain("Route::delete('/supervision/slots/{id}/signup'");
  });

  it("typ terminu ma dokładnie klucze zasobu serwera (z kluczami zapisu osoby)", () => {
    const wzor: Record<keyof TerminSuperwizji, true> = {
      id: true,
      starts_at: true,
      duration_minutes: true,
      seats_limit: true,
      location_or_link: true,
      active_signups_count: true,
      available_seats: true,
      is_full: true,
      can_sign_up: true,
      signup: true,
    };
    expect([...Object.keys(wzor), "attendance", "signed_up_at"].sort()).toEqual(
      kluczeZasobu("backend/app/Http/Resources/H12/SupervisionSlotResource.php"),
    );
  });

  it("pomiar starego ekranu jest w katalogu i wymienia trzy żądania oraz obecność", () => {
    expect(POMIAR).toContain("`/supervision/slots?page=1&per_page=25`");
    expect(POMIAR).toContain("`/supervision/slots/{id}/signup`");
    expect(POMIAR).toMatch(/\| POST \|/);
    expect(POMIAR).toMatch(/\| DELETE \|/);
    expect(POMIAR).toContain("Obecność potwierdzona");
  });
});

describe("superwizja — nazwy wspólne z ekranami administracji", () => {
  it("„Wolne miejsca” i „Brak wolnych miejsc” to plakietki ekranu terminów superwizji w administracji", () => {
    // Plakietki stanu terminu stoją w tabeli terminów administracji (`TabelaTerminow.tsx`).
    const terminyAdministracji = ["SuperwizjeTerminy.tsx", "TabelaTerminow.tsx"]
      .map((plik) => tekst(`nowy-front/superwizje-terminy/${plik}`))
      .join("\n");
    expect(terminyAdministracji).toContain(`>${PLAKIETKI.wolneMiejsca.tekst}</Badge>`);
    expect(terminyAdministracji).toContain(`>${PLAKIETKI.brakMiejsc.tekst}</Badge>`);
    expect(terminyAdministracji).toContain('"Bez podanej lokalizacji."');
    expect(ZRODLA_NOWEGO).toContain('"Bez podanej lokalizacji."');
  });

  it("obecność: te same słowa co dotychczasowy ekran terminów w administracji i stary ekran", () => {
    const administracja = tekst("components/h12/AdminSupervisionSlots.tsx");
    for (const slowo of [OBECNOSC.present.tekst, OBECNOSC.absent.tekst]) {
      expect(administracja).toContain(`"${slowo}"`);
      expect(STARY).toContain(`"${slowo}"`);
    }
  });
});

describe("superwizja — zasady ekranu", () => {
  it("daty, odmiana i odmowa ze wspólnych modułów; potwierdzenie przez wspólny Toast, wypis przez wspólne okno", () => {
    expect(ZRODLA_NOWEGO).toContain('from "../wspolne/daty"');
    expect(ZRODLA_NOWEGO).toContain('from "../wspolne/odmiana"');
    expect(ZRODLA_NOWEGO).toContain('from "../wspolne/ekran-odmowy"');
    expect(ZRODLA_NOWEGO).toContain("<Toast ");
    expect(ZRODLA_NOWEGO).toContain("<Dialog");
    expect(ZRODLA_NOWEGO).not.toMatch(/\{termin\.starts_at\}|\{termin\.signup\.signed_up_at\}/);
  });

  it("żadnych importów ze starych komponentów ani kolorów wpisanych wprost", () => {
    expect(ZRODLA_NOWEGO).not.toMatch(/@\/components\//);
    expect(tekst(`${KATALOG}/SuperwizjaUczestnika.module.css`)).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(/);
  });

  it("forma neutralna: brak „zapisany/a”, „-łeś/-łaś” i form męskich o osobie", () => {
    // Końcówki „-łeś/-łaś” tylko na końcu słowa („właśnie” nie jest formą rodzajową).
    expect(ZRODLA_NOWEGO).not.toMatch(/zapisany\/a|(łeś|łaś)(?![a-ząćęłńóśźż])|(?<![a-ząćęłńóśźż])(zapisany|zalogowany)(?![a-ząćęłńóśźż])/i);
    expect("Zapisałaś się.").toMatch(/(łeś|łaś)(?![a-ząćęłńóśźż])/i);
    expect("został właśnie").not.toMatch(/(łeś|łaś)(?![a-ząćęłńóśźż])/i);
  });
});
