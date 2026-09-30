import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/klient";
import type { DocumentTemplate, DocumentTemplateVersion } from "@/lib/api/document-templates";
import {
  RODZAJE_WZORU,
  bladTresci,
  czyZmieniona,
  etykietaRodzaju,
  formatujMomentZmiany,
  historiaPoZapisie,
  opisAutora,
  stanZBleduWczytania,
  wierszeHistorii,
  wynikZBleduZapisu,
} from "../dane";

/**
 * Logika danych ekranu „Wzory dokumentów” oraz zgodność atrap z zapleczem:
 * klucze zasobów, reguła pola `content`, lista rodzajów, trasy i stan flagi
 * czytane są z plików zaplecza jako tekst.
 */

const KORZEN_ZAPLECZA = join(process.cwd(), "..", "backend");

function zaplecze(sciezka: string): string {
  const pelna = join(KORZEN_ZAPLECZA, sciezka);
  if (!existsSync(pelna)) throw new Error(`Brak pliku zaplecza: ${sciezka}`);
  return readFileSync(pelna, "utf-8");
}

/** Klucze `'nazwa' =>` z ciała zasobu — od `toArray` do końca pliku. */
function kluczeZasobu(sciezka: string): string[] {
  const tekst = zaplecze(sciezka);
  const poczatek = tekst.indexOf("function toArray");
  if (poczatek < 0) throw new Error(`Brak toArray w ${sciezka}`);
  return [...new Set([...tekst.slice(poczatek).matchAll(/'(\w+)'\s*=>/g)].map((trafienie) => trafienie[1]))].sort();
}

const AUTOR = { id: 5, name: "Anna Testowa" };

const WZOR: DocumentTemplate = {
  type: "agreement",
  content: "<p>x</p>",
  version: 2,
  updated_at: "2026-09-28T10:00:00Z",
  updated_by: AUTOR,
};

const WPIS: DocumentTemplateVersion = { version: 2, updated_at: "2026-09-28T10:00:00Z", updated_by: AUTOR };

function blad(status: number, errors?: Record<string, string[]>) {
  return new ApiError({ status, code: "x", message: "m", errors });
}

describe("wzory dokumentów — zgodność z zapleczem", () => {
  it("atrapa wzoru ma dokładnie klucze zasobu (i klucze osoby edytującej)", () => {
    const oczekiwane = [...Object.keys(WZOR), ...Object.keys(AUTOR)].sort();
    expect(kluczeZasobu("app/Http/Resources/DocumentTemplateResource.php")).toEqual([...new Set(oczekiwane)].sort());
  });

  it("atrapa wpisu historii ma dokładnie klucze zasobu wersji", () => {
    const oczekiwane = [...Object.keys(WPIS), ...Object.keys(AUTOR)].sort();
    expect(kluczeZasobu("app/Http/Resources/DocumentTemplateVersionResource.php")).toEqual(
      [...new Set(oczekiwane)].sort(),
    );
  });

  it("żądanie zapisu wymaga jednego pola content: wymagane, tekst, min. 1 znak", () => {
    const tekst = zaplecze("app/Http/Requests/DocumentTemplates/UpdateDocumentTemplateRequest.php");
    const reguly = [...tekst.matchAll(/'(\w+)'\s*=>\s*\[([^\]]*)\]/g)];
    expect(reguly.map((regula) => regula[1])).toEqual(["content"]);
    expect(reguly[0][2]).toContain("'required'");
    expect(reguly[0][2]).toContain("'string'");
    expect(reguly[0][2]).toContain("'min:1'");
  });

  it("rodzaje na ekranie to dokładnie rodzaje przyjmowane przez trasę", () => {
    const tekst = zaplecze("app/Models/DocumentTemplate.php");
    const lista = /const array TYPES = \[([^\]]*)\]/.exec(tekst)![1];
    const rodzajeZaplecza = [...lista.matchAll(/'(\w+)'/g)].map((trafienie) => trafienie[1]).sort();
    expect(RODZAJE_WZORU.map((rodzaj) => rodzaj.typ).sort()).toEqual(rodzajeZaplecza);
  });

  it("trasy: trzy operacje na jednej grupie z rolami opiekuna projektu i super-admina", () => {
    const tekst = zaplecze("routes/api/document_templates.php");
    expect(tekst).toContain("Route::get('/document-templates/{type}'");
    expect(tekst).toContain("Route::put('/document-templates/{type}'");
    expect(tekst).toContain("Route::get('/document-templates/{type}/versions'");
    expect(tekst).toContain("'role:project_manager,super_admin'");
    expect(tekst).toContain("config('features.document_templates')");
  });

  it("flaga funkcji jest domyślnie włączona; wyłączona oznacza brak tras, czyli 404 z trasy", () => {
    expect(zaplecze("config/features.php")).toMatch(/'document_templates'\s*=>\s*true/);
    expect(zaplecze("routes/api/document_templates.php")).toMatch(/if \(! config\('features\.document_templates'\)\) \{\s*return;/);
  });

  it("brak wzoru i brak trasy odpowiadają tak samo: ten sam stan „brak wzoru”", () => {
    const obsluga = zaplecze("app/Exceptions/ApiExceptionRenderer.php");
    expect(obsluga).toMatch(/NotFoundHttpException => self::envelope\(\s*404,\s*'not_found',\s*'Nie znaleziono zasobu\.'/);
    const kontroler = zaplecze("app/Http/Controllers/Api/V1/DocumentTemplateController.php");
    expect(kontroler.match(/throw new ApiException\(404, 'not_found', 'Nie znaleziono zasobu\.'\)/g)).toHaveLength(2);
  });
});

