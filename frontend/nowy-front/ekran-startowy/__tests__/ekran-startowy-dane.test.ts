import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const api = vi.fn();
vi.mock("@/lib/api/klient", async (oryginal) => ({
  ...(await oryginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
}));

const { ApiError } = await import("@/lib/api/klient");
const {
  LIMITY,
  POLA_EKRANU,
  adresFilmu,
  bledyZOdpowiedzi,
  cialoZapisu,
  formularzZEkranu,
  opisOstatniejZmiany,
  pobierzEkranStartowy,
  rodzajBledu,
  zapiszEkranStartowy,
} = await import("../dane");

const BACKEND = join(process.cwd(), "..", "backend");

type SchematPola = { type: string | string[]; maxLength?: number };
type Schematy = {
  UpdateOnboardingRequest: { properties: Record<string, { properties: Record<string, SchematPola> }> };
};
const OPENAPI = JSON.parse(readFileSync(join(BACKEND, "openapi.json"), "utf-8"));
const SCHEMATY = OPENAPI.components.schemas as Schematy;
const ODPOWIEDZ_GET = OPENAPI.paths["/v1/onboarding"].get.responses["200"].content["application/json"].schema.properties
  .data as { properties: Record<string, unknown>; required: string[] };

/** Sekcje z zaplecza: stała `OnboardingContent::SECTIONS` czytana z pliku PHP. */
function sekcjeZPhp(): string[] {
  const zrodlo = readFileSync(join(BACKEND, "app/Support/OnboardingContent.php"), "utf-8");
  const dopasowanie = /SECTIONS\s*=\s*\[([^\]]*)\]/.exec(zrodlo);
  return Array.from((dopasowanie?.[1] ?? "").matchAll(/'([a-z]+)'/g), (m) => m[1]);
}

/** Atrapa zbudowana z kluczy schematu żądania (sekcje i pola) oraz odpowiedzi (`updated_at`). */
function atrapaZeSchematu(schemat = SCHEMATY.UpdateOnboardingRequest.properties): Record<string, unknown> {
  const wynik: Record<string, unknown> = {};
  for (const [sekcja, opis] of Object.entries(schemat)) {
    wynik[sekcja] = Object.fromEntries(
      Object.entries(opis.properties).map(([pole, szczegoly]) => [
        pole,
        (Array.isArray(szczegoly.type) ? szczegoly.type : [szczegoly.type]).includes("null") && pole !== "caption"
          ? null
          : `Tekst ${sekcja}.${pole}`,
      ]),
    );
  }
  for (const klucz of ODPOWIEDZ_GET.required) wynik[klucz] = "2026-09-30T10:15:00Z";
  return wynik;
}

function kluczeKropkowane(obiekt: Record<string, unknown>): string[] {
  return Object.entries(obiekt)
    .flatMap(([sekcja, wartosc]) =>
      wartosc !== null && typeof wartosc === "object"
        ? Object.keys(wartosc).map((pole) => `${sekcja}.${pole}`)
        : [sekcja],
    )
    .sort();
}

const OCZEKIWANE_KLUCZE = [...POLA_EKRANU, "updated_at"].sort();
const EKRAN = atrapaZeSchematu() as unknown as import("../dane").EkranStartowy;

function roznicaLimitow(limity: Record<string, number>): string[] {
  return POLA_EKRANU.filter((pole) => {
    const [sekcja, nazwa] = pole.split(".");
    return SCHEMATY.UpdateOnboardingRequest.properties[sekcja].properties[nazwa].maxLength !== limity[pole];
  });
}

