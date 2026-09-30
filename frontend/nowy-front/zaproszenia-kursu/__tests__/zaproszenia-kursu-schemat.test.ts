import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { KURS_SPOTKANIE, WOLONTARIUSZE } from "./atrapy";

/**
 * Atrapy odpowiedzi w testach ekranu mają klucze schematu: klucze zasobów,
 * reguł i odpowiedzi czyta ten test wprost z plików zaplecza. Usunięty albo
 * dodany klucz w atrapie (albo w zasobie) daje czerwień.
 */
const ZAPLECZE = join(process.cwd(), "..", "backend");

function odczyt(sciezka: string): string {
  return readFileSync(join(ZAPLECZE, sciezka), "utf-8");
}

function kluczePhp(tekst: string): string[] {
  return [...tekst.matchAll(/'([a-z_]+)'\s*=>/g)].map((dopasowanie) => dopasowanie[1]);
}

/** Różnica symetryczna: klucze tylko po jednej stronie. */
function rozjazd(atrapa: string[], schemat: string[]): string[] {
  return [
    ...atrapa.filter((klucz) => !schemat.includes(klucz)).map((klucz) => `tylko w atrapie: ${klucz}`),
    ...schemat.filter((klucz) => !atrapa.includes(klucz)).map((klucz) => `tylko w schemacie: ${klucz}`),
  ];
}

describe("Zaproszenia na kurs — atrapy zgodne ze schematem zaplecza", () => {
  it("kurs: klucze atrapy = klucze AdminCourseResource", () => {
    const zasob = kluczePhp(odczyt("app/Http/Resources/H08/AdminCourseResource.php"));
    expect(rozjazd(Object.keys(KURS_SPOTKANIE), zasob)).toEqual([]);
  });

  it("osoba na liście: klucze atrapy = AdminUserListResource::FIELDS", () => {
    const zrodlo = odczyt("app/Http/Resources/AdminUserListResource.php");
    const pola = zrodlo.slice(zrodlo.indexOf("FIELDS"), zrodlo.indexOf("];"));
    const fields = [...pola.matchAll(/'([a-z_]+)'/g)].map((dopasowanie) => dopasowanie[1]);
    expect(fields.length).toBeGreaterThan(5);
    expect(rozjazd(Object.keys(WOLONTARIUSZE[0]), fields)).toEqual([]);
  });

  it("zaproszenie: ciało ma klucz user_ids z InviteToCourseRequest, odpowiedź klucz invited", () => {
    const reguly = odczyt("app/Http/Requests/H08/InviteToCourseRequest.php");
    expect(kluczePhp(reguly)).toContain("user_ids");
    expect(odczyt("app/Http/Controllers/Api/V1/Admin/CourseInviteController.php")).toContain("'invited' =>");
    const schemat = JSON.parse(odczyt("openapi.json")).paths["/v1/admin/courses/{course}/invite"].post;
    const odpowiedz = schemat.responses["200"].content["application/json"].schema.properties.data.properties;
    expect(Object.keys(odpowiedz)).toEqual(["invited"]);
  });

  it("reguła zaproszeń opiera się o miejsce kursu w kolejności, nie o typ", () => {
    const zrodlo = odczyt("app/Services/H08/CourseInviter.php");
    expect(zrodlo).toMatch(/\$course->sequence_order === null/);
    expect(zrodlo).not.toMatch(/\$course->type/);
  });

  it("kontrola dodatnia: dodatkowy klucz w atrapie jest wykrywany", () => {
    const zasob = kluczePhp(odczyt("app/Http/Resources/H08/AdminCourseResource.php"));
    expect(rozjazd([...Object.keys(KURS_SPOTKANIE), "nieistnieje"], zasob)).toEqual(["tylko w atrapie: nieistnieje"]);
    expect(rozjazd(Object.keys(KURS_SPOTKANIE).filter((klucz) => klucz !== "type"), zasob)).toEqual([
      "tylko w schemacie: type",
    ]);
  });
});