describe("wzory dokumentów — stan wczytania i zapisu z błędu", () => {
  it("401 i 403 to brak uprawnień, 404 to brak wzoru, reszta to błąd sieci", () => {
    expect(stanZBleduWczytania(blad(401)).rodzaj).toBe("brak-uprawnien");
    expect(stanZBleduWczytania(blad(403)).rodzaj).toBe("brak-uprawnien");
    expect(stanZBleduWczytania(blad(404)).rodzaj).toBe("brak-wzoru");
    expect(stanZBleduWczytania(blad(500)).rodzaj).toBe("siec");
    expect(stanZBleduWczytania(new TypeError("Failed to fetch")).rodzaj).toBe("siec");
  });

  it("zapis: 422 z polem content trafia do pola, 422 bez pola dostaje zdanie zastępcze", () => {
    expect(wynikZBleduZapisu(blad(422, { content: ["Pole jest wymagane."] }))).toEqual({
      rodzaj: "pole",
      tresc: "Pole jest wymagane.",
    });
    expect(wynikZBleduZapisu(blad(422))).toEqual({ rodzaj: "pole", tresc: "Popraw treść wzoru." });
  });

  it("zapis: 403, 404 i błąd sieci to komunikat ogólny", () => {
    for (const wyjatek of [blad(403), blad(404), blad(500), new TypeError("x")]) {
      expect(wynikZBleduZapisu(wyjatek).rodzaj).toBe("ogolny");
    }
  });
});

describe("wzory dokumentów — treść i historia", () => {
  it("kontrola przed zapisem: pusta, bez zmian, poprawna", () => {
    expect(bladTresci("", "a")).toBe("Wpisz treść wzoru.");
    expect(bladTresci("  \n ", "a")).toBe("Wpisz treść wzoru.");
    expect(bladTresci("a", "a")).toContain("taka sama");
    expect(bladTresci("b", "a")).toBeUndefined();
  });

  it("czyZmieniona porównuje bajt w bajt", () => {
    expect(czyZmieniona("a", "a")).toBe(false);
    expect(czyZmieniona("a ", "a")).toBe(true);
  });

  it("etykiety rodzajów po polsku, nieznany rodzaj zwraca kod tylko jako ostatnią deskę", () => {
    expect(etykietaRodzaju("agreement")).toBe("Porozumienie wolontariackie");
    expect(etykietaRodzaju("attendance_certificate")).toBe("Zaświadczenie o stażu");
    expect(etykietaRodzaju("certificate")).toBe("Certyfikat ukończenia programu");
  });

  it("moment zmiany w strefie Warszawy, zły zapis daje kreskę", () => {
    expect(formatujMomentZmiany("2026-09-28T10:00:00Z")).toBe("28 września 2026, 12:00");
    expect(formatujMomentZmiany("nie-data")).toBe("—");
  });

  it("osoba przy wersji: nazwa albo zdanie o wzorze bez edycji", () => {
    expect(opisAutora(AUTOR)).toBe("Anna Testowa");
    expect(opisAutora(null)).toBe("wzór jeszcze nie był edytowany");
  });

  it("wiersze historii mają trzy kolumny i identyfikator równy numerowi wersji", () => {
    const wiersze = wierszeHistorii([WPIS, { version: 1, updated_at: "2026-09-01T08:00:00Z", updated_by: null }]);
    expect(wiersze.map((wiersz) => wiersz.id)).toEqual(["2", "1"]);
    expect(Object.keys(wiersze[0].wartosci)).toEqual(["wersja", "kiedy", "kto"]);
    expect(wiersze[1].wartosci.kto).toBe("wzór jeszcze nie był edytowany");
  });

  it("historia po zapisie: nowy wpis na czele, bez powtórzenia tej samej wersji", () => {
    const zapisany = { ...WZOR, version: 3, updated_at: "2026-09-30T12:00:00Z" };
    const wynik = historiaPoZapisie([WPIS], zapisany);
    expect(wynik.map((wpis) => wpis.version)).toEqual([3, 2]);
    expect(historiaPoZapisie(wynik, zapisany).map((wpis) => wpis.version)).toEqual([3, 2]);
  });
});
