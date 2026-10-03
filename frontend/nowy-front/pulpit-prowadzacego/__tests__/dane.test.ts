import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { kurs, pulpit, pytanie, TERAZ, termin, grupa } from "./atrapy";

const api = vi.fn();
const fetchInstructorQuestions = vi.fn();

vi.mock("@/lib/api/klient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/klient")>()),
  api: (...args: unknown[]) => api(...args),
}));
vi.mock("@/lib/questions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/questions")>()),
  fetchInstructorQuestions: (...args: unknown[]) => fetchInstructorQuestions(...args),
}));

const { ApiError } = await import("@/lib/api/klient");
const dane = await import("../dane");

const KORZEN_REPO = resolve(process.cwd(), "..");

function czytaj(sciezka: string): string {
  return readFileSync(resolve(KORZEN_REPO, sciezka), "utf-8");
}

/** Klucze najwyższego poziomu tablicy zwracanej przez `toArray` zasobu Laravela. */
function kluczeZasobuPhp(sciezka: string): string[] {
  return Array.from(czytaj(sciezka).matchAll(/^ {12}'(\w+)' =>/gm), (dopasowanie) => dopasowanie[1]);
}

function brakujaceKlucze(wymagane: string[], obiekt: Record<string, unknown>): string[] {
  return wymagane.filter((klucz) => !(klucz in obiekt));
}

interface SchematObiektu {
  properties: Record<string, SchematObiektu>;
  required?: string[];
  items?: SchematObiektu;
}

function schematOdpowiedzi(sciezka: string): SchematObiektu {
  const openapi = JSON.parse(czytaj("backend/openapi.json")) as {
    paths: Record<string, Record<string, { responses: Record<string, { content: Record<string, { schema: SchematObiektu }> }> }>>;
  };
  return openapi.paths[sciezka].get.responses["200"].content["application/json"].schema;
}

beforeEach(() => {
  api.mockReset();
  fetchInstructorQuestions.mockReset();
});

describe("klucze atrap zgodne ze schematem", () => {
  it("członek grupy: klucze wymagane w openapi.json (instructor/group) są w atrapie", () => {
    const czlonek = schematOdpowiedzi("/v1/instructor/group").properties.data.properties.members.items!;
    const kluczePostepu = Object.keys(czlonek.properties.progress.properties);
    expect(kluczePostepu.length).toBeGreaterThan(5);
    const atrapa = grupa(1).members[0] as unknown as Record<string, unknown>;
    expect(brakujaceKlucze(czlonek.required ?? [], atrapa)).toEqual([]);
    expect(brakujaceKlucze(kluczePostepu, atrapa.progress as Record<string, unknown>)).toEqual([]);
  });

  it("kurs prowadzącego: klucze wymagane w openapi.json (instructor/courses) są w atrapie", () => {
    const element = schematOdpowiedzi("/v1/instructor/courses").properties.data.items!;
    expect((element.required ?? []).length).toBe(4);
    expect(brakujaceKlucze(element.required ?? [], kurs(2) as unknown as Record<string, unknown>)).toEqual([]);
  });

  it("pytanie: klucze zasobu InstructorQuestionResource.php są w atrapie", () => {
    const klucze = kluczeZasobuPhp("backend/app/Http/Resources/H17/InstructorQuestionResource.php");
    expect(klucze.length).toBeGreaterThan(8);
    expect(brakujaceKlucze(klucze, pytanie(1) as unknown as Record<string, unknown>)).toEqual([]);
  });

  it("termin: klucze zasobu InstructorSlotResource.php (poza supervisor) są w atrapie", () => {
    const klucze = kluczeZasobuPhp("backend/app/Http/Resources/H12/InstructorSlotResource.php").filter((k) => k !== "supervisor");
    expect(klucze.length).toBeGreaterThan(6);
    expect(brakujaceKlucze(klucze, termin(1, "2026-10-05T16:00:00Z") as unknown as Record<string, unknown>)).toEqual([]);
  });

  it("kontrola dodatnia: atrapa bez klucza z zasobu jest wykryta jako czerwień", () => {
    const klucze = kluczeZasobuPhp("backend/app/Http/Resources/H17/InstructorQuestionResource.php");
    const bezKlucza = { ...(pytanie(1) as unknown as Record<string, unknown>) };
    delete bezKlucza.answered_by_name;
    expect(brakujaceKlucze(klucze, bezKlucza)).toEqual(["answered_by_name"]);
  });

  it("nazwa klucza unanswered w meta.extra jest w schemacie skrzynki pytań", () => {
    const meta = schematOdpowiedzi("/v1/instructor/questions").properties.meta;
    expect(Object.keys(meta.properties.extra.properties)).toContain("unanswered");
  });
});