describe("A-30 — kształt i limity z openapi.json oraz zaplecza", () => {
  it("atrapa ma dokładnie klucze odpowiedzi (siedem pól sekcji i updated_at), w obie strony", () => {
    expect(kluczeKropkowane(atrapaZeSchematu())).toEqual(OCZEKIWANE_KLUCZE);
  });

  it("kontrola dodatnia: usunięty klucz pola albo sekcji zmienia wynik porównania", () => {
    const atrapa = atrapaZeSchematu();
    delete (atrapa.video as Record<string, unknown>).url;
    expect(kluczeKropkowane(atrapa)).not.toEqual(OCZEKIWANE_KLUCZE);
    const bezSekcji = atrapaZeSchematu();
    delete bezSekcji.expectations;
    expect(kluczeKropkowane(bezSekcji)).not.toEqual(OCZEKIWANE_KLUCZE);
  });

  it("sekcje ekranu równe OnboardingContent::SECTIONS z zaplecza", () => {
    expect(sekcjeZPhp().sort()).toEqual(["expectations", "program", "video"]);
    expect(Object.keys(SCHEMATY.UpdateOnboardingRequest.properties).sort()).toEqual(sekcjeZPhp().sort());
  });

  it("rozjazd schematu: odpowiedź w openapi.json nazywa tylko updated_at (sekcje jako additionalProperties)", () => {
    expect(Object.keys(ODPOWIEDZ_GET.properties)).toEqual(["updated_at"]);
    expect(ODPOWIEDZ_GET.required).toEqual(["updated_at"]);
  });

  it("LIMITY równe maxLength z UpdateOnboardingRequest w openapi.json", () => {
    expect(roznicaLimitow(LIMITY)).toEqual([]);
  });

  it("kontrola dodatnia: zmieniony limit w kodzie daje rozjazd", () => {
    expect(roznicaLimitow({ ...LIMITY, "program.body": 3999 })).toEqual(["program.body"]);
  });
});

describe("A-30 — trasy", () => {
  it("GET /onboarding, PATCH /admin/onboarding z ciałem zmian", async () => {
    api.mockResolvedValue(EKRAN);
    await pobierzEkranStartowy();
    expect(api).toHaveBeenLastCalledWith("/onboarding");
    await zapiszEkranStartowy({ program: { title: "A", body: "B" } });
    expect(api).toHaveBeenLastCalledWith("/admin/onboarding", {
      method: "PATCH",
      body: { program: { title: "A", body: "B" } },
    });
  });
});

describe("A-30 — cialoZapisu", () => {
  it("bez zmian: puste ciało", () => {
    expect(cialoZapisu(EKRAN, formularzZEkranu(EKRAN))).toEqual({});
  });

  it("zmiana jednego pola wysyła całą sekcję, tylko tę jedną", () => {
    const formularz = { ...formularzZEkranu(EKRAN), "program.body": "Nowa treść." };
    expect(cialoZapisu(EKRAN, formularz)).toEqual({
      program: { title: EKRAN.program.title, body: "Nowa treść." },
    });
  });

  it("puste pole adresu i podpisu filmu idzie jako null, pusty tytuł dosłownie", () => {
    const formularz = { ...formularzZEkranu(EKRAN), "video.url": " ", "video.caption": "", "video.title": "" };
    expect(cialoZapisu(EKRAN, formularz)).toEqual({ video: { title: "", url: null, caption: null } });
  });
});

describe("A-30 — błędy, adres filmu, data", () => {
  it("errors 422 z kluczami kropkowanymi rozkłada na pola i resztę", () => {
    expect(
      bledyZOdpowiedzi({ "video.url": ["Podaj poprawny adres URL filmu."], obca: ["Inny błąd."] }),
    ).toEqual({ pola: { "video.url": "Podaj poprawny adres URL filmu." }, pozostale: ["Inny błąd."] });
  });

  it("rodzaj błędu: 401/403 odmowa, 404 brak, 422 walidacja, reszta sieć", () => {
    const blad = (status: number) => new ApiError({ status, code: "x", message: "m" });
    expect(rodzajBledu(blad(401))).toBe("brak-uprawnien");
    expect(rodzajBledu(blad(403))).toBe("brak-uprawnien");
    expect(rodzajBledu(blad(404))).toBe("brak");
    expect(rodzajBledu(blad(422))).toBe("walidacja");
    expect(rodzajBledu(blad(502))).toBe("siec");
    expect(rodzajBledu(new TypeError("Failed to fetch"))).toBe("siec");
  });

  it("adres filmu: tylko http i https", () => {
    expect(adresFilmu("https://example.org/film")).toBe("https://example.org/film");
    expect(adresFilmu("http://example.org/film")).toBe("http://example.org/film");
    expect(adresFilmu("javascript:alert(1)")).toBeNull();
    expect(adresFilmu("ftp://example.org/film")).toBeNull();
    expect(adresFilmu("to nie adres")).toBeNull();
  });

  it("opis ostatniej zmiany: data po polsku w czasie warszawskim albo informacja o treści domyślnej", () => {
    expect(opisOstatniejZmiany("2026-09-30T10:15:00Z")).toBe("Ostatnia zmiana: 30 września 2026, 12:15.");
    expect(opisOstatniejZmiany(null)).toBe("Treść domyślna — jeszcze nie była zmieniana.");
    expect(opisOstatniejZmiany("nie data")).toBe("Nie znamy daty ostatniej zmiany.");
  });
});
