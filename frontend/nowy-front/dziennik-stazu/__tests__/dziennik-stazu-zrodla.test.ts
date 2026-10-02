// @vitest-environment node

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { kluczeZasobu } from "../../staz-kolejka/__tests__/zrodla-ekranu";
import { TEKSTY_DECYZJI } from "../../staz-kolejka/PanelDyzuru";
import { tekstPlakietkiCzekania } from "../../sprawy/wiek";
import { cialoZapisu, NAZWY_FORM, pustyFormularz, STANY_WPISU, type WpisStazu } from "../dane";

/**
 * Pomiar źródeł: nowy dziennik robi dokładnie te same żądania co stary ekran
 * (`components/h11/InternshipJournal.tsx`), czyta pola, które serwer naprawdę
 * zwraca, i nazywa stany tymi samymi słowami co ekran decyzji o dyżurach.
 * Każdy pomiar czyta pliki, nie render; stary ekran zostaje nietknięty.
 */

const KORZEN = process.cwd();
const tekst = (sciezka: string) => readFileSync(join(KORZEN, sciezka), "utf-8");
const STARY = tekst("components/h11/InternshipJournal.tsx");
const KATALOG = "nowy-front/dziennik-stazu";
const ZRODLA_NOWEGO = readdirSync(join(KORZEN, KATALOG))
  .filter((nazwa) => /\.tsx?$/.test(nazwa))
  .map((nazwa) => tekst(`${KATALOG}/${nazwa}`))
  .join("\n");

/** Ścieżki tras w literałach `api(...)`/`apiPaged(...)`, z wartościami zmiennych zastąpionymi `{}`. */
function trasy(kod: string): string[] {
  const wynik = new Set<string>();
  for (const [, sciezka] of kod.matchAll(/api(?:Paged)?<[^>]*>\(\s*[`"]([^`"]+)[`"]/g)) {
    wynik.add(sciezka.replace(/\$\{[^}]+\}/g, "{}"));
  }
  return [...wynik].sort();
}

/** Metody HTTP podane w opcjach żądań. */
function metody(kod: string): string[] {
  return [...new Set([...kod.matchAll(/method:\s*"([A-Z]+)"/g)].map(([, metoda]) => metoda))].sort();
}

describe("dziennik stażu — te same żądania co stary ekran", () => {
  it("trasy: lista z tą samą stroną i rozmiarem strony, zapis nowego wpisu, poprawka wpisu", () => {
    expect(trasy(STARY)).toEqual(["/internship/entries", "/internship/entries/{}", "/internship/entries?page={}&per_page=25"]);
    expect(trasy(ZRODLA_NOWEGO)).toEqual(["/internship/entries", "/internship/entries/{}", "/internship/entries?page={}&per_page={}"]);
    expect(ZRODLA_NOWEGO).toContain("export const NA_STRONE = 25;");
  });

  it("metody: POST i PATCH, nic więcej", () => {
    expect(metody(STARY)).toEqual(["PATCH", "POST"]);
    expect(metody(ZRODLA_NOWEGO)).toEqual(["PATCH", "POST"]);
  });

  it("ciało zapisu ma te same pięć pól co stary ekran", () => {
    const blokStarego = STARY.match(/const payload = \{([\s\S]*?)\};/)?.[1] ?? "";
    const polaStarego = [...blokStarego.matchAll(/^\s*([a-z_]+):/gm)].map(([, pole]) => pole).sort();
    expect(polaStarego).toEqual(["consultations_count", "date", "description", "form", "hours"]);
    expect(Object.keys(cialoZapisu(pustyFormularz())).sort()).toEqual(polaStarego);
  });

  it("pola wysyłane są regułami żądania zapisu po stronie serwera", () => {
    const regulySerwera = readFileSync(join(KORZEN, "..", "backend/app/Http/Requests/H11/StoreInternshipEntryRequest.php"), "utf-8");
    for (const pole of Object.keys(cialoZapisu(pustyFormularz()))) {
      expect(regulySerwera).toMatch(new RegExp(`'${pole}'\\s*=>`));
    }
  });

  it("odczyt dziennika bierze godziny z `meta.extra` — tych samych kluczy co stary ekran i kontroler", () => {
    const kontroler = readFileSync(join(KORZEN, "..", "backend/app/Http/Controllers/Api/V1/H11/InternshipEntryController.php"), "utf-8");
    for (const klucz of ["accepted_hours", "required_hours"]) {
      expect(STARY).toContain(`meta?.extra?.${klucz}`);
      expect(ZRODLA_NOWEGO).toContain(`meta?.extra?.${klucz}`);
      expect(kontroler).toContain(`'${klucz}' =>`);
    }
  });

  it("typ wpisu ma dokładnie klucze zasobu serwera", () => {
    const wzor: Record<keyof WpisStazu, true> = {
      id: true,
      date: true,
      hours: true,
      form: true,
      consultations_count: true,
      description: true,
      status: true,
      review_comment: true,
      decided_at: true,
      created_at: true,
      updated_at: true,
    };
    expect(Object.keys(wzor).sort()).toEqual(kluczeZasobu("backend/app/Http/Resources/H11/InternshipEntryResource.php"));
  });
});