describe("pobierzPulpit", () => {
  function odpowiedzi() {
    fetchInstructorQuestions.mockResolvedValue({
      data: [pytanie(1)],
      meta: { current_page: 1, per_page: 25, total: 1, last_page: 1, extra: { unanswered: 7 } },
    });
    api.mockImplementation((sciezka: string) =>
      sciezka === "/instructor/group" ? Promise.resolve(grupa(2)) : Promise.resolve([kurs(2)]),
    );
  }

  it("woła dokładnie trzy trasy prowadzącego, liczbę pytań bierze z meta.extra.unanswered", async () => {
    odpowiedzi();
    const wynik = await dane.pobierzPulpit();
    expect(fetchInstructorQuestions).toHaveBeenCalledTimes(1);
    expect(fetchInstructorQuestions).toHaveBeenCalledWith({ answered: false });
    expect(api.mock.calls.map((wywolanie) => wywolanie[0]).sort()).toEqual(["/instructor/courses", "/instructor/group"]);
    expect(wynik.pytania).toEqual({ stan: "ok", dane: { liczba: 7, wiersze: [pytanie(1)] } });
  });

  it.each([
    [new ApiError({ status: 403, code: "forbidden", message: "x" }), "zakazane"],
    [new ApiError({ status: 500, code: "server_error", message: "x" }), "blad"],
    [new TypeError("Failed to fetch"), "siec"],
  ])("awaria jednej trasy (%#) nie kasuje pozostałych", async (wyjatek, rodzaj) => {
    odpowiedzi();
    api.mockImplementation((sciezka: string) =>
      sciezka === "/instructor/courses" ? Promise.reject(wyjatek) : Promise.resolve(grupa(1)),
    );
    const wynik = await dane.pobierzPulpit();
    expect(wynik.kursy).toEqual({ stan: "awaria", rodzaj });
    expect(wynik.pytania.stan).toBe("ok");
    expect(wynik.grupa.stan).toBe("ok");
  });
});

describe("wybierzWidok", () => {
  const awaria = (rodzaj: "zakazane" | "siec" | "blad") => ({ stan: "awaria" as const, rodzaj });

  it("trzy odczyty z 403 → zakazany", () => {
    expect(dane.wybierzWidok({ pytania: awaria("zakazane"), grupa: awaria("zakazane"), kursy: awaria("zakazane") }, TERAZ)).toBe("zakazany");
  });
  it("trzy odczyty bez odpowiedzi serwera → awaria; mieszane 403 i sieć też", () => {
    expect(dane.wybierzWidok({ pytania: awaria("siec"), grupa: awaria("siec"), kursy: awaria("siec") }, TERAZ)).toBe("awaria");
    expect(dane.wybierzWidok({ pytania: awaria("zakazane"), grupa: awaria("siec"), kursy: awaria("blad") }, TERAZ)).toBe("awaria");
  });
  it("jedna awaria z trzech → dane (częściowa awaria)", () => {
    expect(dane.wybierzWidok(pulpit({ kursy: awaria("blad") }), TERAZ)).toBe("dane");
  });
  it("zero pytań i brak nadchodzącego terminu, trzy odczyty udane → pusty", () => {
    const pusty = pulpit({
      pytania: { stan: "ok", dane: { liczba: 0, wiersze: [] } },
      grupa: { stan: "ok", dane: grupa(0, [termin(1, "2026-09-01T10:00:00Z")]) },
      kursy: { stan: "ok", dane: [] },
    });
    expect(dane.wybierzWidok(pusty, TERAZ)).toBe("pusty");
  });
  it("zero pytań, ale termin przed nami → dane; pytania są, terminów brak → dane", () => {
    expect(dane.wybierzWidok(pulpit({ pytania: { stan: "ok", dane: { liczba: 0, wiersze: [] } } }), TERAZ)).toBe("dane");
    expect(dane.wybierzWidok(pulpit({ grupa: { stan: "ok", dane: grupa(2) } }), TERAZ)).toBe("dane");
  });
  it("zero pytań przy awarii grupy nie jest „nic do zrobienia” — nie wiadomo, czy są terminy", () => {
    expect(dane.wybierzWidok(pulpit({ pytania: { stan: "ok", dane: { liczba: 0, wiersze: [] } }, grupa: awaria("siec") }), TERAZ)).toBe("dane");
  });
});

