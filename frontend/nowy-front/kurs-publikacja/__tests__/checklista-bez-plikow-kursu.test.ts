import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminCourse, AdminLesson } from "@/lib/h08/types";
import { checklistaPublikacji, pobierzDaneKursu } from "../dane";

/**
 * Pliki są tylko w lekcjach. Liczba plików wpiętych wprost w kurs
 * (`materials_count` kursu) nie jest ani brakiem, ani gotową pozycją listy
 * przed publikacją, i nie decyduje o tym, czy kurs jest „pusty”.
 */

function kurs(nadpisz: Partial<AdminCourse> = {}): AdminCourse {
  return {
    id: 4,
    title: "Kurs",
    slug: "kurs",
    description: "Opis kursu.",
    type: "course",
    product_group: "psychon",
    sequence_order: 1,
    edition_id: 1,
    is_published: false,
    lessons_count: 1,
    materials_count: 0,
    created_at: null,
    updated_at: null,
    ...nadpisz,
  };
}

const LEKCJA: AdminLesson = {
  id: 21,
  course_id: 4,
  title: "Lekcja A",
  description: null,
  sequence_order: 1,
  video_provider_id: "nagranie-1",
  duration_seconds: 600,
  materials_count: 0,
  created_at: null,
  updated_at: null,
};

function teksty(pozycje: { tekst: string }[]): string {
  return pozycje.map((pozycja) => pozycja.tekst).join(" | ");
}

describe("checklistaPublikacji — pliki kursu poza lekcjami", () => {
  it("kurs bez plików poza lekcjami nie ma braku „materiały kursu”", () => {
    const { braki, gotowe } = checklistaPublikacji({ kurs: kurs({ materials_count: 0 }), lekcje: [LEKCJA] });
    expect(braki.map((brak) => brak.id)).not.toContain("materialy");
    expect(teksty(braki)).not.toMatch(/materia/i);
    expect(teksty(gotowe)).not.toMatch(/materia/i);
  });

  it("kurs z plikiem poza lekcjami nie ma pozycji „Materiały dodane”", () => {
    const { braki, gotowe } = checklistaPublikacji({ kurs: kurs({ materials_count: 3 }), lekcje: [LEKCJA] });
    expect(gotowe.map((pozycja) => pozycja.id)).not.toContain("materialy");
    expect(teksty(gotowe)).not.toMatch(/materia/i);
    expect(braki).toEqual([]);
  });

  it("liczba plików kursu nie zmienia listy: ta sama lista przy 0 i przy 5", () => {
    const wejscie = (liczba: number) => checklistaPublikacji({ kurs: kurs({ materials_count: liczba }), lekcje: [LEKCJA] });
    expect(wejscie(5)).toEqual(wejscie(0));
  });
});

describe("pobierzDaneKursu — kurs prowadzącego z plikiem poza lekcjami", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("bez lekcji, z plikiem kursu: „pusty”", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (adres: RequestInfo | URL) => ({
        ok: true,
        status: 200,
        json: async () =>
          String(adres).endsWith("/lessons") ? { data: [] } : { data: kurs({ lessons_count: 0, materials_count: 2 }) },
      })),
    );
    const wynik = await pobierzDaneKursu("4", "token-test");
    expect(wynik.status).toBe("pusty");
  });
});
