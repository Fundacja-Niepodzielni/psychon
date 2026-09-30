import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Klient tematów kursu (`lib/api/h08-tematy.ts`) — atrapa na poziomie `fetch`,
 * nie modułu: próba czyta adres, metodę i ciało, z którymi prawdziwy `api()`
 * (`lib/api/klient.ts`) naprawdę woła. Adresy porównywane są z tabelą tras
 * aneksu „tematy kursu”, pkt 2 (`docs/hackathon/02-kontrakt-api.md`
 * w. 1077-1081), w obu grupach tras.
 */

const signOutMock = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("next-auth/react", () => ({ signOut: signOutMock }));

async function swiezyModul() {
  vi.resetModules();
  const tematy = await import("@/lib/api/h08-tematy");
  const klient = await import("@/lib/api/klient");
  return { tematy, klient };
}

function odpowiedzSesji() {
  return {
    ok: true,
    status: 200,
    json: async () => ({ accessToken: "token-test", expiresAt: Date.now() + 600_000 }),
  };
}

function odpowiedzApi(status: number, cialo: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => cialo };
}

function atrapaFetch(status: number, cialo: unknown) {
  const fetchMock = vi.fn(async (adres: RequestInfo | URL) => {
    if (String(adres).includes("/api/auth/session")) return odpowiedzSesji();
    return odpowiedzApi(status, cialo);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function wywolaniaApi(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(
    (wywolanie: unknown[]) => !String(wywolanie[0]).includes("/api/auth/session"),
  ) as [RequestInfo | URL, RequestInit | undefined][];
}

afterEach(() => {
  vi.unstubAllGlobals();
});

type Modul = typeof import("@/lib/api/h08-tematy");

const PRZYPADKI: {
  nazwa: string;
  wywolaj: (m: Modul, grupa: "admin" | "instructor") => Promise<unknown>;
  metoda: string | undefined;
  adres: (grupa: string) => string;
  cialo: unknown;
}[] = [
  {
    nazwa: "lista: GET …/courses/{course}/topics",
    wywolaj: (m, g) => m.pobierzTematy(g, 4),
    metoda: undefined,
    adres: (g) => `/api/v1/${g}/courses/4/topics`,
    cialo: undefined,
  },
  {
    nazwa: "dodanie: POST …/courses/{course}/topics { title }",
    wywolaj: (m, g) => m.dodajTemat(g, 4, "Wprowadzenie"),
    metoda: "POST",
    adres: (g) => `/api/v1/${g}/courses/4/topics`,
    cialo: { title: "Wprowadzenie" },
  },
  {
    nazwa: "zmiana tytułu: PATCH …/topics/{topic} { title }",
    wywolaj: (m, g) => m.zmienTytulTematu(g, 7, "Nowy tytuł"),
    metoda: "PATCH",
    adres: (g) => `/api/v1/${g}/topics/7`,
    cialo: { title: "Nowy tytuł" },
  },
  {
    nazwa: "usunięcie: DELETE …/topics/{topic}",
    wywolaj: (m, g) => m.usunTemat(g, 7),
    metoda: "DELETE",
    adres: (g) => `/api/v1/${g}/topics/7`,
    cialo: undefined,
  },
  {
    nazwa: "układ: PATCH …/courses/{course}/topics/reorder { topics }",
    wywolaj: (m, g) =>
      m.zapiszUkladTematow(g, 4, [
        { id: 8, lesson_ids: [22, 21] },
        { id: 7, lesson_ids: [] },
      ]),
    metoda: "PATCH",
    adres: (g) => `/api/v1/${g}/courses/4/topics/reorder`,
    cialo: {
      topics: [
        { id: 8, lesson_ids: [22, 21] },
        { id: 7, lesson_ids: [] },
      ],
    },
  },
];

describe("h08-tematy — ścieżka, metoda i ciało każdej trasy z aneksu pkt 2", () => {
  for (const grupa of ["admin", "instructor"] as const) {
    for (const przypadek of PRZYPADKI) {
      it(`${grupa}: ${przypadek.nazwa}`, async () => {
        const { tematy } = await swiezyModul();
        const fetchMock = atrapaFetch(200, { data: { id: 1 } });

        await przypadek.wywolaj(tematy, grupa);

        const wolania = wywolaniaApi(fetchMock);
        expect(wolania).toHaveLength(1);
        const [adres, init] = wolania[0];
        expect(new URL(String(adres)).pathname).toBe(przypadek.adres(grupa));
        expect(init?.method).toBe(przypadek.metoda);
        if (przypadek.cialo === undefined) {
          expect(init?.body).toBeUndefined();
        } else {
          expect(JSON.parse(String(init?.body))).toEqual(przypadek.cialo);
        }
      });
    }
  }

  it("lista zwraca `data` z koperty — tablicę zasobów Topic", async () => {
    const { tematy } = await swiezyModul();
    const temat = {
      id: 7,
      course_id: 4,
      title: "Lekcje kursu",
      position: 1,
      lesson_ids: [21, 22],
      created_at: "2026-09-28T10:00:00Z",
      updated_at: "2026-09-28T10:00:00Z",
    };
    atrapaFetch(200, { data: [temat] });

    await expect(tematy.pobierzTematy("instructor", 4)).resolves.toEqual([temat]);
  });
});

describe("h08-tematy — obsługa 422", () => {
  it("usunięcie tematu z lekcjami: 422 conditions_not_met → ApiError z kodem i zdaniem dla osoby", async () => {
    const { tematy, klient } = await swiezyModul();
    atrapaFetch(422, {
      error: { status: 422, code: "conditions_not_met", message: "Temat ma lekcje." },
    });

    const blad = await tematy.usunTemat("instructor", 7).catch((e: unknown) => e);

    expect(blad).toBeInstanceOf(klient.ApiError);
    expect((blad as InstanceType<typeof klient.ApiError>).code).toBe("conditions_not_met");
    expect((blad as InstanceType<typeof klient.ApiError>).status).toBe(422);
    expect(tematy.zdanieBleduTematow(blad)).toBe(
      "Tego tematu nie można usunąć, bo ma lekcje. Przenieś je najpierw do innego tematu.",
    );
  });

  it("układ niepełny: 422 validation_failed → pierwszy komunikat z `errors`", async () => {
    const { tematy, klient } = await swiezyModul();
    atrapaFetch(422, {
      error: {
        status: 422,
        code: "validation_failed",
        message: "Popraw zaznaczone pola.",
        errors: { topics: ["Układ musi obejmować wszystkie lekcje kursu."] },
      },
    });

    const blad = await tematy.zapiszUkladTematow("instructor", 4, [{ id: 7, lesson_ids: [] }]).catch((e: unknown) => e);

    expect(blad).toBeInstanceOf(klient.ApiError);
    expect((blad as InstanceType<typeof klient.ApiError>).code).toBe("validation_failed");
    expect(tematy.zdanieBleduTematow(blad)).toBe("Układ musi obejmować wszystkie lekcje kursu.");
  });

  it("validation_failed bez `errors` → `message` serwera", async () => {
    const { tematy } = await swiezyModul();
    atrapaFetch(422, {
      error: { status: 422, code: "validation_failed", message: "Popraw zaznaczone pola." },
    });

    const blad = await tematy.dodajTemat("admin", 4, "").catch((e: unknown) => e);

    expect(tematy.zdanieBleduTematow(blad)).toBe("Popraw zaznaczone pola.");
  });

  it("błąd spoza koperty API → zdanie ogólne, bez wyjątku", async () => {
    const { tematy } = await swiezyModul();
    expect(tematy.zdanieBleduTematow(new TypeError("Failed to fetch"))).toBe(
      "Nie udało się połączyć z serwerem. Spróbuj ponownie za chwilę.",
    );
  });
});