describe("pomocnicze", () => {
  it("nadchodzaceTerminy: tylko przyszłe, od najbliższego", () => {
    const wynik = dane.nadchodzaceTerminy(
      [termin(1, "2026-09-01T10:00:00Z"), termin(2, "2026-10-09T10:00:00Z"), termin(3, "2026-10-02T10:00:00Z")],
      TERAZ,
    );
    expect(wynik.map((t) => t.id)).toEqual([3, 2]);
  });
  it("odmien: 1, 2-4, 5+, 12-14, 22", () => {
    const o = (n: number) => dane.odmien(n, "pytanie", "pytania", "pytań");
    expect([0, 1, 2, 4, 5, 12, 14, 22, 25].map(o)).toEqual(["pytań", "pytanie", "pytania", "pytania", "pytań", "pytań", "pytań", "pytania", "pytań"]);
  });
  it("skrocTresc skraca długą treść do jednej linii z wielokropkiem", () => {
    expect(dane.skrocTresc("a\n\nb   c")).toBe("a b c");
    const wynik = dane.skrocTresc("x".repeat(300), 20);
    expect(wynik).toHaveLength(20);
    expect(wynik.endsWith("…")).toBe(true);
  });
  it("zbudujKafle: dokładnie jeden dominujący, cztery kafle, awaria daje kafel bez wartości", () => {
    const kafle = dane.zbudujKafle(pulpit({ kursy: { stan: "awaria", rodzaj: "siec" } }), TERAZ);
    expect(kafle).toHaveLength(4);
    expect(kafle.filter((k) => k.dominujacy)).toHaveLength(1);
    expect(kafle.map((k) => k.wartosc)).toEqual([2, 2, undefined, 5]);
  });

  it("zbudujKafle: czwarty kafel to najbliższa superwizja — dzień z nazwą miesiąca, podpis z godziną, miejscem i zapisami", () => {
    const kafel = dane.zbudujKafle(pulpit(), TERAZ)[3];
    expect(kafel).toMatchObject({
      id: "pulpit-superwizja",
      etykieta: "Najbliższa superwizja",
      wartosc: 5,
      mianownik: "października",
      podpowiedz: "18:00 online · zapisanych 3 z 8 miejsc",
    });
  });

  it("zbudujKafle: bez nadchodzącego terminu kafel nie ma liczby, a podpis mówi, że terminów nie ma; awaria grupy bez podpisu", () => {
    const bez = dane.zbudujKafle(pulpit({ grupa: { stan: "ok", dane: grupa(2, []) } }), TERAZ)[3];
    expect(bez.wartosc).toBeUndefined();
    expect(bez.podpowiedz).toBe("brak zaplanowanych terminów");
    const awaria = dane.zbudujKafle(pulpit({ grupa: { stan: "awaria", rodzaj: "blad" } }), TERAZ)[3];
    expect(awaria.wartosc).toBeUndefined();
    expect(awaria.podpowiedz).toBeUndefined();
  });

  it("podpisTerminuSuperwizji: adres spotkania to „online”, inny tekst miejsca zostaje, brak miejsca bez słowa; liczby z zapisów i limitu", () => {
    const podstawa = termin(7, "2026-10-05T16:00:00Z");
    expect(dane.podpisTerminuSuperwizji({ ...podstawa, active_signups_count: 6 })).toBe("18:00 online · zapisanych 6 z 8 miejsc");
    expect(dane.podpisTerminuSuperwizji({ ...podstawa, location_or_link: "Warszawa, sala 3" })).toBe(
      "18:00 Warszawa, sala 3 · zapisanych 3 z 8 miejsc",
    );
    expect(dane.podpisTerminuSuperwizji({ ...podstawa, location_or_link: null })).toBe("18:00 · zapisanych 3 z 8 miejsc");
    expect(dane.podpisTerminuSuperwizji({ ...podstawa, seats_limit: 1, active_signups_count: 0 })).toBe(
      "18:00 online · zapisanych 0 z 1 miejsca",
    );
  });
});
