import { beforeEach, describe, expect, it, vi } from "vitest";
import { KURS } from "./pomoce";

const apiMock = vi.fn();

vi.mock("@/lib/api/klient", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api/klient")>();
  return { ...original, api: (...args: unknown[]) => apiMock(...args) };
});

const { ApiError } = await import("@/lib/api/klient");
const { kontekstKursu, plikiLekcji, pobierzOdczytKursu } = await import("../kurs");

beforeEach(() => {
  apiMock.mockReset();
});

describe("pobierzOdczytKursu", () => {
  it("odczyt z tematami, lekcjami, plikami i has_test", async () => {
    apiMock.mockResolvedValue({ id: 3, slug: "a", topics: KURS.topics, lessons: KURS.lessons, materials: KURS.materials, has_test: true });

    const kurs = await pobierzOdczytKursu("a");

    expect(apiMock).toHaveBeenCalledWith("/courses/a");
    expect(kurs).toMatchObject({ slug: "a", has_test: true });
    expect(kurs?.lessons).toHaveLength(8);
    expect(kurs?.materials).toHaveLength(3);
  });

  it("odpowiedź sprzed zmiany (bez has_test, mime i tematów): bez błędu, has_test = false", async () => {
    apiMock.mockResolvedValue({ lessons: [{ id: 1, title: "L", sequence_order: 1 }] });

    const kurs = await pobierzOdczytKursu("a");

    expect(kurs).toMatchObject({ slug: "a", topics: [], materials: [], has_test: false });
    expect(kurs?.lessons).toHaveLength(1);
  });

  it.each([
    ["has_test: \"yes\"", { has_test: "yes" }],
    ["has_test: 1", { has_test: 1 }],
    ["has_test: null", { has_test: null }],
  ])("%s nie włącza przejścia do testu", async (_nazwa, odpowiedz) => {
    apiMock.mockResolvedValue({ lessons: [], ...odpowiedz });
    expect((await pobierzOdczytKursu("a"))?.has_test).toBe(false);
  });

  it.each([
    ["403 course_locked", new ApiError({ status: 403, code: "course_locked", message: "Zablokowany." })],
    ["404", new ApiError({ status: 404, code: "not_found", message: "Nie znaleziono." })],
    ["błąd sieci", new TypeError("Failed to fetch")],
  ])("%s → null, bez wyjątku", async (_nazwa, blad) => {
    apiMock.mockRejectedValue(blad);
    expect(await pobierzOdczytKursu("a")).toBeNull();
  });
});

describe("plikiLekcji", () => {
  it("pliki tylko tej lekcji; lekcji spoza kursu → null", () => {
    expect(plikiLekcji(KURS, 21)?.map((p) => p.id)).toEqual([1, 2]);
    expect(plikiLekcji(KURS, 22)?.map((p) => p.id)).toEqual([3]);
    expect(plikiLekcji(KURS, 23)).toEqual([]);
    expect(plikiLekcji(KURS, 999)).toBeNull();
  });
});

describe("kontekstKursu", () => {
  it("lekcja w środku tematu: postęp, segmenty i następna lekcja w tym samym temacie", () => {
    const kontekst = kontekstKursu(KURS, 21, false)!;

    expect(kontekst.temat).toMatchObject({ id: 7, tytul: "Kryzys i jego przebieg", razem: 7, ukonczone: 2, numerBiezacej: 3 });
    expect(kontekst.temat!.segmenty.map((s) => [s.ukonczona, s.biezaca])).toEqual([
      [true, false],
      [true, false],
      [false, true],
      [false, false],
      [false, false],
      [false, false],
      [false, false],
    ]);
    expect(kontekst.nastepna).toEqual({ id: 22, tytul: "Rozmowa, która nie ocenia", numer: 4, czasSekund: 960, nowyTemat: null });
    expect(kontekst.ostatniaWTemacie).toBe(false);
    expect(kontekst.ostatniaWKursie).toBe(false);
  });

  it("po ukończeniu lokalnym bieżąca lekcja liczy się jako ukończona bez ponownego odczytu", () => {
    expect(kontekstKursu(KURS, 21, true)!.temat).toMatchObject({ ukonczone: 3 });
  });

  it("ostatnia lekcja tematu: następna leży w nowym temacie z jego tytułem", () => {
    const kontekst = kontekstKursu(KURS, 25, false)!;

    expect(kontekst.ostatniaWTemacie).toBe(true);
    expect(kontekst.nastepna).toMatchObject({ id: 31, numer: 1, nowyTemat: "Rozmowa z osobą w kryzysie" });
  });

  it("ostatnia lekcja kursu: brak następnej", () => {
    const kontekst = kontekstKursu(KURS, 31, false)!;

    expect(kontekst.nastepna).toBeNull();
    expect(kontekst.ostatniaWKursie).toBe(true);
  });

  it("kolejność wg sequence_order, nie wg kolejności w odpowiedzi", () => {
    const odwrocony = { ...KURS, lessons: [...KURS.lessons].reverse() };
    expect(kontekstKursu(odwrocony, 21, false)!.nastepna?.id).toBe(22);
  });

  it("lekcje bez tematu: brak postępu tematu, następna bez numeru", () => {
    const bezTematu = {
      ...KURS,
      topics: [],
      lessons: KURS.lessons.slice(0, 3).map((l) => ({ ...l, topic_id: null })).concat({ ...KURS.lessons[3], topic_id: null }),
    };
    const kontekst = kontekstKursu(bezTematu, 21, false)!;

    expect(kontekst.temat).toBeNull();
    expect(kontekst.nastepna).toMatchObject({ id: 22, numer: null, nowyTemat: null });
    expect(kontekst.ostatniaWTemacie).toBe(false);
  });

  it("lekcji nie ma w odczycie kursu → null", () => {
    expect(kontekstKursu(KURS, 999, false)).toBeNull();
  });
});
