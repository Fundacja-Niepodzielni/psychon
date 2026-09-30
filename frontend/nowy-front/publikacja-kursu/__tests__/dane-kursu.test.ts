import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  atrapaFetch,
  cialoPublikacji,
  kluczeZasobuKursu,
  kursZeSchematu,
  wywolaniaApi,
  KORZEN_ZAPLECZA,
} from "./pomocnicy";

/**
 * Moduł danych ekranu „Publikacja kursu” (`dane.ts`) — atrapa na poziomie
 * `fetch`: próba czyta adres, metodę i ciało, z którymi prawdziwy `api()`
 * naprawdę woła. Klucze atrapy kursu pochodzą z pliku zasobu
 * `AdminCourseResource.php`, a pole ciała `PATCH` — ze schematu
 * `UpdateCourseRequest` w `openapi.json`; usunięty klucz w źródle zaświeci test.
 */

vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

function poleCialaZeSchematu(): string[] {
  const schemat = JSON.parse(readFileSync(join(KORZEN_ZAPLECZA, "openapi.json"), "utf-8")) as {
    components: { schemas: Record<string, { properties: Record<string, unknown> }> };
  };
  return Object.keys(schemat.components.schemas.UpdateCourseRequest.properties);
}

async function swiezyModul() {
  vi.resetModules();
  const dane = await import("../dane");
  return { dane };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("źródła kształtów", () => {
  it("zasób kursu niesie pola, których ekran używa", () => {
    const klucze = kluczeZasobuKursu();
    expect(klucze).toEqual(expect.arrayContaining(["id", "title", "is_published", "lessons_count"]));
  });

  it("schemat żądania zmiany kursu zna pole is_published", () => {
    expect(poleCialaZeSchematu()).toContain("is_published");
  });
});

describe("kontrola ciała zapisu publikacji", () => {
  it("przyjmuje dokładnie jedno pole logiczne", () => {
    expect(cialoPublikacji(JSON.stringify({ is_published: true }), true)).toBe(true);
    expect(cialoPublikacji(JSON.stringify({ is_published: false }), false)).toBe(true);
  });

  it("odrzuca zmienione ciało (kontrola dodatnia)", () => {
    expect(cialoPublikacji(JSON.stringify({ is_published: false }), true)).toBe(false);
    expect(cialoPublikacji(JSON.stringify({ is_published: "true" }), true)).toBe(false);
    expect(cialoPublikacji(JSON.stringify({ is_published: true, title: "x" }), true)).toBe(false);
    expect(cialoPublikacji(JSON.stringify({ published: true }), true)).toBe(false);
  });
});

describe("pobierzKurs", () => {
  it("woła GET /admin/courses/{id} i zwraca zawartość koperty", async () => {
    const fetchMock = atrapaFetch(200, { data: kursZeSchematu() });
    const { dane } = await swiezyModul();
    const kurs = await dane.pobierzKurs("5");
    const [wywolanie] = wywolaniaApi(fetchMock);
    expect(String(wywolanie[0])).toMatch(/\/api\/v1\/admin\/courses\/5$/);
    expect((wywolanie[1]?.method ?? "GET").toUpperCase()).toBe("GET");
    expect(kurs.title).toBe("Wywiad psychologiczny");
  });
});

describe("zmienPublikacje", () => {
  it("opublikowanie: jedno PATCH na /admin/courses/{id} z ciałem {is_published:true}", async () => {
    const fetchMock = atrapaFetch(200, { data: kursZeSchematu({ is_published: true }) });
    const { dane } = await swiezyModul();
    const kurs = await dane.zmienPublikacje("5", true);
    const wywolania = wywolaniaApi(fetchMock);
    expect(wywolania).toHaveLength(1);
    expect(String(wywolania[0][0])).toMatch(/\/api\/v1\/admin\/courses\/5$/);
    expect(wywolania[0][1]?.method).toBe("PATCH");
    expect(cialoPublikacji(wywolania[0][1]?.body, true)).toBe(true);
    expect(kurs.is_published).toBe(true);
  });

  it("cofnięcie: ciało {is_published:false}", async () => {
    const fetchMock = atrapaFetch(200, { data: kursZeSchematu({ is_published: false }) });
    const { dane } = await swiezyModul();
    await dane.zmienPublikacje("5", false);
    const wywolania = wywolaniaApi(fetchMock);
    expect(wywolania).toHaveLength(1);
    expect(cialoPublikacji(wywolania[0][1]?.body, false)).toBe(true);
  });
});

describe("usunKurs", () => {
  it("woła DELETE /admin/courses/{id}", async () => {
    const fetchMock = atrapaFetch(200, { data: { id: 5, deleted: true } });
    const { dane } = await swiezyModul();
    const wynik = await dane.usunKurs("5");
    const [wywolanie] = wywolaniaApi(fetchMock);
    expect(String(wywolanie[0])).toMatch(/\/api\/v1\/admin\/courses\/5$/);
    expect(wywolanie[1]?.method).toBe("DELETE");
    expect(wywolanie[1]?.body).toBeUndefined();
    expect(wynik).toEqual({ id: 5, deleted: true });
  });
});

describe("klasyfikacja błędów", () => {
  async function blad(status: number, code: string, reason?: Record<string, unknown>) {
    atrapaFetch(status, { error: { status, code, message: "Komunikat serwera.", reason } });
    const { dane } = await swiezyModul();
    return dane.zmienPublikacje("5", true).then(
      () => null,
      (wyjatek: unknown) => dane.sklasyfikujBlad("5", wyjatek),
    );
  }

  it("422 conditions_not_met z reason.missing daje listę braków z odnośnikiem do kursu", async () => {
    const wynik = await blad(422, "conditions_not_met", { missing: ["lessons"] });
    expect(wynik).toEqual({
      rodzaj: "braki",
      braki: [{ id: "lessons", tekst: "Dodaj co najmniej jedną lekcję", href: "/nowy-front/kurs/5" }],
      komunikat: "Komunikat serwera.",
    });
  });

  it("422 conditions_not_met bez missing zostaje zwykłym błędem z komunikatem serwera", async () => {
    const wynik = await blad(422, "conditions_not_met", { blocking_course_ids: [7] });
    expect(wynik).toEqual({ rodzaj: "blad", komunikat: "Komunikat serwera." });
  });

  it("403 i 404 mają własne rodzaje", async () => {
    expect(await blad(403, "forbidden")).toEqual({ rodzaj: "zakazane" });
    expect(await blad(404, "not_found")).toEqual({ rodzaj: "nie-znaleziono" });
  });

  it("wyjątek spoza koperty błędu to brak połączenia", async () => {
    const { dane } = await swiezyModul();
    expect(dane.sklasyfikujBlad("5", new TypeError("Failed to fetch"))).toEqual({ rodzaj: "siec" });
  });

  it("identyfikator z adresu musi być liczbą", async () => {
    const { dane } = await swiezyModul();
    expect(dane.czyPoprawnyIdentyfikator("12")).toBe(true);
    expect(dane.czyPoprawnyIdentyfikator("12a")).toBe(false);
    expect(dane.czyPoprawnyIdentyfikator("")).toBe(false);
    expect(dane.czyPoprawnyIdentyfikator("../1")).toBe(false);
  });
});
