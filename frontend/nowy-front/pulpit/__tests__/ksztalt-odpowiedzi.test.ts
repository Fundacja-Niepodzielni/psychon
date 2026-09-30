import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GODZINY,
  KONTO_WOLONTARIUSZA,
  KURS_STUDENTA_W_TOKU,
  KURS_W_TOKU,
  LEKCJA_DO_ZROBIENIA,
  ODPOWIEDZ_STAZU_META,
  SZCZEGOL_W_TOKU,
  TERMIN_SUPERWIZJI,
  WARUNKI,
} from "./atrapy";

/**
 * Atrapy odpowiedzi w testach pulpitów mają dokładnie te klucze, które niesie
 * zaplecze: właściwości schematu z `backend/openapi.json` albo — gdy
 * schemat nie ma nazwanego typu — klucze zasobu PHP. Test czyta oba pliki;
 * usunięty albo dodany klucz atrapy robi czerwień (kontrola dodatnia niżej).
 */

const KORZEN = resolve(__dirname, "../../../..");

interface Schemat {
  properties?: Record<string, Schemat>;
}

const openapi = JSON.parse(readFileSync(resolve(KORZEN, "backend/openapi.json"), "utf8")) as {
  components: { schemas: Record<string, Schemat> };
  paths: Record<string, { get: { responses: Record<string, { content: Record<string, { schema: Schemat }> }> } }>;
};

function kluczeSchematu(nazwa: string): string[] {
  const schemat = openapi.components.schemas[nazwa];
  if (!schemat?.properties) throw new Error(`openapi.json: brak schematu ${nazwa}`);
  return Object.keys(schemat.properties).sort();
}

function schematOdpowiedzi(sciezka: string): Schemat {
  return openapi.paths[sciezka].get.responses["200"].content["application/json"].schema;
}

/** Różnica kluczy: co jest w schemacie, a brakuje w atrapie, i odwrotnie. */
function roznicaKluczy(atrapa: object, oczekiwane: string[]): { brakuje: string[]; nadmiar: string[] } {
  const wAtrapie = Object.keys(atrapa);
  return {
    brakuje: oczekiwane.filter((klucz) => !wAtrapie.includes(klucz)),
    nadmiar: wAtrapie.filter((klucz) => !oczekiwane.includes(klucz)),
  };
}

const ZGODNE = { brakuje: [], nadmiar: [] };

describe("atrapy pulpitów zgodne z zapleczem", () => {
  it("kurs z listy = CourseListResource (schemat w openapi.json)", () => {
    const klucze = kluczeSchematu("CourseListResource");
    expect(roznicaKluczy(KURS_W_TOKU, klucze)).toEqual(ZGODNE);
    expect(roznicaKluczy(KURS_STUDENTA_W_TOKU, klucze)).toEqual(ZGODNE);
  });

  it("szczegół kursu = CourseDetailResource, a jego lekcja = LessonSummaryResource", () => {
    expect(roznicaKluczy(SZCZEGOL_W_TOKU, kluczeSchematu("CourseDetailResource"))).toEqual(ZGODNE);
    expect(roznicaKluczy(LEKCJA_DO_ZROBIENIA, kluczeSchematu("LessonSummaryResource"))).toEqual(ZGODNE);
  });

  it("konto z /me = ProfileResource", () => {
    expect(roznicaKluczy(KONTO_WOLONTARIUSZA, kluczeSchematu("ProfileResource"))).toEqual(ZGODNE);
  });

  it("warunki certyfikatu = schemat GET /certificate/conditions", () => {
    const dane = schematOdpowiedzi("/v1/certificate/conditions").properties?.data;
    expect(roznicaKluczy(WARUNKI, Object.keys(dane?.properties ?? {}).sort())).toEqual(ZGODNE);
  });

  it("meta stażu = schemat GET /internship/entries (razem z meta.extra)", () => {
    const meta = schematOdpowiedzi("/v1/internship/entries").properties?.meta;
    expect(roznicaKluczy(ODPOWIEDZ_STAZU_META, Object.keys(meta?.properties ?? {}).sort())).toEqual(ZGODNE);
    const extra = meta?.properties?.extra;
    expect(roznicaKluczy(GODZINY, Object.keys(extra?.properties ?? {}).sort())).toEqual(ZGODNE);
  });

  it("termin superwizji = klucze SupervisionSlotResource (schemat openapi nie opisuje elementu listy)", () => {
    const zrodlo = readFileSync(resolve(KORZEN, "backend/app/Http/Resources/H12/SupervisionSlotResource.php"), "utf8");
    const poReturn = zrodlo.slice(zrodlo.indexOf("return ["), zrodlo.indexOf("];", zrodlo.indexOf("return [")));
    const klucze = [...poReturn.matchAll(/^ {12}'(\w+)' =>/gm)].map((dopasowanie) => dopasowanie[1]).sort();
    expect(klucze.length).toBeGreaterThan(5);
    expect(roznicaKluczy(TERMIN_SUPERWIZJI, klucze)).toEqual(ZGODNE);
  });

  it("kontrola dodatnia: usunięty albo dodany klucz atrapy jest wykrywany", () => {
    const klucze = kluczeSchematu("CourseListResource");
    const bezKlucza = Object.fromEntries(Object.entries(KURS_W_TOKU).filter(([klucz]) => klucz !== "product_group"));
    expect(roznicaKluczy(bezKlucza, klucze)).toEqual({ brakuje: ["product_group"], nadmiar: [] });
    expect(roznicaKluczy({ ...KURS_W_TOKU, dodatkowy: 1 }, klucze)).toEqual({ brakuje: [], nadmiar: ["dodatkowy"] });
  });
});