describe("dziennik stażu — nazwy wspólne z ekranem decyzji o dyżurach", () => {
  it("stan „odesłany do poprawy” i „odrzucony” to te same słowa co potwierdzenia decyzji", () => {
    expect(TEKSTY_DECYZJI.odeslij.toast.toLowerCase()).toContain(STANY_WPISU.returned.tekst.toLowerCase());
    expect(TEKSTY_DECYZJI.odrzuc.toast.toLowerCase()).toContain(STANY_WPISU.rejected.tekst.toLowerCase());
  });

  it("stan „zatwierdzony” i „czeka” to te same słowa co ekran decyzji", () => {
    const kolejka = tekst("nowy-front/staz-kolejka/StazKolejka.tsx");
    expect(kolejka).toContain(`Dyżur ${STANY_WPISU.accepted.tekst.toLowerCase()}`);
    expect(STANY_WPISU.submitted.tekst.toLowerCase().startsWith(tekstPlakietkiCzekania(0).split(" ")[0])).toBe(true);
    expect(kolejka).toContain("na decyzję");
  });

  it("nazwy uwag z decyzji to etykiety pól, pod którymi wpisuje je ekran decyzji", () => {
    expect(TEKSTY_DECYZJI.odeslij.pole).toBe("Co trzeba poprawić");
    expect(TEKSTY_DECYZJI.odrzuc.pole).toBe("Powód odrzucenia");
    expect(ZRODLA_NOWEGO).toContain('"Co trzeba poprawić"');
    expect(ZRODLA_NOWEGO).toContain('"Powód odrzucenia"');
  });

  it("nazwy form: stara lista bez zmian (serwer nie zwraca nazw form osobie wolontariackiej)", () => {
    expect(NAZWY_FORM).toEqual({ phone_duty: "Dyżur telefoniczny", chat_duty: "Czat", other: "Inna forma" });
    for (const nazwa of Object.values(NAZWY_FORM)) expect(STARY).toContain(`"${nazwa}"`);
    const zasob = readFileSync(join(KORZEN, "..", "backend/app/Http/Resources/H11/InternshipEntryResource.php"), "utf-8");
    expect(zasob).not.toMatch(/'form_name'|'internship_form'/);
  });
});

describe("dziennik stażu — zasady ekranu", () => {
  it("daty tylko przez wspólny formater, bez wypisywania pola daty wprost", () => {
    expect(ZRODLA_NOWEGO).toContain('from "../wspolne/daty"');
    expect(ZRODLA_NOWEGO).not.toMatch(/\{wpis\.date\}|\{wpis\.decided_at\}|\{wpis\.created_at\}/);
  });

  it("odmowa i „nie znaleziono” ze wspólnego ekranu odmowy; potwierdzenie przez wspólny Toast", () => {
    expect(ZRODLA_NOWEGO).toContain('from "../wspolne/ekran-odmowy"');
    expect(ZRODLA_NOWEGO).toContain("<Toast ");
  });

  it("żadnych importów ze starych komponentów ani kolorów wpisanych wprost", () => {
    expect(ZRODLA_NOWEGO).not.toMatch(/@\/components\//);
    expect(tekst(`${KATALOG}/DziennikStazu.module.css`)).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(/);
  });

  it("forma rodzajowa neutralna: brak form „-łeś/-łaś” w tekstach ekranu", () => {
    expect(ZRODLA_NOWEGO).not.toMatch(/łeś|łaś|(?<![a-ząćęłńóśźż])zalogowan[ya]\b/i);
  });
});
