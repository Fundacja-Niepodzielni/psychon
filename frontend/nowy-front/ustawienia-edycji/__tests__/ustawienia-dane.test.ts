import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const api = vi.fn();
vi.mock("@/lib/api/klient", async (oryginal) => ({
  ...(await oryginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
}));

const { ApiError } = await import("@/lib/api/klient");
const dane = await import("../dane");
const {
  KLUCZE_USTAWIEN,
  POLA,
  ZAKRESY,
  bledyZOdpowiedzi,
  formularzZRoku,
  pobierzRokProgramu,
  rodzajBledu,
  zapiszRokProgramu,
  zmianyDoZapisu,
} = dane;

/** Schemat z `backend/openapi.json` — jedyne źródło kształtu atrapy. */
const SCHEMATY = JSON.parse(readFileSync(join(process.cwd(), "..", "backend", "openapi.json"), "utf-8")).components
  .schemas as Record<string, { properties: Record<string, { type: string | string[]; minimum?: number; maximum?: number }>; required?: string[] }>;

/** Atrapa `EditionResource` zbudowana z kluczy schematu (nie wpisana ręcznie). */
function atrapaZeSchematu(schemat = SCHEMATY.EditionResource): Record<string, unknown> {
  const wynik: Record<string, unknown> = {};
  for (const [klucz, opis] of Object.entries(schemat.properties)) {
    const typy = Array.isArray(opis.type) ? opis.type : [opis.type];
    if (typy.includes("integer")) wynik[klucz] = 10;
    else if (typy.includes("string")) wynik[klucz] = klucz.endsWith("_at") ? "2026-09-01" : "Rok programu 2026/27";
    else wynik[klucz] = null;
  }
  return wynik;
}

function rozjazd(atrapa: Record<string, unknown>, schemat = SCHEMATY.EditionResource): string[] {
  const schematKlucze = Object.keys(schemat.properties);
  const atrapaKlucze = Object.keys(atrapa);
  return [
    ...schematKlucze.filter((k) => !atrapaKlucze.includes(k)).map((k) => `brak w atrapie: ${k}`),
    ...atrapaKlucze.filter((k) => !schematKlucze.includes(k)).map((k) => `nadmiar w atrapie: ${k}`),
  ];
}

function roznicaZakresow(zakresy: Record<string, readonly [number, number]>): string[] {
  return KLUCZE_USTAWIEN.filter((klucz) => {
    const opis = SCHEMATY.UpdateEditionRequest.properties[klucz];
    return opis.minimum !== zakresy[klucz][0] || opis.maximum !== zakresy[klucz][1];
  });
}

const ROK = atrapaZeSchematu() as unknown as import("../dane").RokProgramu;

describe("A-29 — kształt i zakresy z openapi.json", () => {
  it("atrapa ma dokładnie klucze EditionResource (w obie strony)", () => {
    expect(rozjazd(atrapaZeSchematu())).toEqual([]);
  });

  it("kontrola dodatnia: usunięty albo dodany klucz daje rozjazd", () => {
    const bezKlucza = atrapaZeSchematu();
    delete bezKlucza.reliability_threshold;
    expect(rozjazd(bezKlucza)).toEqual(["brak w atrapie: reliability_threshold"]);
    expect(rozjazd({ ...atrapaZeSchematu(), obcy: 1 })).toEqual(["nadmiar w atrapie: obcy"]);
  });

  it("sześć kluczy ekranu to klucze kontraktu §3.3 obecne w schemacie odpowiedzi", () => {
    expect([...KLUCZE_USTAWIEN].sort()).toEqual(
      [
        "test_pass_threshold",
        "test_attempts_limit",
        "internship_hours_required",
        "supervision_required_count",
        "reliability_threshold",
        "lesson_completion_percent",
      ].sort(),
    );
    for (const klucz of KLUCZE_USTAWIEN) expect(Object.keys(SCHEMATY.EditionResource.properties)).toContain(klucz);
  });

  it("ZAKRESY równe minimum i maximum z UpdateEditionRequest w openapi.json", () => {
    expect(roznicaZakresow(ZAKRESY)).toEqual([]);
  });

  it("kontrola dodatnia: zmieniony zakres w kodzie daje rozjazd ze schematem", () => {
    expect(roznicaZakresow({ ...ZAKRESY, test_pass_threshold: [0, 99] })).toEqual(["test_pass_threshold"]);
  });

  it("etykieta każdego progu niesie jego zakres", () => {
    for (const pole of POLA) {
      const [min, max] = ZAKRESY[pole.klucz];
      expect(pole.etykieta).toContain(`${min}`);
      expect(pole.etykieta).toContain(`${max}`);
    }
  });

  it("każdy próg ma jedno zdanie (jedna kropka na końcu), a dwa progi czasu są nazwane jako różne", () => {
    for (const pole of POLA) {
      expect(pole.zdanie.endsWith(".")).toBe(true);
      expect(pole.zdanie.slice(0, -1)).not.toContain(". ");
    }
    const ukonczenie = POLA.find((p) => p.klucz === "lesson_completion_percent")!;
    const czasNauki = POLA.find((p) => p.klucz === "reliability_threshold")!;
    expect(ukonczenie.zdanie).toMatch(/inny próg niż próg czasu nauki/);
    expect(czasNauki.zdanie).toMatch(/nie wpływa na ukończenie lekcji/);
  });
});

describe("A-29 — trasy", () => {
  it("GET /admin/edition, PATCH /admin/edition z ciałem zmian", async () => {
    api.mockResolvedValue(ROK);
    await pobierzRokProgramu();
    expect(api).toHaveBeenLastCalledWith("/admin/edition");
    await zapiszRokProgramu({ test_pass_threshold: 70 });
    expect(api).toHaveBeenLastCalledWith("/admin/edition", { method: "PATCH", body: { test_pass_threshold: 70 } });
  });
});

describe("A-29 — zmianyDoZapisu", () => {
  it("bez zmian: puste ciało", () => {
    expect(zmianyDoZapisu(ROK, formularzZRoku(ROK))).toEqual({});
  });

  it("tylko zmienione pola, liczby jako liczby", () => {
    const formularz = { ...formularzZRoku(ROK), test_pass_threshold: " 75 ", test_attempts_limit: "4" };
    expect(zmianyDoZapisu(ROK, formularz)).toEqual({ test_pass_threshold: 75, test_attempts_limit: 4 });
  });

  it("wartość spoza zakresu idzie dosłownie do serwera (walidacja po stronie serwera)", () => {
    const formularz = { ...formularzZRoku(ROK), reliability_threshold: "101", lesson_completion_percent: "-1" };
    expect(zmianyDoZapisu(ROK, formularz)).toEqual({ reliability_threshold: 101, lesson_completion_percent: -1 });
  });

  it("puste pole i litery nie są cicho zamieniane na 0", () => {
    const formularz = { ...formularzZRoku(ROK), test_pass_threshold: "", internship_hours_required: "abc" };
    expect(zmianyDoZapisu(ROK, formularz)).toEqual({ test_pass_threshold: "", internship_hours_required: "abc" });
  });
});

describe("A-29 — błędy", () => {
  it("errors 422 rozkłada na pola ekranu i resztę", () => {
    expect(
      bledyZOdpowiedzi({
        test_pass_threshold: ["Próg zaliczenia testu musi mieścić się w zakresie 0-100%."],
        name: ["Nazwa edycji jest za długa (maksymalnie 255 znaków)."],
      }),
    ).toEqual({
      pola: { test_pass_threshold: "Próg zaliczenia testu musi mieścić się w zakresie 0-100%." },
      pozostale: ["Nazwa edycji jest za długa (maksymalnie 255 znaków)."],
    });
    expect(bledyZOdpowiedzi(undefined)).toEqual({ pola: {}, pozostale: [] });
  });

  it("rodzaj błędu: 401/403 odmowa, 404 brak, 422 walidacja, reszta sieć", () => {
    const blad = (status: number) => new ApiError({ status, code: "x", message: "m" });
    expect(rodzajBledu(blad(401))).toBe("brak-uprawnien");
    expect(rodzajBledu(blad(403))).toBe("brak-uprawnien");
    expect(rodzajBledu(blad(404))).toBe("brak");
    expect(rodzajBledu(blad(422))).toBe("walidacja");
    expect(rodzajBledu(blad(500))).toBe("siec");
    expect(rodzajBledu(new TypeError("Failed to fetch"))).toBe("siec");
  });
});
